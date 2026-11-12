// Minimal Airwallex API client: logs in once, then sends JSON requests with the bearer token.
// Every request and response is kept in `log` so runs can be saved as evidence.
import { mkdirSync, writeFileSync } from "node:fs";

export function createClient({
  base = process.env.AIRWALLEX_BASE ?? "https://api.sandbox.airwallex.com",
  clientId = process.env.AIRWALLEX_CLIENT_ID,
  apiKey = process.env.AIRWALLEX_API_KEY,
  // Called after every request with what was sent and what came back, for the agent panel.
  onCall = () => {},
} = {}) {
  if (!clientId || !apiKey) {
    throw new Error("Set AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY in .env (see .env.example).");
  }
  if (/\s/.test(clientId) || /\s/.test(apiKey)) {
    throw new Error("AIRWALLEX_CLIENT_ID or AIRWALLEX_API_KEY contains spaces. Paste only the value from Account → Developer → API keys.");
  }

  const log = [];
  let token;

  async function request(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    else Object.assign(headers, { "x-client-id": clientId, "x-api-key": apiKey });
    const started = Date.now();
    const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    const report = (response) => {
      try {
        onCall({ method, path, status: res.status, body, response, ms: Date.now() - started });
      } catch {}
    };
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      log.push({ method, path, status: res.status, body, response: text.slice(0, 500) });
      report(null);
      throw new Error(`${method} ${path} → ${res.status} returned HTML, not JSON. Check AIRWALLEX_BASE and that the keys are correct.`);
    }
    log.push({ method, path, status: res.status, body, response: data });
    report(data);
    if (!res.ok) throw Object.assign(new Error(`${method} ${path} → ${res.status}: ${text}`), { status: res.status, data });
    return data;
  }

  async function login() {
    token = undefined;
    token = (await request("POST", "/api/v1/authentication/login")).token;
  }

  return {
    log,
    login,
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Writes a run's results and request log to out/ (not committed) and returns the file path.
export function saveRun(name, data) {
  const dir = new URL("../out/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  const file = new URL(`${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, dir);
  writeFileSync(file, JSON.stringify(data, null, 2));
  return file.pathname;
}

// Polls until `done(value)` is true, for resources that become ready asynchronously (cardholders, cards).
export async function waitFor(label, fetchValue, done, { tries = 20, intervalMs = 1500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const value = await fetchValue();
    if (done(value)) return value;
    await sleep(intervalMs);
  }
  throw new Error(`${label} did not become ready in time`);
}
