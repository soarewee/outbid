// The human approves exactly one set of terms, and the card's controls are derived from that approval
// alone, so the agent cannot widen them. The terms include what leaving early would cost (`exit`), so
// the price of breaking the commitment is approved with the commitment.

export function approvalFor(bid) {
  return {
    vendor: bid.vendor,
    amount: bid.price.amount,
    currency: bid.price.currency,
    cycle: bid.billing,
    merchantCategory: bid.merchantCategory,
    exit: bid.exit ? { amount: bid.exit.amount, currency: bid.exit.currency } : null,
    merchantBrand: bid.merchantBrand ?? null,
  };
}

// Airwallex's standard controls bind a card to a currency, a merchant category and an amount. When the
// vendor is a known merchant brand (an id from GET /api/v1/issuing/merchant_brands), the card is bound to
// that brand as well, so another vendor in the same category is declined with MERCHANT_BRAND_NOT_ALLOWED.
export function cardControls(approval) {
  return {
    allowed_transaction_count: "MULTIPLE",
    allowed_currencies: [approval.currency],
    allowed_merchant_categories: [approval.merchantCategory],
    ...(approval.merchantBrand ? { allowed_merchant_brands: { ids: [approval.merchantBrand] } } : {}),
    transaction_limits: {
      currency: approval.currency,
      limits: [{ amount: approval.amount, interval: "PER_TRANSACTION" }],
    },
  };
}
