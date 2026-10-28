#!/usr/bin/env node
// Outbid sandbox spike: a virtual card bound to a winning bid approves the agreed charge
// and declines a renewal hike and a charge at the wrong kind of merchant.
// Run: npm run spike   (reads .env)
// Every charge must come back from the sandbox; an API error fails the check rather than counting as a decline.
import { randomUUID } from "node:crypto";
import { createClient, saveRun } from "./src/airwallex.mjs";
import { cardControls } from "./src/approval.mjs";
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

async function ensureFunds() {
  const accounts = await aw.get("/api/v1/global_accounts");
  let account = (accounts.items ?? [])[0];
  if (!account) {
    account = await aw.post("/api/v1/global_accounts/create", {
      request_id: randomUUID(),
      country_code: "US",
      required_features: [{ currency: "USD", transfer_method: "LOCAL" }],
    });
  }
  await aw.post("/api/v1/simulation/deposit/create", {
    global_account_id: account.id,
    amount: 25000,
    payer_name: "Outbid spike funding",
  });
  console.log(`✓ Wallet funded via global account ${account.id}`);
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
