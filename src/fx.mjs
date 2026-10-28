// Converts bid prices into the company's currency with Airwallex's current client rate.

export function airwallexRates(aw) {
  const cache = new Map();
  return async function rate(from, to) {
    if (from === to) return 1;
    const key = `${from}${to}`;
    if (!cache.has(key)) {
      const quote = await aw.get(`/api/v1/fx/rates/current?sell_currency=${from}&buy_currency=${to}&sell_amount=1000`);
      // The rate is quoted in the market pair's direction whichever way we trade: selling USD for EUR
      // still returns EURUSD (USD per EUR), so it is inverted when the pair starts with the buy currency.
      cache.set(key, quote.currency_pair === key ? quote.rate : 1 / quote.rate);
    }
    return cache.get(key);
  };
}

export const round2 = (n) => Math.round(n * 100) / 100;
