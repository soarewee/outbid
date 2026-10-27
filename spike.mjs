#!/usr/bin/env node
// Outbid sandbox spike: a virtual card bound to a winning bid approves the agreed charge
// and declines a renewal hike and a charge at the wrong kind of merchant.
// Run: npm run spike   (reads .env)
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.AIRWALLEX_BASE ?? "https://api.sandbox.airwallex.com";
const CLIENT_ID = process.env.AIRWALLEX_CLIENT_ID;
const API_KEY = process.env.AIRWALLEX_API_KEY;
const CREATED_BY = process.env.AIRWALLEX_CREATED_BY ?? "Outbid Spike";

// The winning bid from the demo story: Vendor A, $1,350 per month, a software merchant.
const WIN = { vendor: "Vendor A", amount: 1350, currency: "USD", mcc: "5734" };
const CHARGES = [
  { label: "Agreed charge", amount: WIN.amount, mcc: WIN.mcc, expect: "approved" },
  { label: "Renewal hike (+22%)", amount: 1650, mcc: WIN.mcc, expect: "declined" },
  { label: "Wrong merchant (restaurant)", amount: 100, mcc: "5812", expect: "declined" },
];

if (!CLIENT_ID || !API_KEY) {
  console.error("Set AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY in .env (see .env.example).");
  process.exit(1);
}
if (/\s/.test(CLIENT_ID) || /\s/.test(API_KEY)) {
  console.error("AIRWALLEX_CLIENT_ID or AIRWALLEX_API_KEY contains spaces. Paste only the value from Account → Developer → API keys.");
  process.exit(1);
}

const log = [];
let token;

async function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  else Object.assign(headers, { "x-client-id": CLIENT_ID, "x-api-key": API_KEY });
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    log.push({ method, path, status: res.status, body, response: text.slice(0, 500) });
    throw new Error(`${method} ${path} → ${res.status} returned HTML, not JSON. Check AIRWALLEX_BASE and that the keys are correct.`);
  }
  log.push({ method, path, status: res.status, body, response: data });
  if (!res.ok) throw Object.assign(new Error(`${method} ${path} → ${res.status}: ${text}`), { status: res.status, data });
  return data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, fetchStatus, done, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const status = await fetchStatus();
    if (done(status)) return status;
    await sleep(1500);
  }
  throw new Error(`${label} did not become ready in time`);
}

async function ensureFunds() {
  const accounts = await api("GET", "/api/v1/global_accounts");
  let account = (accounts.items ?? [])[0];
  if (!account) {
    account = await api("POST", "/api/v1/global_accounts/create", {
      request_id: randomUUID(),
      country_code: "US",
      required_features: [{ currency: "USD", transfer_method: "LOCAL" }],
    });
  }
  await api("POST", "/api/v1/simulation/deposit/create", {
    global_account_id: account.id,
    amount: 25000,
    payer_name: "Outbid spike funding",
  });
  console.log(`✓ Wallet funded via global account ${account.id}`);
}

async function createCardholder() {
  const holder = await api("POST", "/api/v1/issuing/cardholders/create", {
    type: "INDIVIDUAL",
    email: `outbid-spike+${Date.now()}@example.com`,
    individual: {
      name: { first_name: "Outbid", last_name: "Agent" },
      date_of_birth: "1990-01-01",
      express_consent_obtained: "yes",
      address: { line1: "1 Market St", city: "San Francisco", state: "CA", postcode: "94105", country: "US" },
    },
  });
  const id = holder.cardholder_id ?? holder.id;
  if (holder.status !== "READY") {
    await api("POST", `/api/v1/simulation/issuing/cardholders/${id}/pass_review`).catch(() => {});
    await waitFor("cardholder", async () => (await api("GET", `/api/v1/issuing/cardholders/${id}`)).status, (s) => s === "READY");
  }
  console.log(`✓ Cardholder ${id} is READY`);
  return id;
}

async function issueBidCard(cardholderId) {
  const card = await api("POST", "/api/v1/issuing/cards/create", {
    request_id: randomUUID(),
    created_by: CREATED_BY,
    cardholder_id: cardholderId,
    is_personalized: true,
    form_factor: "VIRTUAL",
    // Valid type/sub_type depend on the account's region; omitting them uses the account default.
    program: { purpose: "COMMERCIAL" },
    nick_name: `Outbid: ${WIN.vendor} @ $${WIN.amount}/mo`,
    authorization_controls: {
      allowed_transaction_count: "MULTIPLE",
      allowed_currencies: [WIN.currency],
      allowed_merchant_categories: [WIN.mcc],
      transaction_limits: {
        currency: WIN.currency,
        limits: [{ amount: WIN.amount, interval: "PER_TRANSACTION" }],
      },
    },
  });
  const id = card.card_id ?? card.id;
  await waitFor("card", async () => (await api("GET", `/api/v1/issuing/cards/${id}`)).card_status, (s) => s === "ACTIVE");
  console.log(`✓ Card ${id} issued: only MCC ${WIN.mcc}, max ${WIN.currency} ${WIN.amount} per charge`);
  return id;
}

async function charge(cardId, { label, amount, mcc, expect }) {
  let outcome;
  let detail;
  try {
    const tx = await api("POST", "/api/v1/simulation/issuing/create", {
      card_id: cardId,
      transaction_amount: amount,
      transaction_currency: WIN.currency,
      merchant_category_code: mcc,
      merchant_info: WIN.vendor,
      single_phase: true,
    });
    // Per the builder guide: a decline ends in FAILED with a failure_reason; a cleared charge may stay
    // PENDING, so treat transaction_type CLEARING (or no failure) as accepted rather than waiting for APPROVED.
    const status = String(tx.status ?? "").toUpperCase();
    const failure = tx.failure_reason ?? tx.transaction_failure_reason;
    outcome = failure || status === "FAILED" ? "declined" : "approved";
    detail = [status, tx.transaction_type, failure].filter(Boolean).join(" ");
  } catch (error) {
    outcome = "declined";
    detail = `${error.status} ${error.data?.code ?? ""} ${error.data?.message ?? ""}`.trim();
  }
  const ok = outcome === expect;
  console.log(`${ok ? "✓" : "✗"} ${label}: $${amount} at MCC ${mcc} → ${outcome} (${detail || "no detail"})`);
  return { label, amount, mcc, expect, outcome, detail, ok };
}

const results = [];
try {
  await api("POST", "/api/v1/authentication/login").then((r) => (token = r.token));
  console.log("✓ Logged in to the Airwallex sandbox");
  await ensureFunds();
  const cardholderId = await createCardholder();
  const cardId = await issueBidCard(cardholderId);
  for (const c of CHARGES) results.push(await charge(cardId, c));
  // Record what the issuing ledger says, for the evidence log.
  await api("GET", `/api/v1/issuing/transactions?card_id=${cardId}`).catch(() => {});
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
  const file = new URL(`./out/spike-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify({ win: WIN, results, log }, null, 2));
  console.log(`\nFull request/response log: ${file.pathname}`);
  if (results.length && results.every((r) => r.ok)) console.log("All three checks behaved as the bid requires.");
}
