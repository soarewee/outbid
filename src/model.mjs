// The agent's voice. The decision itself (ranking by total cost, the budget, the reserve check) is code
// in auction.mjs and never the model's. What the model does is read what the code decided, together
// with each vendor's own terms, and explain the trade-off in plain words for the buyer. Without
// ANTHROPIC_API_KEY it returns null and the consoles fall back to their own wording.
//
// Called over plain HTTP (the Messages API) rather than through the SDK, to keep the repository
// dependency-free: Node 20, no install step.

export const MODEL = process.env.OUTBID_MODEL ?? "claude-opus-5-5";
const API = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are the purchasing agent of a company, speaking to the person who approves its spending.
A purchase intent was posted anonymously, vendors bid, and code has already ranked the bids by total cost over the term, priced any foreign-currency bid with the day's FX rate, checked each bid against the monthly budget, and projected cash over the coming days against the reserve floor the company set. You do not make or question that decision. You explain it.
Write one short paragraph, at most 80 words, in the second person ("you", "your"). Plain English, no headings, no lists, no preamble, no quotation marks. Use the vendor names exactly as given. Use only numbers that appear in the data, rounded to whole units of the company's currency. Say which bid wins and why the cheaper one loses when it does, and bring in a vendor's own terms where they matter (prepaid up front, billed monthly in another currency, cancel any time).`;

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
  return {
    moment: key === "reopened" ? "The incumbent raised its price at renewal, so the auction was reopened with that price against fresh bids."
      : key === "recheck" ? "A customer payment landed, so the same rules were re-run on the new balance against the bids still standing."
      : "The opening auction, right after the bids came in.",
    intent: { category: intent.category, quantity: intent.quantity, budgetPerMonth: intent.budget, termMonths: intent.termMonths },
    company: { currency: company.currency, reserveFloor: company.policy.reserveFloor, horizonDays: company.policy.horizonDays, obligations: company.obligations },
    cashAvailable: result.cash,
    budgetPerMonthInCompanyCurrency: result.budget,
    bids,
    winner: result.winner?.vendor ?? null,
    reconsider: result.reconsider ?? null,
    ...context,
  };
}

export async function explain(args) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
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
      max_tokens: 1024,
      system: SYSTEM,
      fallbacks: "default",
      messages: [{ role: "user", content: `Explain this decision to the buyer.\n\n${JSON.stringify(briefFor(args), null, 1)}` }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`model: ${res.status} ${data?.error?.message ?? ""}`.trim());
  if (data.stop_reason === "refusal") return null;
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!text) return null;
  return { text, model: data.model ?? MODEL, usage: { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 } };
}
