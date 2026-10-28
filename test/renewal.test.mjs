import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reauction } from "../src/renewal.mjs";
import { collectBids } from "../src/vendors.mjs";

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
const intent = load("intent");
const company = load("company");
const fixedRate = (rates) => async (from, to) => (from === to ? 1 : rates[`${from}${to}`]);
const bidFrom = async (vendor) => (await collectBids(intent)).find((b) => b.vendor === vendor);

test("the incumbent's hike loses the reopened auction, then it matches and keeps the deal", async () => {
  const rate = fixedRate({ EURUSD: 1.11, USDEUR: 0.9 });
  const r = await reauction({ intent, company, cash: 25000, rate, incumbent: await bidFrom("Vendor A") });
  assert.equal(r.hiked.price.amount, 1650);
  assert.equal(r.opened.ranked.find((b) => b.vendor === "Vendor A").verdict, "over-budget");
  assert.equal(r.opened.winner.vendor, "Vendor B");
  assert.deepEqual(r.offer, { from: "Vendor B", amount: 1309.8, currency: "USD" });
  assert.equal(r.result.winner.vendor, "Vendor A");
  assert.equal(r.result.winner.price.amount, 1309.8);
});

test("a match quoted in another currency is never dearer than the bid it matches", async () => {
  const rate = fixedRate({ EURUSD: 1.11, USDEUR: 1 / 1.11 });
  const r = await reauction({ intent, company, cash: 25000, rate, incumbent: await bidFrom("Vendor B") });
  assert.equal(r.opened.winner.vendor, "Vendor A");
  assert.equal(r.offer.currency, "EUR");
  assert.equal(r.result.winner.vendor, "Vendor B");
  assert.ok(r.result.winner.total <= r.result.ranked.find((b) => b.vendor === "Vendor A").total);
});

test("an incumbent that can't go below its floor loses the renewal", async () => {
  const rate = fixedRate({ EURUSD: 1, USDEUR: 1 });
  const r = await reauction({ intent, company, cash: 25000, rate, incumbent: await bidFrom("Vendor A") });
  assert.equal(r.offer.amount, 1180);
  assert.equal(r.matched, null);
  assert.equal(r.result.winner.vendor, "Vendor B");
});
