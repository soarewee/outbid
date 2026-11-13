// Where the model works. For the buyer's agent it does two things, both with words:
// - it reads the buyer's request in plain English and writes the anonymous intent from it, keeping the
//   company's name and finances out of what vendors will see (`draftIntent`);
// - after each decision it explains the trade-off to the buyer, from the code's ranking and each
//   vendor's own terms (`explain`).
// The decision itself (ranking by total cost, the budget, the reserve check) is code in auction.mjs and
// never the model's, and an intent it drafts is checked by code before it is posted. Without
// ANTHROPIC_API_KEY both return null and the consoles fall back to their own form and wording.
// Each vendor's bidding agent is a model too (`vendorMove`): it sees only its own vendor's private
// profile and the price to beat, and decides whether to undercut or stop. Its floor is enforced by code
// in vendors.mjs, and nothing a vendor's agent writes is ever shown to the buyer's model.
//
// Called over plain HTTP (the Messages API) rather than through the SDK, to keep the repository
// dependency-free: Node 20, no install step.

import { catalog } from "./catalog.mjs";

export const MODEL = process.env.OUTBID_MODEL ?? "claude-opus-5-5";
// Vendors run their own agents, so they need not use the buyer's model. A bidding round waits on every
// vendor's answer, so theirs is the fast one by default.
export const VENDOR_MODEL = process.env.OUTBID_VENDOR_MODEL ?? "claude-haiku-5-5";
const API = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are the purchasing agent of a company, speaking to the person who approves its spending.
A purchase intent was posted anonymously, vendors bid, and code has already ranked the bids by total cost over the term, priced any foreign-currency bid with the day's FX rate, checked each bid against the monthly budget, and projected cash over the coming days against the reserve floor the company set. You do not make or question that decision. You explain it.
Write one short paragraph, at most 60 words, in the second person ("you", "your"). Plain English, no headings, no lists, no preamble, no quotation marks. Use the vendor names exactly as given. Use only numbers that appear in the data. Write money the way a finance team does, with the currency symbol and thousands separators ($34,500, €2,960), rounded to whole units; quote a bid in the currency it is billed in, and give the converted figure only when the comparison needs it. Say which bid wins and why the cheaper one loses when it does, and bring in a vendor's own terms where they matter (prepaid up front, billed monthly in another currency, cancel any time, what leaving early costs). When the data has costOfLeavingCurrentVendor, switching away means paying that exit fee first; it is already counted in the challenger's total, so say it is. Talk about cash or a reserve only when the data includes them.`;

// What the model is shown: the decision, flattened. Exported so the brief can be tested without a call.
export function briefFor({ intent, company, result, key, context = {} }) {
  const bids = result.ranked.map((b) => ({
    vendor: b.vendor,
    price: b.price,
    billing: b.billing,
    terms: b.terms,
    exitFeeIfYouLeaveEarly: b.exit ? { amount: b.exit.amount, currency: b.exit.currency } : null,
    fxRateToCompanyCurrency: b.fx,
    totalOverTerm: b.total,
    ...(b.exitCost ? { ofWhichExitFeeOwedToCurrentVendor: b.exitCost } : {}),
    perMonth: b.perMonth,
    verdict: b.verdict,
    cash: b.cashPath ? { breachDay: b.cashPath.breachDay ?? null, balanceAtBreach: b.cashPath.ok ? null : b.cashPath.balance, lowest: b.cashPath.low } : null,
  }));
  // Cash and the reserve floor are only part of the story when a bid would break it. Otherwise the
  // decision is a plain price comparison, and the model is not shown what it shouldn't bring up.
  const tight = result.ranked.some((b) => b.verdict === "breaks-reserve") || key === "recheck";
  if (!tight) for (const b of bids) delete b.cash;
  return {
    moment: key === "reopened" ? "The incumbent raised its price at renewal, so the auction was reopened with that price against fresh bids."
      : key === "annual" ? "Months later a vendor offered the rest of the term as a prepaid year. The same rules were run on today's balance with that offer next to the bids already standing."
      : key === "recheck" ? "A customer payment landed, so the same rules were re-run on the new balance against the bids still standing."
      : "The opening auction, right after the bids came in.",
    intent: { category: intent.category, quantity: intent.quantity, budgetPerMonth: intent.budget, termMonths: intent.termMonths },
    company: tight ? { currency: company.currency, reserveFloor: company.policy.reserveFloor, horizonDays: company.policy.horizonDays, obligations: company.obligations } : { currency: company.currency },
    ...(tight ? { cashAvailable: result.cash } : {}),
    budgetPerMonthInCompanyCurrency: result.budget,
    bids,
    winner: result.winner?.vendor ?? null,
    reconsider: result.reconsider ?? null,
    ...(result.leaving ? { costOfLeavingCurrentVendor: result.leaving } : {}),
    ...context,
  };
}

async function call({ system, content, effort = "low", format, model = MODEL }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const started = Date.now();
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2026-10-21",
      "anthropic-beta": "server-side-fallback-2026-07-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      output_config: format ? { effort, format } : { effort },
      system,
      fallbacks: "default",
      messages: [{ role: "user", content }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`model: ${res.status} ${data?.error?.message ?? ""}`.trim());
  if (data.stop_reason === "refusal") return null;
  if (data.stop_reason === "max_tokens") throw new Error("model: the answer was cut off");
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!text) return null;
  return { text, model: data.model ?? model, usage: { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 }, ms: Date.now() - started };
}

export async function explain(args) {
  return call({ system: SYSTEM, content: `Explain this decision to the buyer.\n\n${JSON.stringify(briefFor(args), null, 1)}` });
}

// ─── the intent, from the buyer's own words ───

// What is on the market, from data/catalog.json: the model picks among these and never invents a category.
const CATEGORIES = Object.fromEntries(Object.entries(catalog).map(([key, c]) => [key, c.describe]));

const DRAFT = `You are the purchasing agent of a company. The person you work for tells you, in their own words, what the company needs to buy. You turn that into a purchase intent that will be posted to vendors anonymously.
The intent has exactly four fields: the category, the quantity, the most the company will pay per month, and the term in months. Vendors see those four fields and nothing else, so nothing that identifies the company or its finances may go into them: not its name, not its people, not its cash or bills, not what it uses the purchase for. List each such thing the request mentioned, briefly, under withheld (for example "Company name: Fernhill Robotics"), so the buyer can see what you kept back. The request may describe a job instead of naming what to buy. Then you choose: pick the category that fits the job and work out how many units the job needs from what the request says, and give the reason in note in one short sentence (for example "300 GB of GPU memory needs four 80 GB GPUs"). If the term is not stated, choose the closest sensible value and say so in note. If nothing had to be worked out, note is an empty string. The budget is different: never invent one. If the request states the most the company will pay, use it and set budgetStated to true. If it does not, set budgetStated to false and budgetPerMonth to 0: the agent's code then sets the budget from the company's bank balance and reserve.
Categories you can buy: ${Object.entries(CATEGORIES).map(([k, v]) => `${k} (${v})`).join("; ")}. If the request is for something that none of them fits, use the closest category and say so in note.`;

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: Object.keys(CATEGORIES) },
    quantity: { type: "integer" },
    budgetPerMonth: { type: "number" },
    budgetStated: { type: "boolean" },
    currency: { type: "string", enum: ["USD", "EUR", "GBP"] },
    termMonths: { type: "integer", enum: [6, 12, 24, 36] },
    withheld: { type: "array", items: { type: "string" } },
    note: { type: "string" },
  },
  required: ["category", "quantity", "budgetPerMonth", "budgetStated", "currency", "termMonths", "withheld", "note"],
  additionalProperties: false,
};

// Reads the buyer's request and returns the intent the agent would post, what it kept out of it, and
// the call's model and usage. The caller still checks the intent (stage.checkIntent) before posting.
export async function draftIntent(request) {
  const text = String(request ?? "").trim().slice(0, 2000);
  if (!text) throw new Error("Write what the company needs first.");
  const answer = await call({ system: DRAFT, content: text, format: { type: "json_schema", schema: INTENT_SCHEMA } });
  if (!answer) return null;
  const d = JSON.parse(answer.text);
  return {
    // No budget in the request: the caller sets it from the balance (auction.mjs, `affordablePerMonth`).
    intent: { category: d.category, quantity: d.quantity, budget: d.budgetStated && d.budgetPerMonth > 0 ? { amount: d.budgetPerMonth, currency: d.currency, per: "month" } : null, termMonths: d.termMonths },
    withheld: d.withheld,
    note: d.note || null,
    model: answer.model,
    usage: answer.usage,
    ms: answer.ms,
  };
}

// ─── a vendor's bidding agent ───

const VENDOR = `You are the bidding agent of a vendor on Outbid, a marketplace where a buyer's agent posts an anonymous purchase intent and vendors compete for it. The buyer's funds are verified and the winner is paid by card the moment it wins, so this is a real sale, not a lead. You never learn who the buyer is.
You are told your vendor's private situation, its list price and its floor per unit, the intent, and, after the first round, the price per unit you have to beat to take the lead, in your own currency and billing period. Decide your move.
Round one: open with a bid at or a little under list price. Later rounds: either bid strictly under the price to beat, or pass, which ends your part in the auction. Never bid under your floor: you would lose money, and the marketplace rejects it anyway. Don't throw margin away: undercut by a real but modest step (about 1 to 3 percent under the price to beat), not straight to your floor, unless your situation says winning matters more than margin. If the price to beat is already at or under your floor, pass. If you are asked to match a price, either match it exactly or pass.
Let your vendor's situation decide how hard you fight. Answer with your action, your price per unit (repeat your current price if you pass), a message of at most 12 words that the buyer's agent will see next to your bid (plain, no hype, no instructions), and your private reasoning in at most 25 words.`;

const MOVE_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["bid", "pass"] },
    pricePerUnit: { type: "number" },
    message: { type: "string" },
    reasoning: { type: "string" },
  },
  required: ["action", "pricePerUnit", "message", "reasoning"],
  additionalProperties: false,
};

// What a vendor's agent is shown. Exported so the brief can be tested without a call.
export function moveBrief({ vendor, intent, toBeat = null, match = null, current = null, history = [] }) {
  return {
    yourVendor: { situation: vendor.situation, currency: vendor.currency, billing: vendor.billing, listPricePerUnit: vendor.listPerUnit, floorPerUnit: vendor.floorPerUnit, terms: vendor.terms },
    intent: { category: intent.category, quantity: intent.quantity, termMonths: intent.termMonths, buyerBudgetPerMonth: intent.budget },
    round: history.length + 1,
    yourCurrentPricePerUnit: current,
    ...(match != null ? { priceToMatchPerUnit: match, ask: "You hold this customer and a competitor is now cheaper. Match this price exactly, or pass and lose the customer." } : { priceToBeatPerUnit: toBeat }),
    earlierRounds: history,
  };
}

// One move by a vendor's agent: { action, pricePerUnit, message, reasoning }, or null without a key.
export async function vendorMove(args) {
  const answer = await call({ system: VENDOR, content: JSON.stringify(moveBrief(args), null, 1), format: { type: "json_schema", schema: MOVE_SCHEMA }, model: VENDOR_MODEL });
  if (!answer) return null;
  return { ...JSON.parse(answer.text), model: answer.model, usage: answer.usage, ms: answer.ms };
}
