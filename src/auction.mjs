// The decision: rank bids by total cost over the term, then take the cheapest one that keeps
// projected cash above the reserve floor. Ranking, budget and reserve are plain code; nothing here
// depends on a model.
import { round2 } from "./fx.mjs";

const DAY = 24 * 60 * 60 * 1000;

// Payments a bid would make, as day offsets from today, in the bid's own currency.
export function paymentSchedule(bid, termMonths) {
  if (bid.billing === "annual") {
    return Array.from({ length: Math.ceil(termMonths / 12) }, (_, i) => ({ day: i * 365, amount: bid.price.amount }));
  }
  return Array.from({ length: termMonths }, (_, i) => ({ day: i * 30, amount: bid.price.amount }));
}

export async function priceBids(bids, intent, currency, rate) {
  const priced = [];
  for (const bid of bids) {
    const fx = await rate(bid.price.currency, currency);
    const schedule = paymentSchedule(bid, intent.termMonths).map((p) => ({ day: p.day, amount: round2(p.amount * fx) }));
    const total = round2(schedule.reduce((sum, p) => sum + p.amount, 0));
    priced.push({ ...bid, fx, schedule, total, perMonth: round2(total / intent.termMonths) });
  }
  return priced.sort((a, b) => a.total - b.total);
}

// Expands recurring obligations into dated payments inside the horizon.
export function obligationSchedule(obligations, horizonDays) {
  const out = [];
  for (const o of obligations) {
    for (let day = o.firstDay; day <= horizonDays; day += o.everyDays ?? Infinity) {
      out.push({ day, amount: o.amount, label: o.label });
      if (!o.everyDays) break;
    }
  }
  return out;
}

// Walks cash forward day by day and returns the first day it drops below the floor, if any, with the
// whole path (one balance per day) so the decision can be drawn.
export function projectCash({ cash, floor, horizonDays, outflows }) {
  const byDay = new Map();
  for (const o of outflows) if (o.day <= horizonDays) byDay.set(o.day, (byDay.get(o.day) ?? 0) + o.amount);
  let balance = cash;
  let low = { day: 0, balance: cash };
  const path = [];
  let breach = null;
  for (let day = 0; day <= horizonDays; day++) {
    balance = round2(balance - (byDay.get(day) ?? 0));
    path.push(balance);
    if (balance < low.balance) low = { day, balance };
    if (balance < floor && !breach) breach = { breachDay: day, balance };
  }
  return breach ? { ok: false, ...breach, low, path } : { ok: true, low, path };
}

export async function decide({ intent, company, cash, bids, rate, today = new Date() }) {
  const { reserveFloor: floor, horizonDays, reconsiderAfterMonths } = company.policy;
  const obligations = obligationSchedule(company.obligations, horizonDays);
  const ranked = await priceBids(bids, intent, company.currency, rate);
  const budget = intent.budget.amount * (await rate(intent.budget.currency, company.currency));

  const evaluated = ranked.map((bid) => {
    if (bid.perMonth > budget) return { ...bid, verdict: "over-budget" };
    const cashPath = projectCash({ cash, floor, horizonDays, outflows: [...obligations, ...bid.schedule] });
    return { ...bid, cashPath, verdict: cashPath.ok ? "fits" : "breaks-reserve" };
  });

  const winner = evaluated.find((b) => b.verdict === "fits") ?? null;
  const passedOver = winner ? evaluated.slice(0, evaluated.indexOf(winner)) : evaluated;
  // Come back to a cheaper bid we passed over, either at a fixed date or once cash would carry it.
  const reconsider = winner && passedOver.some((b) => b.verdict === "breaks-reserve")
    ? {
        at: new Date(today.getTime() + reconsiderAfterMonths * 30 * DAY).toISOString().slice(0, 10),
        orWhen: `cash keeps ${company.currency} ${floor} through the horizon with ${passedOver[0].vendor}'s bid`,
        candidate: passedOver[0].vendor,
      }
    : null;

  return { cash, floor, budget: round2(budget), ranked: evaluated, winner, passedOver, reconsider };
}
