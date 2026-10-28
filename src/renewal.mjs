// Renewal: the incumbent's new price goes back into a fresh auction. If a competitor now wins, the
// incumbent is shown that price and can match it; a match wins ties, since staying costs no switch.
import { decide } from "./auction.mjs";
import { askToMatch, collectBids, renewalBid } from "./vendors.mjs";

const floor2 = (n) => Math.floor(n * 100) / 100;

export async function reauction({ intent, company, cash, rate, incumbent }) {
  const hiked = renewalBid(incumbent);
  const others = (await collectBids(intent)).filter((b) => b.vendor !== incumbent.vendor);
  const opened = await decide({ intent, company, cash, bids: [hiked, ...others], rate });
  const best = opened.winner;
  if (!best || best.vendor === incumbent.vendor) return { hiked, opened, offer: null, matched: null, result: opened };

  // The competitor's cost per billing period of the incumbent's plan, in the incumbent's currency,
  // rounded down so a match is never a cent dearer after conversion.
  const months = incumbent.billing === "annual" ? 12 : 1;
  const toIncumbent = await rate(company.currency, incumbent.price.currency);
  const offer = { from: best.vendor, amount: floor2(best.perMonth * months * toIncumbent), currency: incumbent.price.currency };
  const matched = await askToMatch(incumbent, offer);
  const result = matched ? await decide({ intent, company, cash, bids: [matched, ...others], rate }) : opened;
  return { hiked, opened, offer, matched, result };
}
