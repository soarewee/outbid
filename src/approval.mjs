// The human approves exactly one set of terms, and the card's controls are derived from that approval
// alone, so the agent cannot widen them.

export function approvalFor(bid) {
  return {
    vendor: bid.vendor,
    amount: bid.price.amount,
    currency: bid.price.currency,
    cycle: bid.billing,
    merchantCategory: bid.merchantCategory,
  };
}

export function cardControls(approval) {
  return {
    allowed_transaction_count: "MULTIPLE",
    allowed_currencies: [approval.currency],
    allowed_merchant_categories: [approval.merchantCategory],
    transaction_limits: {
      currency: approval.currency,
      limits: [{ amount: approval.amount, interval: "PER_TRANSACTION" }],
    },
  };
}
