// Shared terminal output and prompts for the auction and demo commands. Every step is also sent to
// the stage (the browser page) when one is open.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { approvalFor, cardControls } from "./approval.mjs";
import { charge, issueCard, readyCardholder } from "./issuing.mjs";
import { noStage } from "./stage.mjs";

export const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));

const SYMBOL = { USD: "$", EUR: "€", GBP: "£" };
export const money = (n, c) => `${SYMBOL[c] ?? `${c} `}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let stage = noStage;
export const useStage = (s) => (stage = s);

// One line per ranked bid: price, FX, total over the term, and why it fits or doesn't.
export function printRanking(result, currency, { key, title, explanation = null } = {}) {
  for (const bid of result.ranked) {
    const fx = bid.price.currency === currency ? "" : ` (at ${bid.fx})`;
    const why = bid.verdict === "breaks-reserve"
      ? `breaks reserve on day ${bid.cashPath.breachDay} (week ${Math.ceil(bid.cashPath.breachDay / 7)}): cash ${money(bid.cashPath.balance, currency)}`
      : bid.verdict === "fits" ? `fits, lowest cash ${money(bid.cashPath.low.balance, currency)} on day ${bid.cashPath.low.day}` : bid.verdict;
    const exit = bid.exitCost ? ` incl. ${money(bid.exitCost, currency)} to leave ${result.leaving.vendor}` : "";
    console.log(`${bid.vendor}: ${money(bid.price.amount, bid.price.currency)} ${bid.billing}${fx} → ${money(bid.total, currency)} over term${exit} · ${why}`);
  }
  if (explanation) console.log(`\nAgent (${explanation.model}): ${explanation.text}`);
  stage.emit("ranking", {
    key,
    title,
    explanation,
    currency,
    cash: result.cash,
    floor: result.floor,
    budget: result.budget,
    winner: result.winner?.vendor ?? null,
    reconsider: result.reconsider,
    leaving: result.leaving ?? null,
    bids: result.ranked.map(({ vendor, price, billing, fx, total, perMonth, verdict, cashPath, exit, exitCost, message }) => ({ vendor, price, billing, fx, total, perMonth, verdict, cashPath, exit: exit ?? null, exitCost: exitCost ?? 0, message: message ?? null })),
  });
}

// The human approves the exact terms, in the terminal or on the stage, whichever answers first.
// --yes approves without asking, for scripted demo runs.
export async function approve(terms) {
  const id = randomUUID();
  console.log("Approval to ask for:", terms);
  stage.emit("approval", { id, terms });
  const settle = (approved) => {
    stage.emit("approved", { id, approved });
    return approved;
  };
  if (process.argv.includes("--yes")) return settle(true);
  const fromStage = stage.awaitApproval(id);
  if (!process.stdin.isTTY) {
    if (stage.url) return settle(await fromStage.promise);
    console.log("Run with --yes to approve without a prompt.");
    return settle(false);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const where = stage.url ? " (or answer in the browser)" : "";
  const leave = terms.leaving ? `, paying ${money(terms.leaving.amount, terms.leaving.currency)} to leave ${terms.leaving.vendor}` : "";
  const fromTerminal = rl.question(`Approve ${terms.vendor} at ${money(terms.amount, terms.currency)} ${terms.cycle}${leave}?${where} [y/N] `).then((a) => /^y(es)?$/i.test(a.trim()));
  const approved = await Promise.race([fromTerminal, fromStage.promise]);
  rl.close();
  fromStage.cancel();
  return settle(approved);
}

// Issues the card for an approved bid and prints its controls.
export async function cardFor(aw, bid, { replaces } = {}) {
  const approval = approvalFor(bid);
  const card = await issueCard(aw, {
    cardholderId: await readyCardholder(aw),
    controls: cardControls(approval),
    nickName: `Outbid: ${approval.vendor} @ ${approval.currency} ${approval.amount}/${approval.cycle}`,
    createdBy: process.env.AIRWALLEX_CREATED_BY ?? "Outbid",
  });
  console.log(`Card ${card.id}: only MCC ${approval.merchantCategory}, ${approval.currency}, max ${money(approval.amount, approval.currency)} per charge`);
  stage.emit("card", { id: card.id, number: card.number, brand: card.brand, status: card.status, approval, replaces: replaces ?? null });
  return { ...card, approval };
}

// Charges a card in the sandbox and prints what Issuing decided.
export async function chargeAndPrint(aw, card, { label, kind = null, amount, currency, mcc, merchant }) {
  const result = await charge(aw, card, { amount, currency, mcc, merchant });
  console.log(`${label}: ${money(amount, currency)} at ${merchant} → ${result.outcome} (${result.detail})`);
  stage.emit("charge", { cardId: card.id, label, kind, amount, currency, mcc, merchant, outcome: result.outcome, detail: result.detail, txId: result.id ?? null });
  return { label, kind, amount, currency, mcc, merchant, ...result };
}
