// Airwallex Issuing: a cardholder, a card bound to approved terms, and charges against it.
// A charge has three outcomes: approved or declined by the card's controls, or an API error.
// An error never counts as a decline, so an outage cannot pass for a policy working.
import { randomUUID } from "node:crypto";
import { waitFor } from "./airwallex.mjs";

// Reuses a READY cardholder when the account has one, so repeated runs don't pile up cardholders.
export async function readyCardholder(aw) {
  const existing = (await aw.get("/api/v1/issuing/cardholders")).items ?? [];
  const ready = existing.find((h) => h.status === "READY");
  if (ready) return ready.cardholder_id;

  const holder = await aw.post("/api/v1/issuing/cardholders/create", {
    type: "INDIVIDUAL",
    email: `outbid-agent+${Date.now()}@example.com`,
    individual: {
      name: { first_name: "Outbid", last_name: "Agent" },
      date_of_birth: "1990-01-01",
      express_consent_obtained: "yes",
      address: { line1: "1 Market St", city: "San Francisco", state: "CA", postcode: "94105", country: "US" },
    },
  });
  const id = holder.cardholder_id ?? holder.id;
  if (holder.status !== "READY") {
    await aw.post(`/api/v1/simulation/issuing/cardholders/${id}/pass_review`).catch(() => {});
    await waitFor("cardholder", async () => (await aw.get(`/api/v1/issuing/cardholders/${id}`)).status, (s) => s === "READY");
  }
  return id;
}

// Issues a virtual card with the given controls and returns it once ACTIVE, with the controls as
// Airwallex stored them.
export async function issueCard(aw, { cardholderId, controls, nickName, createdBy }) {
  const created = await aw.post("/api/v1/issuing/cards/create", {
    request_id: randomUUID(),
    created_by: createdBy,
    cardholder_id: cardholderId,
    is_personalized: true,
    form_factor: "VIRTUAL",
    // Valid type/sub_type depend on the account's region; omitting them uses the account default.
    program: { purpose: "COMMERCIAL" },
    nick_name: nickName,
    authorization_controls: controls,
  });
  const id = created.card_id ?? created.id;
  const card = await waitFor("card", () => aw.get(`/api/v1/issuing/cards/${id}`), (c) => c.card_status === "ACTIVE");
  return { id, status: card.card_status, controls: card.authorization_controls ?? controls };
}

// Freezes a card: INACTIVE declines every charge until the card is set back to ACTIVE.
// (The sandbox rejects other names such as FROZEN with "invalid card_status".)
export async function freezeCard(aw, card) {
  const updated = await aw.post(`/api/v1/issuing/cards/${card.id}/update`, { card_status: "INACTIVE" });
  return { ...card, status: updated.card_status };
}

// Reads a simulated transaction. Per the builder guide, a decline ends in FAILED with a failure_reason;
// a cleared charge may stay PENDING, so CLEARING (or no failure) counts as approved.
export function readTransaction(tx) {
  const status = String(tx.status ?? "").toUpperCase();
  const failure = tx.failure_reason ?? tx.transaction_failure_reason;
  return {
    id: tx.transaction_id ?? tx.id,
    outcome: failure || status === "FAILED" ? "declined" : "approved",
    detail: [status, tx.transaction_type, failure].filter(Boolean).join(" "),
  };
}

// The sandbox's simulated-charge outage (Oct 26 onward) answers every charge with this 400.
export function isSimulationOutage(error) {
  return error.status >= 500 || (error.status === 400 && error.data?.message === "failed to process transaction");
}

// Applies the card's authorization controls to a charge the way Issuing did in the Oct 23 sandbox run.
// The per-transaction limit is inclusive. A card that isn't ACTIVE declines everything.
export function checkCharge({ status = "ACTIVE", controls }, { amount, currency, mcc }) {
  if (status !== "ACTIVE") return { outcome: "declined", detail: `CARD_${status}` };
  const allowedCurrencies = controls.allowed_currencies ?? [];
  const allowedCategories = controls.allowed_merchant_categories ?? [];
  if (allowedCurrencies.length && !allowedCurrencies.includes(currency)) return { outcome: "declined", detail: "CURRENCY_NOT_ALLOWED" };
  if (allowedCategories.length && !allowedCategories.includes(mcc)) return { outcome: "declined", detail: "MERCHANT_CATEGORY_NOT_ALLOWED" };
  const limits = controls.transaction_limits;
  const perCharge = limits?.limits?.find((l) => l.interval === "PER_TRANSACTION");
  if (perCharge && limits.currency === currency && amount > perCharge.amount) return { outcome: "declined", detail: "LIMIT_EXCEEDED" };
  return { outcome: "approved", detail: "within controls" };
}

// Simulates a charge in the sandbox. When the simulation endpoint is down and `offline` is set, the
// charge is checked against the card's controls instead, and the result says so (source: "offline").
export async function charge(aw, card, { amount, currency, mcc, merchant }, { offline = false } = {}) {
  try {
    const tx = await aw.post("/api/v1/simulation/issuing/create", {
      card_id: card.id,
      transaction_amount: amount,
      transaction_currency: currency,
      merchant_category_code: mcc,
      merchant_info: merchant,
      single_phase: true,
    });
    return { ...readTransaction(tx), source: "sandbox" };
  } catch (error) {
    if (error.status === undefined) throw error;
    const apiError = `${error.status} ${error.data?.code ?? ""} ${error.data?.message ?? ""}`.replace(/\s+/g, " ").trim();
    if (offline && isSimulationOutage(error)) return { ...checkCharge(card, { amount, currency, mcc }), source: "offline", apiError };
    return { outcome: "error", detail: apiError, source: "sandbox" };
  }
}
