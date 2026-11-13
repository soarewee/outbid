#!/usr/bin/env node
// Deploys FeeEscrow to Metal testnet and records it in contracts/deployments/metal-testnet.json.
// Run: npm run escrow:deploy   (add -- --force to replace an existing deployment)
import { createMetal, explorer } from "./metal.mjs";

const metal = createMetal();

const existing = metal.deployment();
if (existing && !process.argv.includes("--force")) {
  console.log(`FeeEscrow is already deployed at ${existing.escrow} (${explorer(existing.deployTx)}). Add -- --force to redeploy.`);
  process.exit(0);
}

const operator = await metal.wallet("operator");
console.log(`Operator ${operator.address}: ${await metal.balance(operator.address)} USDZ`);
const record = await metal.deploy();
console.log(`FeeEscrow ${record.escrow}`);
console.log(`  fees → ${record.feeAccount}, attester ${record.attester}`);
console.log(`  ${explorer(record.deployTx)}`);
