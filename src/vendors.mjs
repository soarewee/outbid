// Vendor bidding agents. Each one reads the anonymous intent and answers with a bid, or null to pass.
// Prices are per seat, so the bid follows the seats the buyer asked for (10 seats gives the pitch's
// numbers). At renewal the incumbent quotes its new price, and when the auction reopens it is shown
// the best competing offer and either matches it or lets the company switch.
// They stand in for vendor-run agents; the auction only sees the bids they return.

const vendors = [
  {
    name: "Vendor A",
    sells: ["design-tool"],
    perSeat: { amount: 135, currency: "USD" },
    billing: "monthly",
    terms: (seats) => `${seats} seats, billed monthly, cancel any time.`,
    hike: 1650 / 1350,
    // Matches any competing monthly cost down to its floor, per seat.
    floorPerSeat: 125,
  },
  {
    name: "Vendor B",
    sells: ["design-tool"],
    perSeat: { amount: 118, currency: "EUR" },
    billing: "monthly",
    terms: (seats) => `${seats} seats, billed monthly in EUR.`,
    hike: 1440 / 1180,
    floorPerSeat: 110,
  },
  {
    name: "Vendor C",
    sells: ["design-tool"],
    perSeat: { amount: 1380, currency: "USD" },
    billing: "annual",
    terms: (seats) => `${seats} seats, 12 months prepaid up front.`,
    hike: 1,
    floorPerSeat: 1380,
  },
];

const byName = (name) => vendors.find((v) => v.name === name);
const cents = (n) => Math.round(n * 100) / 100;
const priceFor = (vendor, seats) => ({ amount: cents(vendor.perSeat.amount * seats), currency: vendor.perSeat.currency });

export const vendorNames = vendors.map((v) => v.name);

export async function collectBids(intent) {
  const bids = [];
  for (const vendor of vendors) {
    if (!vendor.sells.includes(intent.category)) continue;
    bids.push({
      vendor: vendor.name,
      merchantCategory: intent.merchantCategory,
      price: priceFor(vendor, intent.seats),
      billing: vendor.billing,
      terms: vendor.terms(intent.seats),
      seats: intent.seats,
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
  const floor = cents(vendor.floorPerSeat * (bid.seats ?? 10));
  if (offer.currency !== vendor.perSeat.currency || offer.amount < floor) return null;
  return { ...bid, price: { amount: offer.amount, currency: offer.currency }, terms: `Matched: ${bid.terms}` };
}
