#!/usr/bin/env node
// Runs one auction against the live Airwallex sandbox: intent → bids → ranking → reserve check →
// human approval → card bound to the approved terms → the first charge at the winning price.
// Run: npm run auction   (add -- --yes to approve without a prompt)
import { createClient, saveRun } from "./airwallex.mjs";
import { airwallexRates } from "./fx.mjs";
import { collectBids } from "./vendors.mjs";
import { decide } from "./auction.mjs";
import { available } from "./funds.mjs";
import { approvalFor } from "./approval.mjs";
import { approve, cardFor, chargeAndPrint, load, money, printRanking } from "./cli.mjs";

const intent = load("intent");
const company = load("company");

const aw = createClient();
await aw.login();
const cash = await available(aw, company.currency);

console.log(`Intent: ${intent.category}, ${intent.seats} seats, up to ${money(intent.budget.amount, intent.budget.currency)}/${intent.budget.per}, ${intent.termMonths} months`);
console.log(`Cash: ${money(cash, company.currency)} available, reserve floor ${money(company.policy.reserveFloor, company.currency)}\n`);

const result = await decide({ intent, company, cash, bids: await collectBids(intent), rate: airwallexRates(aw) });
printRanking(result, company.currency);

if (!result.winner) {
  console.log("\nNo bid fits the budget and reserve.");
  process.exit(0);
}

console.log(`\nPick: ${result.winner.vendor}`);
if (result.reconsider) console.log(`Reconsider ${result.reconsider.candidate} on ${result.reconsider.at}, or when ${result.reconsider.orWhen}.`);
const approval = approvalFor(result.winner);
if (!(await approve(approval))) {
  console.log("Not approved. No card issued.");
  process.exit(0);
}

console.log();
const card = await cardFor(aw, result.winner);
// The first payment at the winning price, at the vendor's merchant category.
const first = await chargeAndPrint(aw, card, {
  label: "First charge",
  amount: approval.amount,
  currency: approval.currency,
  mcc: approval.merchantCategory,
  merchant: approval.vendor,
});
console.log(`\nRun log: ${saveRun("auction", { intent, cash, result, approval, card, charges: [first], log: aw.log })}`);
if (first.outcome !== "approved") process.exitCode = 1;
