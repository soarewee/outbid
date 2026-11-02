import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decide, projectCash } from "../src/auction.mjs";
import { collectBids } from "../src/vendors.mjs";
import { approvalFor, cardControls } from "../src/approval.mjs";

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
const intent = load("intent");
const company = load("company");
const fixedRate = (rates) => async (from, to) => (from === to ? 1 : rates[`${from}${to}`]);

test("the annual prepay is cheapest but breaks the reserve in week 7", async () => {
  const bids = await collectBids(intent);
  const result = await decide({ intent, company, cash: 80000, bids, rate: fixedRate({ EURUSD: 1.110611 }) });
  const annual = result.ranked.find((b) => b.vendor === "Vendor C");
  assert.equal(result.ranked[0].vendor, "Vendor C");
  assert.equal(annual.verdict, "breaks-reserve");
  assert.equal(Math.ceil(annual.cashPath.breachDay / 7), 7);
  assert.equal(result.reconsider.candidate, "Vendor C");
});

test("the best monthly bid depends on the EUR rate", async () => {
  const bids = await collectBids(intent);
  const cheapEuro = await decide({ intent, company, cash: 80000, bids, rate: fixedRate({ EURUSD: 1.11 }) });
  const dearEuro = await decide({ intent, company, cash: 80000, bids, rate: fixedRate({ EURUSD: 1.16 }) });
  assert.equal(cheapEuro.winner.vendor, "Vendor B");
  assert.equal(dearEuro.winner.vendor, "Vendor A");
});

test("with more cash the annual prepay wins and no reconsider is needed", async () => {
  const bids = await collectBids(intent);
  const result = await decide({ intent, company, cash: 130000, bids, rate: fixedRate({ EURUSD: 1.11 }) });
  assert.equal(result.winner.vendor, "Vendor C");
  assert.equal(result.reconsider, null);
});

test("cash projection reports the first day below the floor", () => {
  const path = projectCash({ cash: 100, floor: 50, horizonDays: 10, outflows: [{ day: 3, amount: 30 }, { day: 5, amount: 30 }] });
  assert.deepEqual([path.ok, path.breachDay, path.balance], [false, 5, 40]);
});

test("card controls come only from the approved terms", () => {
  const controls = cardControls(approvalFor({ vendor: "Vendor A", price: { amount: 3400, currency: "USD" }, billing: "monthly", merchantCategory: "7372" }));
  assert.deepEqual(controls.allowed_currencies, ["USD"]);
  assert.deepEqual(controls.allowed_merchant_categories, ["7372"]);
  assert.deepEqual(controls.transaction_limits.limits, [{ amount: 3400, interval: "PER_TRANSACTION" }]);
});
