// What the buyer's agent is doing, one line per call, for the agent panel on the buyer console. Every
// Airwallex request, Metal transaction and Claude call the run makes becomes a `call` event with a
// plain name, the endpoint, and the one fact from the response that matters. Only that fact leaves
// this module: never a token, a request body or a full response.

const SYMBOL = { USD: "$", EUR: "€", GBP: "£" };
const amount = (n, c) => `${SYMBOL[c] ?? `${c} `}${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// [method and path, what it is, the fact worth showing]
const AIRWALLEX = [
  [/^POST \/api\/v1\/authentication\/login$/, "Sign in", () => "API key exchanged for a session token"],
  [/^GET \/api\/v1\/balances\/current$/, "Balances · read cash", (b, r) => {
    const usd = Array.isArray(r) ? r.find((x) => x.currency === "USD") : null;
    return usd ? `${amount(usd.available_amount, "USD")} available` : null;
  }],
  [/^GET \/api\/v1\/fx\/rates\/current/, "FX · today's rate", (b, r) => (r?.currency_pair ? `${r.currency_pair} ${r.rate}` : null)],
  [/^GET \/api\/v1\/global_accounts$/, "Global Accounts · find the account", () => null],
  [/^POST \/api\/v1\/global_accounts\/create$/, "Global Accounts · open an account", () => null],
  [/^POST \/api\/v1\/simulation\/deposit\/create$/, "Global Accounts · incoming payment", (b) => (b ? `${amount(b.amount, "USD")} from ${b.payer_name}` : null)],
  [/^(GET|POST) \/api\/v1\/beneficiaries/, "Payouts · the buyer's bank", () => null],
  [/^POST \/api\/v1\/transfers\/create$/, "Payouts · send a transfer", (b, r) => (b ? `${amount(b.transfer_amount, b.transfer_currency)}, ${String(r?.status ?? "").toLowerCase()}` : null)],
  [/^(GET|POST) \/api\/v1\/(simulation\/)?issuing\/cardholders/, "Issuing · cardholder", () => null],
  [/^POST \/api\/v1\/issuing\/cards\/create$/, "Issuing · create the card", (b) => {
    const c = b?.authorization_controls;
    const limit = c?.transaction_limits?.limits?.[0];
    return c ? `at most ${amount(limit?.amount, c.transaction_limits.currency)} a charge, ${c.allowed_currencies?.join(", ")} only, MCC ${c.allowed_merchant_categories?.join(", ")} only${c.allowed_merchant_brands?.ids?.length ? ", one merchant brand only" : ""}` : null;
  }],
  [/^GET \/api\/v1\/issuing\/cards\/[^/]+$/, "Issuing · card status", (b, r) => r?.card_status ?? null],
  [/^POST \/api\/v1\/issuing\/cards\/[^/]+\/update$/, "Issuing · freeze the old card", (b, r) => r?.card_status ?? null],
  [/^POST \/api\/v1\/simulation\/issuing\/create$/, "Issuing · a charge on the card", (b, r) => {
    if (!b) return null;
    const result = r?.process_result ?? (r?.failure_reason ? "DECLINED" : "");
    return `${amount(b.transaction_amount, b.transaction_currency)} at MCC ${b.merchant_category_code} → ${[result, r?.failure_reason].filter(Boolean).join(" ")}`;
  }],
];

export function airwallexCall({ method, path, status, body, response, ms }) {
  const bare = path.split("?")[0];
  const key = `${method} ${path}`;
  const match = AIRWALLEX.find(([re]) => re.test(key));
  let detail = null;
  try {
    detail = match?.[2](body, response) ?? null;
  } catch {
    detail = null;
  }
  const ok = status < 400;
  return {
    service: "airwallex",
    op: match?.[1] ?? `${method} ${bare}`,
    endpoint: `${method} ${bare.replace(/\/(card_|ch_|chd_)?[0-9a-f]{8}-[0-9a-f-]{27,}/g, "/{id}")}`,
    detail: ok ? detail : `${status} ${response?.code ?? ""}`.trim(),
    ok,
    ms,
  };
}

const METAL = [
  [/^fund vendor:(.*)$/, (v) => `Top up ${v}'s test wallet`],
  [/^fund (.*)$/, (v) => `Top up the ${v} test wallet`],
  [/^sweep (.*)$/, (v) => `Sweep earlier ${v} back`],
  [/^(.*) approves the escrow$/, (v) => `${v} lets the escrow take its bond`],
];
const metalName = (label) => {
  for (const [re, name] of METAL) { const m = label.match(re); if (m) return name(m[1]); }
  return label;
};

export function metalCall({ label, hash, status, ms }) {
  return { service: "metal", op: `Escrow · ${metalName(label)}`, endpoint: "cast send · Metal testnet", detail: `${hash.slice(0, 10)}…`, url: `https://testnet.metalntwx.com/tx/${hash}`, ok: status === "0x1" || status === "1" || status === 1, ms };
}

export function claudeCall({ op, model, usage, ms, ok = true, detail = null }) {
  const tokens = usage ? `${usage.input.toLocaleString("en-US")} in, ${usage.output.toLocaleString("en-US")} out` : null;
  return { service: "claude", op, endpoint: `POST /v1/messages · ${model}`, detail: [detail, tokens].filter(Boolean).join(" · ") || null, ok, ms };
}

// A step the agent's own code takes: no network, just the rules in this repository.
export function codeStep({ op, where, detail = null }) {
  return { service: "code", op, endpoint: where, detail, ok: true, ms: 0 };
}
