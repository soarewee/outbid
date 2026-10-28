#!/usr/bin/env node
// Runs one auction against the live Airwallex sandbox: intent → bids → ranking → reserve check →
// human approval → card bound to the approved terms → the first charge at the winning price.
// Run: npm run auction   (add -- --yes to approve without a prompt)
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { createClient, saveRun } from "./airwallex.mjs";
import { airwallexRates } from "./fx.mjs";
import { collectBids } from "./vendors.mjs";
import { decide } from "./auction.mjs";
import { approvalFor, cardControls } from "./approval.mjs";
import { charge, issueCard, readyCardholder } from "./issuing.mjs";

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
  process.exit(0);
}

console.log(`\nPick: ${result.winner.vendor}`);
if (result.reconsider) console.log(`Reconsider ${result.reconsider.candidate} on ${result.reconsider.at}, or when ${result.reconsider.orWhen}.`);
const approval = approvalFor(result.winner);
console.log("Approval to ask for:", approval);

if (!(await approved(approval))) {
  console.log("Not approved. No card issued.");
  process.exit(0);
}

const card = await issueCard(aw, {
  cardholderId: await readyCardholder(aw),
  controls: cardControls(approval),
  nickName: `Outbid: ${approval.vendor} @ ${approval.currency} ${approval.amount}/${approval.cycle}`,
  createdBy: process.env.AIRWALLEX_CREATED_BY ?? "Outbid",
});
console.log(`\nCard ${card.id}: only MCC ${approval.merchantCategory}, ${approval.currency}, max ${money(approval.amount, approval.currency)} per charge`);

// The first payment at the winning price, at the vendor's merchant category.
const first = await charge(
  aw,
  card,
  { amount: approval.amount, currency: approval.currency, mcc: approval.merchantCategory, merchant: approval.vendor },
  { offline: true },
);
if (first.source === "offline") console.log(`Sandbox charge simulation is unavailable (${first.apiError}); checked against the card's controls instead.`);
console.log(`First charge ${money(approval.amount, approval.currency)} at ${approval.vendor} → ${first.outcome} (${first.detail})`);
console.log(`\nRun log: ${saveRun("auction", { intent, cash, result, approval, card, charges: [first], log: aw.log })}`);
if (first.outcome !== "approved") process.exitCode = 1;

// The human approves the exact terms. --yes approves without asking, for scripted demo runs.
async function approved(terms) {
  if (process.argv.includes("--yes")) return true;
  if (!process.stdin.isTTY) {
    console.log("Run with --yes to approve without a prompt.");
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Approve ${terms.vendor} at ${money(terms.amount, terms.currency)} ${terms.cycle}? [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}
