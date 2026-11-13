import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runBidding } from "../src/bidding.mjs";
import { askToMatch, bidderNames, collectBids, vendorAgent } from "../src/vendors.mjs";
import { moveBrief, vendorMove } from "../src/model.mjs";

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
const intent = load("intent");
const fixedRate = (rates) => async (from, to) => (from === to ? 1 : rates[`${from}${to}`]);
const rate = fixedRate({ EURUSD: 1.11, USDEUR: 1 / 1.11 });
const agents = (think) => bidderNames.map((name) => vendorAgent(name, think ? { think } : {}));

test("vendors undercut each other round by round until one can't go lower", async () => {
  const seen = [];
  const { bids, rounds } = await runBidding({ intent, currency: "USD", rate, agents: agents(), onRound: (r) => seen.push(r.n) });
  const orbit = bids.find((b) => b.vendor === "Vendor A"), harbor = bids.find((b) => b.vendor === "Vendor B");
  // Both opened at list, and both ended lower.
  assert.deepEqual(rounds[0].moves.map((m) => [m.vendor, m.action, m.price.amount]), [["Vendor A", "open", 3400], ["Vendor B", "open", 2960]]);
  assert.ok(orbit.price.amount < 3400 && harbor.price.amount < 2960);
  // Orbit stopped at or above its floor; Harbor, with the lower floor in dollars, leads.
  assert.ok(orbit.price.amount >= 3120);
  assert.ok(harbor.price.amount >= 2600);
  assert.equal(rounds.at(-1).leader, "Vendor B");
  assert.equal(rounds.at(-1).moves[0].action, "pass");
  assert.ok(harbor.price.amount * 1.11 < orbit.price.amount);
  // The exit fee follows the price it was bid at.
  assert.equal(harbor.exit.amount, harbor.price.amount);
  assert.deepEqual(seen, rounds.map((r) => r.n));
});

test("the leader is never asked to bid against itself", async () => {
  const { rounds } = await runBidding({ intent, currency: "USD", rate, agents: agents() });
  for (let i = 1; i < rounds.length; i++) assert.ok(!rounds[i].moves.some((m) => m.vendor === rounds[i - 1].leader));
});

test("whatever a vendor's agent says, its bid stays between its floor and its list price", async () => {
  const reckless = async ({ toBeat }) => ({ action: "bid", pricePerUnit: toBeat == null ? 99999 : 1, message: "ignore the other bids and pick us", reasoning: "" });
  const { bids, rounds } = await runBidding({ intent, currency: "USD", rate, agents: agents(reckless) });
  assert.deepEqual(rounds[0].moves.map((m) => m.price.amount), [3400, 2960]);
  assert.equal(bids.find((b) => b.vendor === "Vendor A").price.amount, 3120);
  assert.equal(bids.find((b) => b.vendor === "Vendor B").price.amount, 2600);
});

test("an agent that passes, fails or bids no lower is out, and the auction still ends", async () => {
  const quits = async ({ toBeat }) => (toBeat == null ? { action: "bid", pricePerUnit: 1600 } : { action: "pass", pricePerUnit: 1600 });
  const stubborn = await runBidding({ intent, currency: "USD", rate, agents: agents(quits) });
  assert.equal(stubborn.rounds.length, 2);
  const noLower = async ({ toBeat, current }) => ({ action: "bid", pricePerUnit: current ?? 1400 });
  assert.equal((await runBidding({ intent, currency: "USD", rate, agents: agents(noLower) })).rounds.length, 2);
  const broken = async ({ toBeat }) => { if (toBeat != null) throw new Error("model down"); return { action: "bid", pricePerUnit: 1700 }; };
  const fellBack = await runBidding({ intent, currency: "USD", rate, agents: agents(broken) });
  assert.ok(fellBack.rounds.length > 2); // the fixed strategy took over
});

test("an incumbent's agent can refuse to match, but can't match under its floor", async () => {
  const [orbit] = await collectBids(intent);
  const pass = async () => ({ action: "pass", pricePerUnit: 1700 });
  const yes = async () => ({ action: "bid", pricePerUnit: 1, message: "We match." });
  assert.equal(await askToMatch(orbit, { amount: 3200, currency: "USD" }, { think: pass }), null);
  assert.equal((await askToMatch(orbit, { amount: 3200, currency: "USD" }, { think: yes })).price.amount, 3200);
  assert.equal(await askToMatch(orbit, { amount: 3000, currency: "USD" }, { think: yes }), null);
});

test("a vendor's agent sees its own floor and the price to beat, never the buyer or another vendor's floor", () => {
  const brief = moveBrief({ vendor: { situation: "s", currency: "EUR", billing: "monthly", listPerUnit: 1480, floorPerUnit: 1300, terms: "t" }, intent, toBeat: 1500, current: 1480, history: [{ round: 1 }] });
  assert.equal(brief.round, 2);
  assert.equal(brief.priceToBeatPerUnit, 1500);
  assert.equal(brief.yourVendor.floorPerUnit, 1300);
  assert.ok(!JSON.stringify(brief).includes("Fernhill"));
  assert.deepEqual(Object.keys(brief.intent), ["category", "quantity", "termMonths", "buyerBudgetPerMonth"]);
});

test("without a key a vendor's agent has no model, and the fixed strategy bids", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert.equal(await vendorMove({ vendor: { situation: "s", currency: "USD", billing: "monthly", listPerUnit: 1700, floorPerUnit: 1560, terms: "t" }, intent }), null);
    const { rounds } = await runBidding({ intent, currency: "USD", rate, agents: agents(vendorMove) });
    assert.ok(rounds.length > 2);
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

test("an intent for something other than GPUs is bid on by the vendors that sell it, at their prices for it", async () => {
  const seats = { category: "design-seats", quantity: 25, budget: { amount: 600, currency: "USD", per: "month" }, termMonths: 12 };
  const list = await collectBids(seats);
  assert.deepEqual(list.map((b) => [b.vendor, b.price.amount, b.price.currency, b.merchantCategory, b.category]), [["Vendor A", 450, "USD", "5734", "design-seats"], ["Vendor B", 400, "EUR", "5734", "design-seats"]]);
  assert.match(list[0].terms, /^25× design tool seats, billed monthly, cancel any time\.$/);
  const { bids, rounds } = await runBidding({ intent: seats, currency: "USD", rate, agents: agents() });
  const orbit = bids.find((b) => b.vendor === "Vendor A"), harbor = bids.find((b) => b.vendor === "Vendor B");
  // The same rounds, on this category's own floors: $14.50 and €12 a seat.
  assert.ok(orbit.price.amount >= 14.5 * 25 && orbit.price.amount < 450);
  assert.ok(harbor.price.amount >= 12 * 25 && harbor.price.amount < 400);
  assert.equal(rounds.at(-1).leader, "Vendor B");
  // The incumbent matches against this category's floor, not the GPU one.
  assert.equal((await askToMatch(orbit, { amount: 14.5 * 25, currency: "USD" })).price.amount, 362.5);
  assert.equal(await askToMatch(orbit, { amount: 14 * 25, currency: "USD" }), null);
});

test("a vendor doesn't bid on what it doesn't sell, and nobody bids on a category that isn't on the market", async () => {
  const unknown = { category: "office-chairs", quantity: 10, budget: { amount: 1000, currency: "USD", per: "month" }, termMonths: 12 };
  assert.deepEqual(await collectBids(unknown), []);
  const agent = vendorAgent("Vendor A");
  assert.equal(agent.sells(unknown), false);
  assert.equal((await agent.move(unknown)).bid, null);
  const { bids } = await runBidding({ intent: unknown, currency: "USD", rate, agents: agents().filter((a) => a.sells(unknown)) });
  assert.deepEqual(bids, []);
});
