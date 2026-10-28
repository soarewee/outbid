import { test } from "node:test";
import assert from "node:assert/strict";
import { airwallexRates } from "../src/fx.mjs";

// Quotes as the sandbox returned them on Oct 28: both directions come back as EURUSD.
const quotes = {
  EURUSD: { currency_pair: "EURUSD", rate: 1.106512 },
  USDEUR: { currency_pair: "EURUSD", rate: 1.118009 },
};
const aw = { get: async (path) => quotes[path.match(/sell_currency=(\w+)&buy_currency=(\w+)/).slice(1).join("")] };

test("a rate quoted in the other direction is inverted", async () => {
  const rate = airwallexRates(aw);
  assert.equal(await rate("EUR", "USD"), 1.106512);
  assert.equal(Math.round(1350 * (await rate("USD", "EUR")) * 100) / 100, 1207.5);
  assert.equal(await rate("USD", "USD"), 1);
});
