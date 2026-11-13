#!/usr/bin/env node
// Returns bonds left locked in the escrow by runs that were killed before they could return them (a crash,
// a closed terminal). It reads the escrow's Funded events since its deployment, keeps the deals still funded,
// and has Outbid's attester send each one back to the vendor that posted it. Run: npm run bonds:return
import { createMetal, explorer } from "./metal.mjs";

const metal = createMetal();
const record = metal.deployment();
if (!record) {
  console.log("FeeEscrow is not deployed yet. Run: npm run escrow:deploy");
  process.exit(0);
}
// Metal's RPC answers log queries over at most 100,000 blocks, so the range is walked in steps.
const STEP = 90_000;
const first = Number(await metal.cast("receipt", record.deployTx, "blockNumber"));
const tip = Number(await metal.cast("block-number"));
const deals = [];
for (let from = first; from <= tip; from += STEP) {
  const logs = JSON.parse(await metal.cast("logs", "--json", "--from-block", String(from), "--to-block", String(Math.min(tip, from + STEP - 1)), "--address", record.escrow, "Funded(bytes32,address,uint256,uint64)"));
  for (const log of logs) deals.push(log.topics[1]);
}
const open = [];
for (const dealId of deals) {
  const [vendor, , state, amount] = (await metal.cast("call", record.escrow, "deals(bytes32)(address,uint64,uint8,uint256,bytes32)", dealId)).split("\n").map((x) => x.trim());
  if (state.startsWith("1")) open.push({ dealId, vendor, amount: metal.fromUsdz(amount.split(" ")[0]) });
}
console.log(`${deals.length} bonds posted since the escrow was deployed, ${open.length} still locked.`);
const operator = await metal.wallet("operator");
for (const bond of open) {
  const hash = await metal.send(operator, record.escrow, "refund(bytes32)", [bond.dealId], { label: "Outbid returns a stranded bond" });
  console.log(`Returned ${bond.amount} USDZ to ${bond.vendor}: ${explorer(hash)}`);
}
