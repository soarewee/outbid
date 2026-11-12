// Metal testnet through Foundry's cast: wallets, the FeeEscrow deployment, and the fee's prepay and split.
// Shelling out to cast keeps the project free of npm dependencies; Foundry is needed for the escrow anyway.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { promisify } from "node:util";

const run = promisify(execFile);

export const CHAIN_ID = 63825;
// USDZ, the dollar token on Metal testnet, which also pays gas. 18 decimals.
export const USDZ = "0x000000000000000000000000000000000000b5d5";
export const explorer = (hash) => `https://testnet.metalntwx.com/tx/${hash}`;

const contractsDir = new URL("../contracts/", import.meta.url);
const deploymentFile = new URL("deployments/metal-testnet.json", contractsDir);

// Metal's guide fixes the gas limit, since estimation can fail on its native-balance checks.
const GAS = ["--gas-price", "1", "--priority-gas-price", "1"];

export function createMetal({ rpcUrl = process.env.METAL_RPC_URL, privateKey = process.env.METAL_PRIVATE_KEY, onCall = () => {} } = {}) {
  if (!rpcUrl || !privateKey) throw new Error("Set METAL_RPC_URL and METAL_PRIVATE_KEY in .env.");
  const env = { ...process.env, ETH_RPC_URL: rpcUrl, PATH: `${homedir()}/.foundry/bin:${process.env.PATH}` };
  const log = [];

  async function tool(bin, args, cwd) {
    try {
      const { stdout } = await run(bin, args, { env, cwd, maxBuffer: 10 * 1024 * 1024 });
      return stdout.trim();
    } catch (error) {
      // Never echo the arguments: they include private keys.
      throw new Error(`${bin} ${args[0]} failed: ${(error.stderr || error.message).trim().split("\n").slice(-3).join(" ")}`);
    }
  }
  const cast = (...args) => tool("cast", args);

  // Test wallets derived from the operator key, so vendors and Outbid's accounts need no stored keys.
  const derive = (label) => `0x${createHash("sha3-256").update(`${privateKey}:outbid:${label}`).digest("hex")}`;
  const addressOf = (key) => cast("wallet", "address", "--private-key", key);
  const wallet = async (label) => {
    const key = label === "operator" ? privateKey : derive(label);
    return { label, key, address: await addressOf(key) };
  };

  const usdz = (amount) => (BigInt(Math.round(amount * 1e6)) * 10n ** 12n).toString();
  const fromUsdz = (base) => Number(BigInt(base) / 10n ** 12n) / 1e6;
  const balance = async (address) => fromUsdz((await cast("call", USDZ, "balanceOf(address)(uint256)", address)).split(" ")[0]);
  const keccak = (text) => cast("keccak", text);

  async function send(from, to, sig, args, { gasLimit = 300000, label } = {}) {
    const started = Date.now();
    const out = await cast("send", "--json", "--private-key", from.key, "--gas-limit", String(gasLimit), ...GAS, to, sig, ...args);
    const receipt = JSON.parse(out);
    log.push({ label: label ?? sig, from: from.address, to, hash: receipt.transactionHash, status: receipt.status });
    try {
      onCall({ label: label ?? sig, hash: receipt.transactionHash, status: receipt.status, ms: Date.now() - started });
    } catch {}
    if (receipt.status !== "0x1" && receipt.status !== "1" && receipt.status !== 1) throw new Error(`${label ?? sig} reverted: ${explorer(receipt.transactionHash)}`);
    return receipt.transactionHash;
  }

  // Tops a wallet up from the operator so it holds at least `amount` USDZ (plus a little for gas). When the
  // operator runs short, it first sweeps earlier demo rebates and fees back from Outbid's own test wallets.
  async function ensureUsdz(operator, target, amount) {
    const have = await balance(target.address);
    if (have >= amount + 1) return null;
    const need = amount + 1 - have;
    if ((await balance(operator.address)) < need + 1) {
      for (const label of ["rebates", "fees"]) {
        const w = await wallet(label);
        const spare = Math.floor(((await balance(w.address)) - 0.01) * 1e6) / 1e6;
        if (spare > 0) await send(w, USDZ, "transfer(address,uint256)", [operator.address, usdz(spare)], { label: `sweep ${label}` });
      }
    }
    return send(operator, USDZ, "transfer(address,uint256)", [target.address, usdz(need)], { label: `fund ${target.label}` });
  }

  function deployment() {
    return existsSync(deploymentFile) ? JSON.parse(readFileSync(deploymentFile)) : null;
  }

  async function deploy({ rebateBps }) {
    const chainId = Number(await cast("chain-id"));
    if (chainId !== CHAIN_ID) throw new Error(`METAL_RPC_URL is on chain ${chainId}, not Metal testnet (${CHAIN_ID}).`);
    const [operator, rebates, fees] = await Promise.all([wallet("operator"), wallet("rebates"), wallet("fees")]);
    const out = await tool("forge", [
      "create", "src/FeeEscrow.sol:FeeEscrow", "--json", "--broadcast",
      "--rpc-url", rpcUrl, "--private-key", operator.key, "--gas-limit", "1500000", ...GAS,
      "--constructor-args", USDZ, operator.address, rebates.address, fees.address, String(rebateBps),
    ], contractsDir);
    const created = JSON.parse(out.slice(out.indexOf("{")));
    const record = {
      chainId,
      escrow: created.deployedTo,
      deployTx: created.transactionHash,
      token: USDZ,
      attester: operator.address,
      rebateAccount: rebates.address,
      feeAccount: fees.address,
      rebateBps,
      deployedAt: new Date().toISOString(),
    };
    mkdirSync(new URL("deployments/", contractsDir), { recursive: true });
    writeFileSync(deploymentFile, `${JSON.stringify(record, null, 2)}\n`);
    return record;
  }

  return { log, cast, wallet, balance, usdz, fromUsdz, keccak, send, ensureUsdz, deployment, deploy };
}

// The vendor whose bid won prepays its acquisition fee into the escrow for this deal.
export async function prepayFee(metal, { vendor, dealKey, amount, days = 45 }) {
  const { escrow } = requireDeployment(metal);
  const [operator, payer] = await Promise.all([metal.wallet("operator"), metal.wallet(`vendor:${vendor}`)]);
  await metal.ensureUsdz(operator, payer, amount);
  const dealId = await metal.keccak(dealKey);
  const deadline = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
  await metal.send(payer, USDZ, "approve(address,uint256)", [escrow, metal.usdz(amount)], { label: `${vendor} approves the escrow` });
  const hash = await metal.send(payer, escrow, "fund(bytes32,uint256,uint64)", [dealId, metal.usdz(amount), String(deadline)], { label: `${vendor} prepays the fee` });
  return { dealId, vendor: payer.address, amount, deadline, hash };
}

// Outbid attests the cleared charge; the escrow splits the fee into rebate and fee in one transaction.
export async function releaseFee(metal, { dealId, chargeId }) {
  const record = requireDeployment(metal);
  const operator = await metal.wallet("operator");
  const proof = await metal.keccak(chargeId);
  const hash = await metal.send(operator, record.escrow, "release(bytes32,bytes32)", [dealId, proof], { label: "Outbid releases the fee" });
  const [rebates, fees] = await Promise.all([metal.balance(record.rebateAccount), metal.balance(record.feeAccount)]);
  return { hash, proof, rebateBps: record.rebateBps, rebateAccountBalance: rebates, feeAccountBalance: fees };
}

function requireDeployment(metal) {
  const record = metal.deployment();
  if (!record) throw new Error("FeeEscrow is not deployed yet. Run: npm run escrow:deploy");
  return record;
}
