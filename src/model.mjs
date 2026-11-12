// Where the model works for the buyer's agent. It does two things, both with words:
// - it reads the buyer's request in plain English and writes the anonymous intent from it, keeping the
//   company's name and finances out of what vendors will see (`draftIntent`);
// - after each decision it explains the trade-off to the buyer, from the code's ranking and each
//   vendor's own terms (`explain`).
// The decision itself (ranking by total cost, the budget, the reserve check) is code in auction.mjs and
// never the model's, and an intent it drafts is checked by code before it is posted. Without
// ANTHROPIC_API_KEY both return null and the consoles fall back to their own form and wording.
//
// Called over plain HTTP (the Messages API) rather than through the SDK, to keep the repository
// dependency-free: Node 20, no install step.

export const MODEL = process.env.OUTBID_MODEL ?? "claude-opus-5-5";
const API = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are the purchasing agent of a company, speaking to the person who approves its spending.
A purchase intent was posted anonymously, vendors bid, and code has already ranked the bids by total cost over the term, priced any foreign-currency bid with the day's FX rate, checked each bid against the monthly budget, and projected cash over the coming days against the reserve floor the company set. You do not make or question that decision. You explain it.
Write one short paragraph, at most 60 words, in the second person ("you", "your"). Plain English, no headings, no lists, no preamble, no quotation marks. Use the vendor names exactly as given. Use only numbers that appear in the data. Write money the way a finance team does, with the currency symbol and thousands separators ($34,500, €2,960), rounded to whole units; quote a bid in the currency it is billed in, and give the converted figure only when the comparison needs it. Say which bid wins and why the cheaper one loses when it does, and bring in a vendor's own terms where they matter (prepaid up front, billed monthly in another currency, cancel any time). Talk about cash or a reserve only when the data includes them.`;

// What the model is shown: the decision, flattened. Exported so the brief can be tested without a call.
export function briefFor({ intent, company, result, key, context = {} }) {
  const bids = result.ranked.map((b) => ({
    vendor: b.vendor,
    price: b.price,
    billing: b.billing,
    terms: b.terms,
    fxRateToCompanyCurrency: b.fx,
    totalOverTerm: b.total,
    perMonth: b.perMonth,
    verdict: b.verdict,
    cash: b.cashPath ? { breachDay: b.cashPath.breachDay ?? null, balanceAtBreach: b.cashPath.ok ? null : b.cashPath.balance, lowest: b.cashPath.low } : null,
  }));
  // Cash and the reserve floor are only part of the story when a bid would break it. Otherwise the
  // decision is a plain price comparison, and the model is not shown what it shouldn't bring up.
  const tight = result.ranked.some((b) => b.verdict === "breaks-reserve") || key === "recheck";
  if (!tight) for (const b of bids) delete b.cash;
  return {
    moment: key === "reopened" ? "The incumbent raised its price at renewal, so the auction was reopened with that price against fresh bids."
      : key === "annual" ? "Months later a vendor offered the rest of the term as a prepaid year. The same rules were run on today's balance with that offer next to the bids already standing."
      : key === "recheck" ? "A customer payment landed, so the same rules were re-run on the new balance against the bids still standing."
      : "The opening auction, right after the bids came in.",
    intent: { category: intent.category, quantity: intent.quantity, budgetPerMonth: intent.budget, termMonths: intent.termMonths },
    company: tight ? { currency: company.currency, reserveFloor: company.policy.reserveFloor, horizonDays: company.policy.horizonDays, obligations: company.obligations } : { currency: company.currency },
    ...(tight ? { cashAvailable: result.cash } : {}),
    budgetPerMonthInCompanyCurrency: result.budget,
    bids,
    winner: result.winner?.vendor ?? null,
    reconsider: result.reconsider ?? null,
    ...context,
  };
}

async function call({ system, content, effort = "low", format }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const started = Date.now();
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2026-10-21",
      "anthropic-beta": "server-side-fallback-2026-07-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      output_config: format ? { effort, format } : { effort },
      system,
      fallbacks: "default",
      messages: [{ role: "user", content }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`model: ${res.status} ${data?.error?.message ?? ""}`.trim());
  if (data.stop_reason === "refusal") return null;
  if (data.stop_reason === "max_tokens") throw new Error("model: the answer was cut off");
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!text) return null;
  return { text, model: data.model ?? MODEL, usage: { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 }, ms: Date.now() - started };
}

export async function explain(args) {
  return call({ system: SYSTEM, content: `Explain this decision to the buyer.\n\n${JSON.stringify(briefFor(args), null, 1)}` });
}

// ─── the intent, from the buyer's own words ───

const CATEGORIES = { "gpu-h100": "Reserved H100 GPU capacity (cloud GPUs), priced per GPU" };

const DRAFT = `You are the purchasing agent of a company. The person you work for tells you, in their own words, what the company needs to buy. You turn that into a purchase intent that will be posted to vendors anonymously.
The intent has exactly four fields: the category, the quantity, the most the company will pay per month, and the term in months. Vendors see those four fields and nothing else, so nothing that identifies the company or its finances may go into them: not its name, not its people, not its cash or bills, not what it uses the purchase for. List each such thing the request mentioned, briefly, under withheld (for example "Company name: Fernhill Robotics"), so the buyer can see what you kept back. If a field is not stated, choose the closest sensible value and say so in note; otherwise note is an empty string.
Categories you can buy: ${Object.entries(CATEGORIES).map(([k, v]) => `${k} (${v})`).join("; ")}. If the request is for something else, use the closest category and say so in note.`;

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: Object.keys(CATEGORIES) },
    quantity: { type: "integer" },
    budgetPerMonth: { type: "number" },
    currency: { type: "string", enum: ["USD", "EUR", "GBP"] },
    termMonths: { type: "integer", enum: [6, 12, 24, 36] },
    withheld: { type: "array", items: { type: "string" } },
    note: { type: "string" },
  },
  required: ["category", "quantity", "budgetPerMonth", "currency", "termMonths", "withheld", "note"],
  additionalProperties: false,
};

// Reads the buyer's request and returns the intent the agent would post, what it kept out of it, and
// the call's model and usage. The caller still checks the intent (stage.checkIntent) before posting.
export async function draftIntent(request) {
  const text = String(request ?? "").trim().slice(0, 2000);
  if (!text) throw new Error("Write what the company needs first.");
  const answer = await call({ system: DRAFT, content: text, format: { type: "json_schema", schema: INTENT_SCHEMA } });
  if (!answer) return null;
  const d = JSON.parse(answer.text);
  return {
    intent: { category: d.category, quantity: d.quantity, budget: { amount: d.budgetPerMonth, currency: d.currency, per: "month" }, termMonths: d.termMonths },
    withheld: d.withheld,
    note: d.note || null,
    model: answer.model,
    usage: answer.usage,
    ms: answer.ms,
  };
}
