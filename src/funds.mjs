// Money in and out of the company's Airwallex wallet: balances, simulated deposits into the Global
// Account, and payouts to a bank beneficiary.
import { randomUUID } from "node:crypto";

export async function available(aw, currency) {
  const balances = await aw.get("/api/v1/balances/current");
  return balances.find((b) => b.currency === currency)?.available_amount ?? 0;
}

// A simulated incoming payment to the Global Account (sandbox only). USD lands as USD.
export async function deposit(aw, amount, payerName) {
  const accounts = (await aw.get("/api/v1/global_accounts")).items ?? [];
  const account = accounts[0] ?? await aw.post("/api/v1/global_accounts/create", {
    request_id: randomUUID(),
    country_code: "US",
    required_features: [{ currency: "USD", transfer_method: "LOCAL" }],
  });
  await aw.post("/api/v1/simulation/deposit/create", { global_account_id: account.id, amount, payer_name: payerName });
  return account.id;
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
export async function setAvailable(aw, currency, target) {
  const before = await available(aw, currency);
  const gap = Math.round((target - before) * 100) / 100;
  if (gap > 0) await deposit(aw, gap, "Outbid demo top-up");
  if (gap < 0) await payout(aw, { amount: -gap, currency, reference: "Outbid demo reset" });
  return { before, after: await available(aw, currency) };
}
