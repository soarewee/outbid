// Vendor bidding agents. Each one reads the anonymous intent and answers with a bid, or null to pass.
// At renewal the incumbent quotes its new price, and when the auction reopens it is shown the best
// competing offer and either matches it or lets the company switch.
// They stand in for vendor-run agents; the auction only sees the bids they return.

const vendors = [
  {
    name: "Vendor A",
    bid: (intent) =>
      intent.category === "design-tool" && {
        price: { amount: 1350, currency: "USD" },
        billing: "monthly",
        terms: "10 seats, billed monthly, cancel any time.",
      },
    renewal: { amount: 1650, currency: "USD" },
    // Matches any competing monthly cost down to its floor.
    floor: { amount: 1250, currency: "USD" },
  },
  {
    name: "Vendor B",
    bid: (intent) =>
      intent.category === "design-tool" && {
        price: { amount: 1180, currency: "EUR" },
        billing: "monthly",
        terms: "10 seats, billed monthly in EUR.",
      },
    renewal: { amount: 1440, currency: "EUR" },
    floor: { amount: 1100, currency: "EUR" },
  },
  {
    name: "Vendor C",
    bid: (intent) =>
      intent.category === "design-tool" && {
        price: { amount: 13800, currency: "USD" },
        billing: "annual",
        terms: "10 seats, 12 months prepaid up front.",
      },
    renewal: { amount: 13800, currency: "USD" },
    floor: { amount: 13800, currency: "USD" },
  },
];

const byName = (name) => vendors.find((v) => v.name === name);

export async function collectBids(intent) {
  const bids = [];
  for (const vendor of vendors) {
    const bid = await vendor.bid(intent);
    if (bid) bids.push({ vendor: vendor.name, merchantCategory: intent.merchantCategory, ...bid });
  }
  return bids;
}

// The incumbent's bid at renewal: same terms, the new price.
export function renewalBid(bid) {
  return { ...bid, price: byName(bid.vendor).renewal, terms: `Renewal of: ${bid.terms}` };
}

// Shown a competing price per billing period in its own currency, the incumbent matches it if it can
// stay at or above its floor, or passes (null).
export async function askToMatch(bid, offer) {
  const { floor } = byName(bid.vendor);
  if (offer.currency !== floor.currency || offer.amount < floor.amount) return null;
  return { ...bid, price: { amount: offer.amount, currency: offer.currency }, terms: `Matched: ${bid.terms}` };
}
