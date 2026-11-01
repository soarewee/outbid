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
  return { id, status: card.card_status, number: card.card_number, brand: card.brand, controls: card.authorization_controls ?? controls };
}

// Freezes a card: INACTIVE declines every charge until the card is set back to ACTIVE.
// (The sandbox rejects other names such as FROZEN with "invalid card_status".)
export async function freezeCard(aw, card) {
  const updated = await aw.post(`/api/v1/issuing/cards/${card.id}/update`, { card_status: "INACTIVE" });
  return { ...card, status: updated.card_status };
}

// Reads a simulated transaction. The sandbox answers with `process_result` APPROVED or DECLINED and a
// `failure_reason` on a decline; older responses used `status` FAILED, and a cleared charge could stay PENDING.
export function readTransaction(tx) {
  const result = String(tx.process_result ?? tx.status ?? "").toUpperCase();
  const failure = tx.failure_reason ?? tx.transaction_failure_reason;
  return {
    id: tx.card_transaction_id ?? tx.transaction_id ?? tx.id,
    outcome: failure || result === "DECLINED" || result === "FAILED" ? "declined" : "approved",
    detail: failure ?? (result || "APPROVED"),
    authCode: tx.auth_code,
  };
}

// Simulates a charge in the sandbox. An API error is reported as an error, never as a decline.
export async function charge(aw, card, { amount, currency, mcc, merchant }) {
  try {
    const tx = await aw.post("/api/v1/simulation/issuing/create", {
      card_id: card.id,
      transaction_amount: amount,
      transaction_currency: currency,
      merchant_category_code: mcc,
      merchant_info: merchant,
      single_phase: true,
    });
    return readTransaction(tx);
  } catch (error) {
    if (error.status === undefined) throw error;
    return { outcome: "error", detail: `${error.status} ${error.data?.code ?? ""} ${error.data?.message ?? ""}`.replace(/\s+/g, " ").trim() };
  }
}
