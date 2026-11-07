// Money in and out of the company's Airwallex wallet: balances, simulated deposits into the Global
// Account, and payouts to a bank beneficiary.
import { randomUUID } from "node:crypto";
import { sleep } from "./airwallex.mjs";

export async function available(aw, currency) {
  const balances = await aw.get("/api/v1/balances/current");
  return balances.find((b) => b.currency === currency)?.available_amount ?? 0;
}

// A simulated incoming payment to the Global Account (sandbox only). USD lands as USD. The deposit is
// asked for as SETTLED (the default too) and usually shows up in the available balance at once, but the
// sandbox sometimes leaves one PENDING for hours (Oct 28: over a minute; Nov 7: a $4,540 deposit still
// pending while a $1 one settled in 0.2 s). So this waits for the balance to rise, sends the deposit
// once more if it hasn't, and gives up after `waitMs` in all, saying so: `landed` is false and the
// callers decide whether the story can go on without it.
export async function deposit(aw, amount, payerName, { waitMs = 150_000, intervalMs = 3_000, retryAfterMs = 45_000 } = {}) {
  const accounts = (await aw.get("/api/v1/global_accounts")).items ?? [];
  const account = accounts[0] ?? await aw.post("/api/v1/global_accounts/create", {
    request_id: randomUUID(),
    country_code: "US",
    required_features: [{ currency: "USD", transfer_method: "LOCAL" }],
  });
  const before = await available(aw, "USD");
  const send = () => aw.post("/api/v1/simulation/deposit/create", { global_account_id: account.id, amount, payer_name: payerName, status: "SETTLED" });
  const deposits = [await send()];
  const started = Date.now();
  let warned = false;
  while (Date.now() - started < waitMs) {
    const cash = await available(aw, "USD");
    if (cash >= before + amount - 0.005) return { accountId: account.id, deposits, landed: true, cash };
    const waited = Date.now() - started;
    if (waited >= retryAfterMs && deposits.length === 1) {
      console.log(`Deposit ${deposits[0].id} is still ${deposits[0].status} after ${Math.round(waited / 1000)} s; sending it once more.`);
      deposits.push(await send());
    } else if (!warned && waited >= intervalMs * 3) {
      console.log(`Waiting for the sandbox to settle the deposit (${deposits[0].id}, ${deposits[0].status}) …`);
      warned = true;
    }
    await sleep(intervalMs);
  }
  return { accountId: account.id, deposits, landed: false, cash: await available(aw, "USD") };
}

// The account's local beneficiary for this currency, created on first use (US ACH test details).
async function beneficiaryFor(aw, currency) {
  const existing = (await aw.get("/api/v1/beneficiaries")).items ?? [];
  const found = existing.find((b) => b.beneficiary?.bank_details?.account_currency === currency && b.transfer_methods?.includes("LOCAL"));
  if (found) return found.id;
  if (currency !== "USD") throw new Error(`No local ${currency} beneficiary on the account.`);
  const created = await aw.post("/api/v1/beneficiaries/create", {
    request_id: randomUUID(),
    nickname: "Outbid buyer bank",
    transfer_methods: ["LOCAL"],
    beneficiary: {
      entity_type: "COMPANY",
      company_name: "Outbid Buyer Co",
      address: { country_code: "US", street_address: "1 Market St", city: "San Francisco", state: "CA", postcode: "94105" },
      bank_details: {
        bank_country_code: "US",
        account_currency: "USD",
        account_name: "Outbid Buyer Co",
        account_number: "123456789",
        account_routing_type1: "aba",
        account_routing_value1: "021000021",
        bank_account_category: "Checking",
        local_clearing_system: "ACH",
      },
    },
  });
  return created.id ?? created.beneficiary_id;
}

// A LOCAL transfer (no fee) out of the wallet. The available balance drops when it is created.
export async function payout(aw, { amount, currency, reference }) {
  const transfer = await aw.post("/api/v1/transfers/create", {
    request_id: randomUUID(),
    beneficiary_id: await beneficiaryFor(aw, currency),
    source_currency: currency,
    transfer_currency: currency,
    transfer_amount: amount,
    transfer_method: "LOCAL",
    reason: "business_expenses",
    reference,
  });
  return { id: transfer.id, status: transfer.status };
}

// Moves the available balance to `target` with a deposit or a payout, so a demo starts from known cash.
// If the sandbox leaves the top-up pending, the run goes on from the cash it has: `pending` says how
// much is still on its way (a later run's reset pays it back out).
export async function setAvailable(aw, currency, target, options) {
  const before = await available(aw, currency);
  const gap = Math.round((target - before) * 100) / 100;
  let pending = 0;
  if (gap > 0) {
    const topUp = await deposit(aw, gap, "Outbid demo top-up", options);
    if (!topUp.landed) pending = gap;
  }
  if (gap < 0) await payout(aw, { amount: -gap, currency, reference: "Outbid demo reset" });
  return { before, after: await available(aw, currency), pending };
}
