// Vendor bidding agents. Each one reads the anonymous intent and answers with a bid, or null to pass.
// Orbit and Harbor bid on the intent when it is posted. Summit sells only prepaid years and comes in
// later, so the purchase itself is a plain comparison and the reserve only matters once a prepay is
// on the table.
// Prices are per GPU per billing period, so the bid follows the quantity the buyer asked for (2 GPUs
// give the demo's numbers; the sandbox caps a card's per-transaction limit at $50,000). At renewal the incumbent quotes its new price, and when the auction reopens it is shown
// the best competing offer and either matches it or lets the company switch.
// They stand in for vendor-run agents; the auction only sees the bids they return.

const vendors = [
  {
    name: "Vendor A",
    sells: ["gpu-h100"],
    perUnit: { amount: 1700, currency: "USD" },
    billing: "monthly",
    terms: (n) => `${n}× H100 80GB, reserved, billed monthly, cancel any time.`,
    hike: 1650 / 1350,
    // Matches any competing monthly cost down to its floor, per GPU.
    floorPerUnit: 1560,
  },
  {
    name: "Vendor B",
    sells: ["gpu-h100"],
    perUnit: { amount: 1480, currency: "EUR" },
    billing: "monthly",
    terms: (n) => `${n}× H100 80GB, reserved, billed monthly in EUR.`,
    hike: 1440 / 1180,
    floorPerUnit: 1380,
  },
  {
    name: "Vendor C",
    sells: ["gpu-h100"],
    perUnit: { amount: 17250, currency: "USD" },
    billing: "annual",
    terms: (n) => `${n}× H100 80GB, reserved, 12 months prepaid up front.`,
    later: true,
    hike: 1,
    floorPerUnit: 17250,
  },
];

const byName = (name) => vendors.find((v) => v.name === name);
const cents = (n) => Math.round(n * 100) / 100;
const priceFor = (vendor, quantity) => ({ amount: cents(vendor.perUnit.amount * quantity), currency: vendor.perUnit.currency });

export const vendorNames = vendors.map((v) => v.name);
// The vendors that bid when the intent is posted.
export const bidderNames = vendors.filter((v) => !v.later).map((v) => v.name);

// The bids that answer the intent when it is posted.
export const collectBids = (intent) => bidsFrom(vendors.filter((v) => !v.later), intent);
// The offers that come in months later, on the same intent.
export const laterBids = (intent) => bidsFrom(vendors.filter((v) => v.later), intent);

async function bidsFrom(list, intent) {
  const bids = [];
  for (const vendor of list) {
    if (!vendor.sells.includes(intent.category)) continue;
    bids.push({
      vendor: vendor.name,
      merchantCategory: intent.merchantCategory,
      price: priceFor(vendor, intent.quantity),
      billing: vendor.billing,
      terms: vendor.terms(intent.quantity),
      quantity: intent.quantity,
    });
  }
  return bids;
}

// The incumbent's bid at renewal: same terms, the new price.
export function renewalBid(bid) {
  const vendor = byName(bid.vendor);
  return { ...bid, price: { amount: cents(bid.price.amount * vendor.hike), currency: bid.price.currency }, terms: `Renewal of: ${bid.terms}` };
}

// Shown a competing price per billing period in its own currency, the incumbent matches it if it can
// stay at or above its floor, or passes (null).
export async function askToMatch(bid, offer) {
  const vendor = byName(bid.vendor);
  const floor = cents(vendor.floorPerUnit * (bid.quantity ?? 2));
  if (offer.currency !== vendor.perUnit.currency || offer.amount < floor) return null;
  return { ...bid, price: { amount: offer.amount, currency: offer.currency }, terms: `Matched: ${bid.terms}` };
}
