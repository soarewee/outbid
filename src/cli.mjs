// Shared terminal output and prompts for the auction and demo commands.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { approvalFor, cardControls } from "./approval.mjs";
import { charge, issueCard, readyCardholder } from "./issuing.mjs";

export const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));

export const money = (n, c) => `${c} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// One line per ranked bid: price, FX, total over the term, and why it fits or doesn't.
export function printRanking(result, currency) {
  for (const bid of result.ranked) {
    const fx = bid.price.currency === currency ? "" : ` (at ${bid.fx})`;
    const why = bid.verdict === "breaks-reserve"
      ? `breaks reserve on day ${bid.cashPath.breachDay} (week ${Math.ceil(bid.cashPath.breachDay / 7)}): cash ${money(bid.cashPath.balance, currency)}`
      : bid.verdict === "fits" ? `fits, lowest cash ${money(bid.cashPath.low.balance, currency)} on day ${bid.cashPath.low.day}` : bid.verdict;
    console.log(`${bid.vendor}: ${money(bid.price.amount, bid.price.currency)} ${bid.billing}${fx} → ${money(bid.total, currency)} over term · ${why}`);
  }
}

// The human approves the exact terms. --yes approves without asking, for scripted demo runs.
export async function approve(terms) {
  console.log("Approval to ask for:", terms);
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

// Issues the card for an approved bid and prints its controls.
export async function cardFor(aw, bid) {
  const approval = approvalFor(bid);
  const card = await issueCard(aw, {
    cardholderId: await readyCardholder(aw),
    controls: cardControls(approval),
    nickName: `Outbid: ${approval.vendor} @ ${approval.currency} ${approval.amount}/${approval.cycle}`,
    createdBy: process.env.AIRWALLEX_CREATED_BY ?? "Outbid",
  });
  console.log(`Card ${card.id}: only MCC ${approval.merchantCategory}, ${approval.currency}, max ${money(approval.amount, approval.currency)} per charge`);
  return { ...card, approval };
}

// Charges a card in the sandbox, checking against its controls while the simulation endpoint is down.
export async function chargeAndPrint(aw, card, { label, amount, currency, mcc, merchant }) {
  const result = await charge(aw, card, { amount, currency, mcc, merchant }, { offline: true });
  if (result.source === "offline") console.log(`  (sandbox charge simulation unavailable: ${result.apiError}; checked against the card's controls)`);
  console.log(`${label}: ${money(amount, currency)} at ${merchant} → ${result.outcome} (${result.detail})`);
  return { label, amount, currency, mcc, merchant, ...result };
}
