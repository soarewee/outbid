#!/usr/bin/env node
// Outbid sandbox spike: a virtual card bound to a winning bid approves the agreed charge
// and declines a renewal hike and a charge at the wrong kind of merchant.
// Run: npm run spike   (reads .env)
// Every charge must come back from the sandbox; an API error fails the check rather than counting as a decline.
import { createClient, saveRun } from "./src/airwallex.mjs";
import { cardControls } from "./src/approval.mjs";
import { available, deposit } from "./src/funds.mjs";
import { charge, issueCard, readyCardholder } from "./src/issuing.mjs";

const CREATED_BY = process.env.AIRWALLEX_CREATED_BY ?? "Outbid Spike";

// The winning bid from the demo story: Vendor A, $1,350 per month, a software merchant.
const WIN = { vendor: "Vendor A", amount: 1350, currency: "USD", mcc: "5734" };
const CHARGES = [
  { label: "Agreed charge", amount: WIN.amount, mcc: WIN.mcc, expect: "approved" },
  { label: "Renewal hike (+22%)", amount: 1650, mcc: WIN.mcc, expect: "declined" },
  { label: "Wrong merchant (restaurant)", amount: 100, mcc: "5812", expect: "declined" },
];

let aw;
try {
  aw = createClient();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// Tops up only when the wallet can't cover the charges, so repeated runs don't inflate the demo's cash.
async function ensureFunds() {
  const need = CHARGES.reduce((sum, c) => sum + c.amount, 0);
  const cash = await available(aw, WIN.currency);
  if (cash >= need) return console.log(`✓ Wallet has ${WIN.currency} ${cash} available`);
  const accountId = await deposit(aw, need, "Outbid spike funding");
  console.log(`✓ Wallet funded with ${WIN.currency} ${need} via global account ${accountId}`);
}

const results = [];
try {
  await aw.login();
  console.log("✓ Logged in to the Airwallex sandbox");
  await ensureFunds();
  const cardholderId = await readyCardholder(aw);
  console.log(`✓ Cardholder ${cardholderId} is READY`);
  const card = await issueCard(aw, {
    cardholderId,
    controls: cardControls({ amount: WIN.amount, currency: WIN.currency, merchantCategory: WIN.mcc }),
    nickName: `Outbid: ${WIN.vendor} @ $${WIN.amount}/mo`,
    createdBy: CREATED_BY,
  });
  console.log(`✓ Card ${card.id} issued: only MCC ${WIN.mcc}, max ${WIN.currency} ${WIN.amount} per charge`);
  for (const c of CHARGES) {
    const result = await charge(aw, card, { amount: c.amount, currency: WIN.currency, mcc: c.mcc, merchant: WIN.vendor });
    const ok = result.outcome === c.expect;
    console.log(`${ok ? "✓" : "✗"} ${c.label}: $${c.amount} at MCC ${c.mcc} → ${result.outcome} (${result.detail || "no detail"})`);
    results.push({ ...c, ...result, ok });
  }
  // Record what the issuing ledger says, for the evidence log.
  await aw.get(`/api/v1/issuing/transactions?card_id=${card.id}`).catch(() => {});
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  console.log(`\nFull request/response log: ${saveRun("spike", { win: WIN, results, log: aw.log })}`);
  if (results.some((r) => r.outcome === "error")) {
    console.log("The sandbox could not simulate the charges, so the card controls were not checked. See https://status.airwallex.com/.");
    process.exitCode = 1;
  } else if (results.length && results.every((r) => r.ok)) {
    console.log("All three checks behaved as the bid requires.");
  } else if (results.length) {
    process.exitCode = 1;
  }
}
