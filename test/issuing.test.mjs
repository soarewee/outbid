import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalFor, cardControls } from "../src/approval.mjs";
import { charge, readTransaction } from "../src/issuing.mjs";

const approval = approvalFor({ vendor: "Vendor A", price: { amount: 1350, currency: "USD" }, billing: "monthly", merchantCategory: "5734" });
const card = { id: "card_1", controls: cardControls(approval) };

test("sandbox transactions are read as approved or declined, with the transaction id", () => {
  const approved = readTransaction({ card_transaction_id: "tx_1", process_result: "APPROVED", auth_code: "9WX9QA" });
  assert.deepEqual(approved, { id: "tx_1", outcome: "approved", detail: "APPROVED", authCode: "9WX9QA" });
  const declined = readTransaction({ card_transaction_id: "tx_2", process_result: "DECLINED", failure_reason: "LIMIT_EXCEEDED" });
  assert.deepEqual([declined.outcome, declined.detail], ["declined", "LIMIT_EXCEEDED"]);
});

test("the older response shape still reads the same", () => {
  assert.equal(readTransaction({ status: "PENDING", transaction_type: "CLEARING" }).outcome, "approved");
  assert.equal(readTransaction({ status: "FAILED", failure_reason: "LIMIT_EXCEEDED" }).outcome, "declined");
});

test("an API error is an error, not a decline", async () => {
  const failing = { post: async () => { throw Object.assign(new Error("POST → 400"), { status: 400, data: { message: "failed to process transaction" } }); } };
  const result = await charge(failing, card, { amount: 1650, currency: "USD", mcc: "5734", merchant: "Vendor A" });
  assert.equal(result.outcome, "error");
});

test("a vendor that is a known merchant brand gets a card bound to that brand too", () => {
  const brand = "8953f157-8939-5562-85d8-27bce6ca4385";
  const bound = cardControls(approvalFor({ vendor: "Vendor A", price: { amount: 1350, currency: "USD" }, billing: "monthly", merchantCategory: "7372", merchantBrand: brand }));
  assert.deepEqual(bound.allowed_merchant_brands, { ids: [brand] });
  assert.deepEqual(bound.allowed_merchant_categories, ["7372"]);
  // Without a brand id the card is bound by category, currency and amount, and the field is left out.
  assert.equal("allowed_merchant_brands" in cardControls(approval), false);
});
