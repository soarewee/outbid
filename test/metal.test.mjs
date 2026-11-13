import { test } from "node:test";
import assert from "node:assert/strict";
import { createMetal } from "../src/metal.mjs";

const rpcUrl = "https://example.invalid/private-endpoint";
const privateKey = "operator-test-secret";
const vendorKey = "vendor-test-secret";
const failing = (error) => createMetal({ rpcUrl, privateKey, execute: async () => { throw error; } });

test("a cast warning does not hide the actual failure on stdout", async () => {
  const metal = failing({ code: 1, stderr: "Warning: invalid dotenv syntax", stdout: "Error: insufficient funds" });
  await assert.rejects(metal.cast("send"), (error) => {
    assert.match(error.message, /failed \(1\)/);
    assert.match(error.message, /insufficient funds/);
    return true;
  });
});

test("a terminated cast process reports its signal even when stderr only has a warning", async () => {
  const metal = failing({ code: null, signal: "SIGKILL", stderr: "Warning: invalid dotenv syntax" });
  await assert.rejects(metal.cast("send"), /failed \(SIGKILL\)/);
});

test("cast failures never expose keys or the private RPC endpoint", async () => {
  const metal = failing({ code: 1, stderr: `RPC ${rpcUrl}`, stdout: `${privateKey} ${vendorKey}` });
  await assert.rejects(metal.cast("send", "--private-key", vendorKey), (error) => {
    for (const secret of [rpcUrl, privateKey, vendorKey]) assert.ok(!error.message.includes(secret));
    assert.match(error.message, /\[redacted\]/);
    return true;
  });
  const noOutput = failing({ code: "ENOENT", message: `Command failed: cast send --private-key ${vendorKey}` });
  await assert.rejects(noOutput.cast("send", "--private-key", vendorKey), (error) => {
    assert.match(error.message, /ENOENT/);
    assert.ok(!error.message.includes(vendorKey));
    return true;
  });
});
