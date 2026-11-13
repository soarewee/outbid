import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { affordablePerMonth, costOfLeaving, decide, projectCash } from "../src/auction.mjs";
import { collectBids, laterBids } from "../src/vendors.mjs";
import { approvalFor, cardControls } from "../src/approval.mjs";

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
const intent = load("intent");
const company = load("company");
const fixedRate = (rates) => async (from, to) => (from === to ? 1 : rates[`${from}${to}`]);

test("the opening is a plain comparison: two monthly bids, the cheapest wins, nothing to reconsider", async () => {
  const bids = await collectBids(intent);
  assert.deepEqual(bids.map((b) => b.vendor), ["Vendor A", "Vendor B"]);
  const result = await decide({ intent, company, cash: 80000, bids, rate: fixedRate({ EURUSD: 1.116819 }) });
  assert.equal(result.winner.vendor, "Vendor B");
  assert.equal(result.ranked[0].vendor, "Vendor B");
  assert.ok(result.ranked.every((b) => b.verdict === "fits"));
  assert.equal(result.reconsider, null);
});

test("the prepaid year that comes in later is cheapest but breaks the reserve in week 8", async () => {
  const bids = [...(await collectBids(intent)), ...(await laterBids(intent))];
  const result = await decide({ intent, company, cash: 80000, bids, rate: fixedRate({ EURUSD: 1.110611 }) });
  const annual = result.ranked.find((b) => b.vendor === "Vendor C");
  assert.equal(result.ranked[0].vendor, "Vendor C");
  assert.equal(annual.verdict, "breaks-reserve");
  assert.equal(Math.ceil(annual.cashPath.breachDay / 7), 8);
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
  const bids = [...(await collectBids(intent)), ...(await laterBids(intent))];
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

test("leaving a vendor costs the exit fee its bid set, and a switch has to win after paying it", async () => {
  const rate = fixedRate({ EURUSD: 1.11 });
  const [, harbor] = await collectBids(intent);
  const bids = [harbor, ...(await laterBids(intent))];
  assert.deepEqual(harbor.exit, { amount: 2960, currency: "EUR", periods: 1 });
  const leaving = await costOfLeaving(harbor, company.currency, rate);
  assert.equal(leaving.amount, 3285.6);
  const result = await decide({ intent, company, cash: 130000, bids, rate, leaving });
  const annual = result.ranked.find((b) => b.vendor === "Vendor C");
  assert.equal(annual.exitCost, 3285.6);
  assert.equal(annual.total, 32500 + 3285.6);
  assert.deepEqual(annual.schedule[0], { day: 0, amount: 3285.6 });
  assert.equal(result.ranked.find((b) => b.vendor === "Vendor B").exitCost, 0);
  assert.equal(result.winner.vendor, "Vendor C");
  // A fee that eats the saving keeps the company where it is.
  const dear = await decide({ intent, company, cash: 130000, bids, rate, leaving: { vendor: "Vendor B", amount: 8000 } });
  assert.equal(dear.winner.vendor, "Vendor B");
});

test("a vendor with no commitment can be left for nothing", async () => {
  const [orbit] = await collectBids(intent);
  assert.equal(orbit.exit, null);
  assert.equal(await costOfLeaving(orbit, "USD", fixedRate({})), null);
  assert.equal(approvalFor(orbit).exit, null);
});

test("with no budget named, the agent takes what the balance can carry above the reserve", async () => {
  // $80,000, a $20,000 floor, $39,500 of payroll and tax inside 90 days, four monthly payments: $5,125, rounded down.
  const budget = affordablePerMonth({ cash: 80000, company });
  assert.equal(budget, 5100);
  // A bid at exactly that budget keeps the reserve, and the next round figure up would break it.
  const at = (amount) => ({ vendor: "V", merchantCategory: "7372", price: { amount, currency: "USD" }, billing: "monthly", terms: "", quantity: 2 });
  const fits = await decide({ intent: { ...intent, budget: { amount: budget, currency: "USD" } }, company, cash: 80000, bids: [at(budget)], rate: fixedRate({}) });
  assert.equal(fits.ranked[0].verdict, "fits");
  const over = await decide({ intent: { ...intent, budget: { amount: 6000, currency: "USD" } }, company, cash: 80000, bids: [at(5150)], rate: fixedRate({}) });
  assert.equal(over.ranked[0].verdict, "breaks-reserve");
  assert.equal(affordablePerMonth({ cash: 30000, company }), 0);
});
