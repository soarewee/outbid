#!/usr/bin/env node
// Writes a publishable copy of a saved run: the stage events as they were, the Metal transactions, and
// for each Airwallex call that proves a step (a card issued, a charge decided, a transfer created, an FX
// quote, a deposit) the response fields that prove it and nothing else. Tokens, cardholder and
// beneficiary records never leave out/. Run: node src/evidence-cli.mjs out/demo-<time>.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const [file] = process.argv.slice(2);
if (!file) { console.error("Usage: node src/evidence-cli.mjs out/demo-<time>.json"); process.exit(1); }
const run = JSON.parse(readFileSync(file, "utf8"));

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));
const proofs = [
  [/^POST \/api\/v1\/simulation\/deposit\/create$/, (l) => ({ request: pick(l.body, ["amount", "payer_name"]), response: pick(l.response, ["status", "amount", "currency"]) })],
  [/^GET \/api\/v1\/fx\/rates\/current/, (l) => ({ response: pick(l.response, ["currency_pair", "rate", "sell_currency", "buy_currency"]) })],
  [/^POST \/api\/v1\/issuing\/cards\/create$/, (l) => ({ request: pick(l.body, ["authorization_controls", "nick_name"]), response: pick(l.response, ["card_id", "card_number", "card_status", "brand", "created_at"]) })],
  [/^POST \/api\/v1\/issuing\/cards\/[^/]+\/update$/, (l) => ({ request: pick(l.body, ["card_status"]), response: pick(l.response, ["card_id", "card_status"]) })],
  [/^POST \/api\/v1\/simulation\/issuing\/create$/, (l) => ({ request: pick(l.body, ["card_id", "transaction_amount", "transaction_currency", "merchant_category_code", "merchant"]), response: pick(l.response, ["card_transaction_id", "process_result", "failure_reason", "billing_amount", "billing_currency", "transaction_amount", "transaction_currency"]) })],
  [/^POST \/api\/v1\/transfers\/create$/, (l) => ({ request: pick(l.body, ["transfer_amount", "transfer_currency", "transfer_method", "reference"]), response: pick(l.response, ["id", "short_reference_id", "status", "amount_payer_pays", "transfer_currency", "created_at"]) })],
];
const airwallex = [];
for (const l of run.log ?? []) {
  const key = `${l.method} ${l.path.split("?")[0]}`;
  const proof = proofs.find(([re]) => re.test(l.method === "GET" ? `${l.method} ${l.path}` : key));
  if (proof) airwallex.push({ method: l.method, path: l.path, status: l.status, ...proof[1](l) });
}
const out = {
  recorded: (([, d, h, m, sec] = file.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/) ?? []) => (d ? `${d}T${h}:${m}:${sec}Z` : null))(),
  note: "A demo run of Outbid against the Airwallex sandbox and Metal testnet. `events` are what the consoles played; `airwallex` holds, for each call that proves a step, the fields that prove it; `metal` lists the escrow transactions (open them on https://testnet.metalntwx.com). Credentials, cardholder and beneficiary records are left out.",
  model: run.model ?? null,
  explanations: run.explanations ?? [],
  airwallex,
  metal: run.metal ?? [],
  events: run.events,
};
mkdirSync("evidence", { recursive: true });
const name = `evidence/${(out.recorded ?? "run").slice(0, 10)}.json`;
writeFileSync(name, JSON.stringify(out, null, 1) + "\n");
console.log(`${name}: ${airwallex.length} Airwallex calls, ${out.metal.length} Metal transactions, ${run.events.length} events`);
