import { test } from "node:test";
import assert from "node:assert/strict";
import { deposit, setAvailable } from "../src/funds.mjs";

// A sandbox whose first simulated deposit stays PENDING: only the `settleFrom`-th one reaches the balance.
function sandbox({ settleFrom, cash = 1000 }) {
  const deposits = [];
  return {
    deposits,
    get: async (path) => {
      if (path === "/api/v1/global_accounts") return { items: [{ id: "ga_1" }] };
      if (path === "/api/v1/balances/current") return [{ currency: "USD", available_amount: cash }];
      throw new Error(`unexpected GET ${path}`);
    },
    post: async (path, body) => {
      if (path !== "/api/v1/simulation/deposit/create") throw new Error(`unexpected POST ${path}`);
      deposits.push(body);
      if (deposits.length >= settleFrom) cash += body.amount;
      return { id: `dep_${deposits.length}`, status: deposits.length >= settleFrom ? "SETTLED" : "PENDING" };
    },
  };
}

const quick = { waitMs: 200, intervalMs: 10, retryAfterMs: 40 };

test("a deposit that settles at once is sent once, as SETTLED", async () => {
  const aw = sandbox({ settleFrom: 1 });
  const paid = await deposit(aw, 30000, "Northwind Traders", quick);
  assert.equal(paid.landed, true);
  assert.equal(paid.cash, 31000);
  assert.equal(aw.deposits.length, 1);
  assert.equal(aw.deposits[0].status, "SETTLED");
});

test("a deposit the sandbox leaves pending is sent once more, and the second one lands", async () => {
  const aw = sandbox({ settleFrom: 2 });
  const paid = await deposit(aw, 30000, "Northwind Traders", quick);
  assert.equal(paid.landed, true);
  assert.equal(aw.deposits.length, 2);
  assert.equal(paid.deposits.length, 2);
});

test("when neither deposit lands the caller is told, not thrown at", async () => {
  const aw = sandbox({ settleFrom: 99 });
  const paid = await deposit(aw, 30000, "Northwind Traders", quick);
  assert.equal(paid.landed, false);
  assert.equal(paid.cash, 1000);
  assert.equal(aw.deposits.length, 2);
});

test("a reset whose top-up stays pending reports it and goes on from the cash it has", async () => {
  const aw = sandbox({ settleFrom: 99 });
  const reset = await setAvailable(aw, "USD", 80000, quick);
  assert.deepEqual(reset, { before: 1000, after: 1000, pending: 79000 });
});
