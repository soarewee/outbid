import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalFor, cardControls } from "../src/approval.mjs";
import { charge, checkCharge, readTransaction } from "../src/issuing.mjs";

const approval = approvalFor({ vendor: "Vendor A", price: { amount: 1350, currency: "USD" }, billing: "monthly", merchantCategory: "5734" });
const card = { id: "card_1", controls: cardControls(approval) };

// A client whose simulated charges all answer with the given status and body.
const failingClient = (status, data) => ({
  post: async () => {
    throw Object.assign(new Error(`POST → ${status}`), { status, data });
  },
});
const outage = failingClient(400, { code: "bad_request", message: "failed to process transaction" });

test("the offline check matches the Oct 23 sandbox results", () => {
  assert.deepEqual(checkCharge(card.controls, { amount: 1350, currency: "USD", mcc: "5734" }).outcome, "approved");
  assert.deepEqual(checkCharge(card.controls, { amount: 1650, currency: "USD", mcc: "5734" }), { outcome: "declined", detail: "LIMIT_EXCEEDED" });
  assert.deepEqual(checkCharge(card.controls, { amount: 100, currency: "USD", mcc: "5812" }), { outcome: "declined", detail: "MERCHANT_CATEGORY_NOT_ALLOWED" });
  assert.deepEqual(checkCharge(card.controls, { amount: 1000, currency: "EUR", mcc: "5734" }).outcome, "declined");
});

test("sandbox transactions are read as approved or declined", () => {
  assert.equal(readTransaction({ status: "PENDING", transaction_type: "CLEARING" }).outcome, "approved");
  assert.equal(readTransaction({ status: "FAILED", failure_reason: "LIMIT_EXCEEDED" }).outcome, "declined");
});

test("an API error is an error, not a decline", async () => {
  const result = await charge(outage, card, { amount: 1650, currency: "USD", mcc: "5734", merchant: "Vendor A" });
  assert.equal(result.outcome, "error");
});

test("during the simulation outage an offline charge is checked against the card and labelled", async () => {
  const result = await charge(outage, card, { amount: 1650, currency: "USD", mcc: "5734", merchant: "Vendor A" }, { offline: true });
  assert.deepEqual([result.outcome, result.detail, result.source], ["declined", "LIMIT_EXCEEDED", "offline"]);
  assert.match(result.apiError, /failed to process transaction/);
});

test("other API errors are not covered by the offline check", async () => {
  const unauthorized = failingClient(401, { code: "unauthorized", message: "invalid token" });
  const result = await charge(unauthorized, card, { amount: 1350, currency: "USD", mcc: "5734", merchant: "Vendor A" }, { offline: true });
  assert.equal(result.outcome, "error");
});
