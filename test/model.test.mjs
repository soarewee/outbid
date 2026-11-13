import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decide } from "../src/auction.mjs";
import { collectBids, laterBids } from "../src/vendors.mjs";
import { briefFor, draftIntent, explain } from "../src/model.mjs";

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
const intent = load("intent");
const company = load("company");
const rate = async (from, to) => (from === to ? 1 : 1.11);

test("the brief carries the code's decision and the vendors' own terms, nothing the model could change", async () => {
  const bids = [...(await collectBids(intent)), ...(await laterBids(intent))];
  const result = await decide({ intent, company, cash: 80000, bids, rate });
  const brief = briefFor({ intent, company, result, key: "annual" });
  assert.equal(brief.winner, "Vendor B");
  const annual = brief.bids.find((b) => b.vendor === "Vendor C");
  assert.equal(annual.verdict, "breaks-reserve");
  assert.equal(annual.cash.breachDay, 56);
  assert.match(annual.terms, /prepaid up front/);
  assert.equal(brief.company.reserveFloor, 20000);
});

test("without a key there is no explanation, and the run goes on", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await decide({ intent, company, cash: 80000, bids: await collectBids(intent), rate });
    assert.equal(await explain({ intent, company, result, key: "opening" }), null);
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

test("without a key the agent drafts nothing, and the page falls back to the four fields", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert.equal(await draftIntent(intent.request), null);
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

test("a drafted intent is checked by code before it can be posted", async () => {
  const { checkIntent } = await import("../src/stage.mjs");
  assert.deepEqual(checkIntent({ category: "gpu-h100", quantity: 2, budget: { amount: 3750, currency: "USD" }, termMonths: 12 }), { category: "gpu-h100", quantity: 2, budget: { amount: 3750, currency: "USD", per: "month" }, termMonths: 12 });
  assert.throws(() => checkIntent({ category: "gpu-h100", quantity: 2.5, budget: { amount: 3750, currency: "USD" }, termMonths: 12 }));
});
