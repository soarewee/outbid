import { catalog } from "./catalog.mjs";

// The vendors and their bidding agents. Each vendor has a profile only it knows (a list price, a floor
// it won't sell below, how much it wants the deal) and an agent that reads the anonymous intent, opens
// with a bid, and decides round by round whether to undercut the best competing bid or stop.
// The agent's judgement is a model's (src/model.mjs, `vendorMove`) when a key is set, and a fixed
// strategy otherwise. Either way the limits are code: a bid never goes under the vendor's floor or over
// its list price, whatever the agent says.
// Orbit and Harbor bid when the intent is posted. Summit sells only prepaid years and comes in later, so
// the purchase itself is a plain price fight and the reserve only matters once a prepay is on the table.
// A vendor has a price list, one entry per category it sells (data/catalog.json names the categories), and
// bids on any intent for something on that list. Prices are per unit per billing period, so a bid follows
// the quantity the buyer asked for (2 GPUs give the demo's numbers; the sandbox caps a card's
// per-transaction limit at $50,000).
// A bid also says what leaving early costs (`exit`): the price of breaking the commitment, agreed before
// the auction closes. A vendor that is a known merchant brand at Airwallex bids with that brand's id
// (`merchantBrand`), and the card is then bound to that brand, not only to its merchant category. The
// demo's three vendors are fictional, so they have none. They stand in for vendor-run agents; the auction only sees the bids they return.

const vendors = [
  {
    name: "Vendor A",
    currency: "USD",
    billing: "monthly",
    // No commitment: the buyer can leave at any time and owes nothing.
    exitPeriods: 0,
    commitment: "billed monthly, cancel any time",
    hike: 1650 / 1350,
    sells: {
      "gpu-h100": { listPerUnit: 1700, floorPerUnit: 1560, situation: "A US GPU cloud running close to full. You would like this customer, but your GPUs sell anyway, so you protect your margin and stop early rather than chase." },
      "design-seats": { listPerUnit: 18, floorPerUnit: 14.5, situation: "A US software reseller with thin margins on seats. You would like this customer, but not at a loss, so you stop early rather than chase." },
    },
  },
  {
    name: "Vendor B",
    currency: "EUR",
    billing: "monthly",
    // A 12-month commitment: leaving early costs one month's price.
    exitPeriods: 1,
    commitment: "billed monthly in EUR, 12-month commitment: leaving early costs one month's price",
    hike: 1440 / 1180,
    sells: {
      "gpu-h100": { listPerUnit: 1480, floorPerUnit: 1300, situation: "A European GPU cloud with idle H100s in Frankfurt. An idle GPU earns nothing, so winning a year of usage matters more to you than margin." },
      "design-seats": { listPerUnit: 16, floorPerUnit: 12, situation: "A European reseller that wants to grow its seat count this quarter, so winning a year of seats matters more to you than margin." },
    },
  },
  {
    name: "Vendor C",
    currency: "USD",
    billing: "annual",
    exitPeriods: 0,
    commitment: "12 months prepaid up front, no refund",
    later: true,
    hike: 1,
    sells: {
      "gpu-h100": { listPerUnit: 16250, floorPerUnit: 16250, situation: "A GPU cloud that sells only prepaid years at one fixed price." },
      "design-seats": { listPerUnit: 150, floorPerUnit: 150, situation: "A reseller that sells only prepaid years at one fixed price." },
    },
  },
];

// A vendor's price list entry for what the intent asks for, or undefined when it doesn't sell it.
const offerFor = (vendor, category) => vendor.sells[category];
const termsOf = (vendor, category, n) => `${n}× ${catalog[category]?.item ?? category}, ${vendor.commitment}.`;

const byName = (name) => vendors.find((v) => v.name === name);
const cents = (n) => Math.round(n * 100) / 100;
const floorCents = (n) => Math.floor(n * 100) / 100;

export const vendorNames = vendors.map((v) => v.name);
// The vendors that bid when the intent is posted.
export const bidderNames = vendors.filter((v) => !v.later).map((v) => v.name);
export const laterNames = vendors.filter((v) => v.later).map((v) => v.name);

// A vendor's bid at a price per unit: the terms, and what leaving early would cost at that price.
function bidAt(vendor, intent, perUnit, extra = {}) {
  const amount = cents(perUnit * intent.quantity);
  return {
    vendor: vendor.name,
    category: intent.category,
    merchantCategory: catalog[intent.category]?.merchantCategory ?? intent.merchantCategory,
    price: { amount, currency: vendor.currency },
    billing: vendor.billing,
    terms: termsOf(vendor, intent.category, intent.quantity),
    quantity: intent.quantity,
    exit: vendor.exitPeriods ? { amount: cents(amount * vendor.exitPeriods), currency: vendor.currency, periods: vendor.exitPeriods } : null,
    merchantBrand: vendor.merchantBrand ?? null,
    ...extra,
  };
}

// The fixed strategy, used when no model is set and in tests: open at list, then undercut the price to
// beat by 1.5% while that stays above the floor (the code clamps it), and stop when it can't go lower.
// `vendor` here is the profile an agent is shown: its list price and floor for what the intent asks for.
export function scripted({ vendor, toBeat }) {
  if (toBeat == null) return { action: "bid", pricePerUnit: vendor.listPerUnit, message: "", reasoning: "Opening at list price." };
  return { action: "bid", pricePerUnit: Math.floor(toBeat * 0.985), message: "", reasoning: "Undercutting the best bid while it stays above the floor." };
}

// A vendor's bidding agent. `think` is the judgement (a model call or `scripted`); it is shown the
// vendor's private profile for what the intent asks for and the price to beat, and answers with a move.
// The limits here are code.
export function vendorAgent(name, { think = scripted } = {}) {
  const vendor = byName(name);
  const profile = (intent) => {
    const offer = offerFor(vendor, intent.category);
    return { name: vendor.name, currency: vendor.currency, billing: vendor.billing, listPerUnit: offer.listPerUnit, floorPerUnit: offer.floorPerUnit, situation: offer.situation, terms: termsOf(vendor, intent.category, intent.quantity) };
  };
  // Turns the agent's answer into a bid, or null when it passes, can't legally go lower, or doesn't sell this.
  async function move(intent, { toBeat = null, current = null, history = [] } = {}) {
    const offer = offerFor(vendor, intent.category);
    if (!offer) return { bid: null, message: "", reasoning: "We don't sell this.", model: null };
    const shown = profile(intent);
    let answer;
    try {
      answer = (await think({ vendor: shown, intent, toBeat, current, history })) ?? scripted({ vendor: shown, toBeat });
    } catch {
      // A vendor whose model is down still bids, on the fixed strategy.
      answer = scripted({ vendor: shown, toBeat });
    }
    const said = { message: String(answer.message ?? "").slice(0, 160), reasoning: String(answer.reasoning ?? "").slice(0, 240), model: answer.model ?? null };
    if (answer.action !== "bid" || !(answer.pricePerUnit > 0)) return { bid: null, ...said };
    // Never under the floor, never over list; and in a later round, strictly under the price to beat.
    const perUnit = cents(Math.min(offer.listPerUnit, Math.max(offer.floorPerUnit, answer.pricePerUnit)));
    if (toBeat != null && perUnit >= toBeat) return { bid: null, ...said };
    return { bid: bidAt(vendor, intent, perUnit), ...said };
  }
  return { name, sells: (intent) => Boolean(offerFor(vendor, intent.category)), billing: vendor.billing, currency: vendor.currency, move };
}

// One bid from each vendor that sells what the intent asks for, at its list price, with no bidding between
// them: what the auction command and the tests use.
export const collectBids = async (intent) => listBids(vendors.filter((v) => !v.later), intent);
// The offers that come in months later, on the same intent.
export const laterBids = async (intent) => listBids(vendors.filter((v) => v.later), intent);
const listBids = (list, intent) => list.filter((v) => offerFor(v, intent.category)).map((v) => bidAt(v, intent, offerFor(v, intent.category).listPerUnit));

// The incumbent's bid at renewal: same terms, the new price.
export function renewalBid(bid) {
  const vendor = byName(bid.vendor);
  const amount = cents(bid.price.amount * vendor.hike);
  return { ...bid, price: { amount, currency: bid.price.currency }, exit: bid.exit ? { ...bid.exit, amount: cents(amount * bid.exit.periods) } : null, terms: `Renewal of: ${bid.terms}` };
}

// Shown a competing price per billing period in its own currency, the incumbent's agent matches it if it
// can stay at or above its floor, or passes (null). A match is exactly the offer: the incumbent keeps the
// deal on a tie, since staying costs no switch.
export async function askToMatch(bid, offer, { think = scripted } = {}) {
  const vendor = byName(bid.vendor);
  const mine = offerFor(vendor, bid.category);
  if (!mine) return null;
  const quantity = bid.quantity ?? 1;
  const floor = cents(mine.floorPerUnit * quantity);
  if (offer.currency !== vendor.currency || offer.amount < floor) return null;
  let answer = { action: "bid" };
  if (think !== scripted) {
    try {
      answer = (await think({ vendor: { name: vendor.name, currency: vendor.currency, billing: vendor.billing, listPerUnit: mine.listPerUnit, floorPerUnit: mine.floorPerUnit, situation: mine.situation, terms: bid.terms }, intent: { category: bid.category, quantity }, match: floorCents(offer.amount / quantity), current: cents(bid.price.amount / quantity), history: [] })) ?? answer;
    } catch {}
  }
  if (answer.action !== "bid") return null;
  return { ...bid, price: { amount: offer.amount, currency: offer.currency }, exit: bid.exit ? { ...bid.exit, amount: cents(offer.amount * bid.exit.periods) } : null, terms: `Matched: ${bid.terms.replace(/^Renewal of: /, "")}`, message: String(answer.message ?? "").slice(0, 160), reasoning: String(answer.reasoning ?? "").slice(0, 240) };
}
