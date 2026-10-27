#!/usr/bin/env node
// Runs one auction against live Airwallex balances and FX: intent → bids → ranking → reserve check.
// Run: npm run auction
import { readFileSync } from "node:fs";
import { createClient } from "./airwallex.mjs";
import { airwallexRates } from "./fx.mjs";
import { collectBids } from "./vendors.mjs";
import { decide } from "./auction.mjs";
import { approvalFor } from "./approval.mjs";

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
const intent = load("intent");
const company = load("company");
const money = (n, c = company.currency) => `${c} ${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

const aw = createClient();
await aw.login();
const balances = await aw.get("/api/v1/balances/current");
const cash = balances.find((b) => b.currency === company.currency)?.available_amount ?? 0;

console.log(`Intent: ${intent.category}, ${intent.seats} seats, up to ${money(intent.budget.amount, intent.budget.currency)}/${intent.budget.per}, ${intent.termMonths} months`);
console.log(`Cash: ${money(cash)} available, reserve floor ${money(company.policy.reserveFloor)}\n`);

const bids = await collectBids(intent);
const result = await decide({ intent, company, cash, bids, rate: airwallexRates(aw) });

for (const bid of result.ranked) {
  const fx = bid.price.currency === company.currency ? "" : ` (at ${bid.fx})`;
  const why = bid.verdict === "breaks-reserve"
    ? `breaks reserve on day ${bid.cashPath.breachDay} (week ${Math.ceil(bid.cashPath.breachDay / 7)}): cash ${money(bid.cashPath.balance)}`
    : bid.verdict === "fits" ? `fits, lowest cash ${money(bid.cashPath.low.balance)} on day ${bid.cashPath.low.day}` : bid.verdict;
  console.log(`${bid.vendor}: ${money(bid.price.amount, bid.price.currency)} ${bid.billing}${fx} → ${money(bid.total)} over term · ${why}`);
}

if (!result.winner) {
  console.log("\nNo bid fits the budget and reserve.");
} else {
  console.log(`\nPick: ${result.winner.vendor}`);
  if (result.reconsider) console.log(`Reconsider ${result.reconsider.candidate} on ${result.reconsider.at}, or when ${result.reconsider.orWhen}.`);
  console.log("Approval to ask for:", approvalFor(result.winner));
}
