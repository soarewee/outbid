#!/usr/bin/env node
// Deploys FeeEscrow to Metal testnet and records it in contracts/deployments/metal-testnet.json.
// Run: npm run escrow:deploy   (add -- --force to replace an existing deployment)
import { createMetal, explorer } from "./metal.mjs";
import { load } from "./cli.mjs";

const { acquisitionFee } = load("scenario");
const metal = createMetal();

const existing = metal.deployment();
if (existing && !process.argv.includes("--force")) {
  console.log(`FeeEscrow is already deployed at ${existing.escrow} (${explorer(existing.deployTx)}). Add -- --force to redeploy.`);
  process.exit(0);
}

const operator = await metal.wallet("operator");
console.log(`Operator ${operator.address}: ${await metal.balance(operator.address)} USDZ`);
const record = await metal.deploy({ rebateBps: acquisitionFee.rebateBps });
console.log(`FeeEscrow ${record.escrow}`);
console.log(`  rebate ${record.rebateBps / 100}% → ${record.rebateAccount}, fee → ${record.feeAccount}, attester ${record.attester}`);
console.log(`  ${explorer(record.deployTx)}`);
