// Vendor bidding agents. Each one reads the anonymous intent and answers with a bid, or null to pass.
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
  },
  {
    name: "Vendor B",
    bid: (intent) =>
      intent.category === "design-tool" && {
        price: { amount: 1180, currency: "EUR" },
        billing: "monthly",
        terms: "10 seats, billed monthly in EUR.",
      },
  },
  {
    name: "Vendor C",
    bid: (intent) =>
      intent.category === "design-tool" && {
        price: { amount: 13800, currency: "USD" },
        billing: "annual",
        terms: "10 seats, 12 months prepaid up front.",
      },
  },
];

export async function collectBids(intent) {
  const bids = [];
  for (const vendor of vendors) {
    const bid = await vendor.bid(intent);
    if (bid) bids.push({ vendor: vendor.name, merchantCategory: intent.merchantCategory, ...bid });
  }
  return bids;
}
