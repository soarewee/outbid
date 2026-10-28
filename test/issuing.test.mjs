import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalFor, cardControls } from "../src/approval.mjs";
import { charge, readTransaction } from "../src/issuing.mjs";

const approval = approvalFor({ vendor: "Vendor A", price: { amount: 1350, currency: "USD" }, billing: "monthly", merchantCategory: "5734" });
const card = { id: "card_1", controls: cardControls(approval) };

// A client whose simulated charges all answer with the given status and body.
const failingClient = (status, data) => ({
  post: async () => {
    throw Object.assign(new Error(`POST → ${status}`), { status, data });
  },
});
const outage = failingClient(400, { code: "bad_request", message: "failed to process transaction" });

test("sandbox transactions are read as approved or declined", () => {
  assert.equal(readTransaction({ status: "PENDING", transaction_type: "CLEARING" }).outcome, "approved");
  assert.equal(readTransaction({ status: "FAILED", failure_reason: "LIMIT_EXCEEDED" }).outcome, "declined");
});

test("an API error is an error, not a decline", async () => {
  const result = await charge(outage, card, { amount: 1650, currency: "USD", mcc: "5734", merchant: "Vendor A" });
  assert.equal(result.outcome, "error");
});
