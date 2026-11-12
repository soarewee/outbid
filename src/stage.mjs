// The stage: a local server that shows the demo as it runs. The CLI emits one event per step; the
// pages in web/ receive them over server-sent events. / is the site, /buyer the buyer's console and
// /vendor a vendor's. The buyer posts the intent and gives approvals from the page as well as the
// terminal, and can ask the agent to draft the intent from their own words (POST /draft, answered by
// the `draft` function the run passes in). No dependencies: node:http only.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, extname, join, normalize } from "node:path";

const root = fileURLToPath(new URL("../web/", import.meta.url));
const pages = { "/": "index.html", "/buyer": "buyer.html", "/vendor": "vendor.html" };
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

export function openStage({ port = Number(process.env.OUTBID_STAGE_PORT ?? 4780), draft = null } = {}) {
  const started = Date.now();
  const events = [];
  const clients = new Set();
  const approvals = new Map();
  let firstViewer, postedIntent;
  const viewer = new Promise((resolve) => (firstViewer = resolve));
  const intent = new Promise((resolve) => (postedIntent = resolve));

  const readBody = (req) =>
    new Promise((resolve) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => resolve(body));
    });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET") {
      const file = pages[url.pathname] ?? (url.pathname.includes("..") ? null : basename(normalize(url.pathname)));
      const path = file && join(root, file);
      if (path && existsSync(path) && types[extname(path)]) {
        res.writeHead(200, { "Content-Type": types[extname(path)], "Cache-Control": "no-store" });
        return res.end(readFileSync(path));
      }
      if (url.pathname === "/events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`);
        clients.add(res);
        firstViewer();
        req.on("close", () => clients.delete(res));
        return;
      }
    }
    if (req.method === "POST" && url.pathname === "/approve") {
      try {
        const { id, approved } = JSON.parse(await readBody(req));
        approvals.get(id)?.(Boolean(approved));
        return res.writeHead(204).end();
      } catch {
        return res.writeHead(400).end();
      }
    }
    if (req.method === "POST" && url.pathname === "/draft") {
      const reply = (code, body) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (!draft) return reply(501, { error: "The agent can't read requests in this run (no ANTHROPIC_API_KEY)." });
      try {
        const { text } = JSON.parse(await readBody(req));
        const drafted = await draft(text);
        if (!drafted) return reply(501, { error: "The agent couldn't draft this one. Fill in the four fields instead." });
        return reply(200, { ...drafted, intent: checkIntent(drafted.intent) });
      } catch (error) {
        return reply(400, { error: error.message });
      }
    }
    if (req.method === "POST" && url.pathname === "/intent") {
      try {
        const posted = checkIntent(JSON.parse(await readBody(req)));
        postedIntent(posted);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(posted));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: error.message }));
      }
    }
    res.writeHead(404).end();
  });

  const keepAlive = setInterval(() => {
    for (const c of clients) c.write(": ping\n\n");
  }, 20_000);
  keepAlive.unref();

  function emit(type, data = {}) {
    const event = { type, t: Date.now() - started, ...data };
    events.push(event);
    for (const c of clients) c.write(`data: ${JSON.stringify(event)}\n\n`);
    return event;
  }

  // Resolves when the page answers the approval with this id (true or false). Can be cancelled when
  // the terminal answered first.
  function awaitApproval(id) {
    let settle;
    const promise = new Promise((resolve) => (settle = resolve));
    approvals.set(id, (ok) => {
      approvals.delete(id);
      settle(ok);
    });
    return { promise, cancel: () => approvals.delete(id) };
  }

  const url = `http://localhost:${port}`;
  const listening = new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, process.env.OUTBID_STAGE_HOST ?? "127.0.0.1", resolve);
  });

  return {
    url,
    events,
    listening,
    viewer,
    intent,
    emit,
    awaitApproval,
    close: () => {
      clearInterval(keepAlive);
      for (const c of clients) c.end();
      server.close();
    },
  };
}

// What the buyer's page may post as an intent. The merchant category is not the buyer's to choose:
// it follows the category.
export function checkIntent(body) {
  const quantity = Number(body.quantity);
  const amount = Number(body.budget?.amount);
  const termMonths = Number(body.termMonths);
  if (typeof body.category !== "string" || !/^[a-z][a-z0-9-]{1,40}$/.test(body.category)) throw new Error("category must be a slug like gpu-h100");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error("quantity must be a whole number from 1 to 1000");
  if (!(amount > 0 && amount <= 1_000_000)) throw new Error("budget must be a positive amount");
  if (!["USD", "EUR", "GBP"].includes(body.budget?.currency)) throw new Error("budget currency must be USD, EUR or GBP");
  if (![6, 12, 24, 36].includes(termMonths)) throw new Error("term must be 6, 12, 24 or 36 months");
  return { category: body.category, quantity, budget: { amount, currency: body.budget.currency, per: "month" }, termMonths };
}

// A stage that does nothing, for commands that run without a page.
export const noStage = { url: null, events: [], emit: () => {}, awaitApproval: () => ({ promise: new Promise(() => {}), cancel: () => {} }) };
