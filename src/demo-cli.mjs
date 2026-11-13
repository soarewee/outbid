#!/usr/bin/env node
// The demo story against the live sandbox, scene by scene:
// 0. The buyer says what the company needs in plain words; Claude writes the anonymous intent from it.
// 1. Two vendors post a bid bond into the Metal escrow, and their agents bid against each other round by
//    round, priced with Airwallex FX, until one stops; the cheapest over the term wins and the loser's
//    bond goes back.
// 2. The winning bid becomes a card. The agreed charge clears; the same vendor billing more than it bid
//    is declined.
// 3. The cleared charge proves the sale: the winner's bond is released to Outbid as its fee, and Outbid
//    sends the buyer a cashback from it through Airwallex Payouts.
// 4. At renewal the hike is declined; the auction reopens and the incumbent's agent matches or loses.
// 5. A third vendor offers a prepaid year, cheaper in total even after the exit fee the current vendor's
//    bid set. Today's cash can't carry it above the reserve, so the agent stays; a customer payment
//    lands, the same rules re-run, and it switches: the exit fee is paid on the old card, which is then
//    frozen, and a new card is issued.
// Every Airwallex request, Metal transaction and Claude call is also sent to the buyer console's agent
// panel (src/trace.mjs), so the page shows what the agent is doing and where.
// The run is shown live on the stage (local pages). Run: npm run demo
//   --yes    approve every step without a prompt
//   --wait   let the buyer post the intent from the page (http://localhost:4780/buyer) instead of
//            reading data/intent.json; the story starts when it is posted
import { createClient, saveRun } from "./airwallex.mjs";
import { airwallexRates } from "./fx.mjs";
import { bidderNames, laterNames, renewalBid, scripted, vendorAgent, vendorNames } from "./vendors.mjs";
import { runBidding } from "./bidding.mjs";
import { affordablePerMonth, costOfLeaving, decide } from "./auction.mjs";
import { reauction } from "./renewal.mjs";
import { available, deposit, payout, setAvailable } from "./funds.mjs";
import { createMetal, explorer, postBonds, releaseBond, returnBond } from "./metal.mjs";
import { approvalFor } from "./approval.mjs";
import { freezeCard } from "./issuing.mjs";
import { randomUUID } from "node:crypto";
import { openStage } from "./stage.mjs";
import { catalog, catalogForPages } from "./catalog.mjs";
import { approve, cardFor, chargeAndPrint, load, money, printRanking, useStage } from "./cli.mjs";
import { MODEL, VENDOR_MODEL, draftIntent, explain, vendorMove } from "./model.mjs";
import { airwallexCall, claudeCall, codeStep, metalCall } from "./trace.mjs";

let intent = load("intent");
const company = load("company");
const scenario = load("scenario");
const cur = company.currency;
const bondTerms = scenario.bidBond;
const cashback = Math.round(bondTerms.amount * scenario.cashbackBps) / 10_000;
// Each vendor's agent is a model when a key is set, and the fixed strategy in vendors.mjs otherwise.
const think = process.env.ANTHROPIC_API_KEY ? vendorMove : scripted;
const agentOf = (name) => vendorAgent(name, { think });

const run = { scenes: [], charges: [], settlements: [], bidding: [], model: process.env.ANTHROPIC_API_KEY ? MODEL : null, vendorModel: process.env.ANTHROPIC_API_KEY ? VENDOR_MODEL : null, drafts: [], explanations: [] };
// The agent drafts the intent from the buyer's own words. The draft is checked by code before it is posted.
async function draft(text) {
  const drafted = await draftIntent(text);
  if (!drafted) return null;
  stage.emit("call", claudeCall({ op: "Read your request, wrote the intent", model: drafted.model, usage: drafted.usage, ms: drafted.ms, detail: `${drafted.withheld.length} things kept from vendors` }));
  // The buyer named no budget, so the agent doesn't ask for one: it reads the Airwallex balance and takes
  // the most the company can pay a month and still keep its reserve. The rule is code, not the model.
  if (!drafted.intent.budget) {
    const cash = await available(aw, cur);
    const amount = affordablePerMonth({ cash, company });
    if (!amount) throw new Error("The balance can't carry a monthly payment above the reserve, so there is no budget to post.");
    const { reserveFloor, horizonDays } = company.policy;
    drafted.intent.budget = { amount, currency: cur, per: "month" };
    drafted.budgetFrom = { cash, floor: reserveFloor, horizonDays, currency: cur };
    trace(codeStep({ op: "Set the budget from your balance", where: "src/auction.mjs", detail: `${money(amount, cur)} a month keeps ${money(reserveFloor, cur)} in reserve for ${horizonDays} days` }));
  }
  run.drafts.push({ request: text, ...drafted });
  stage.emit("drafted", { request: text, intent: drafted.intent, withheld: drafted.withheld, note: drafted.note, model: drafted.model, budgetFrom: drafted.budgetFrom ?? null });
  return drafted;
}
const stage = openStage({ draft: process.env.ANTHROPIC_API_KEY ? draft : null });
useStage(stage);
// While the demo resets the sandbox balance, its calls are setup, not the agent's work: one line says so.
let settingUp = false;
const trace = (entry) => !settingUp && stage.emit("call", entry);
const aw = createClient({ onCall: (c) => trace(airwallexCall(c)) });
const metal = createMetal({ onCall: (c) => trace(metalCall(c)) });
await stage.listening;
console.log(`Stage: ${stage.url}  buyer ${stage.url}/buyer  vendors ${stage.url}/vendor`);
// The agent signs in and the sandbox balance is reset before the buyer says anything, so a budget the
// agent works out from the balance is the same on every run.
await aw.login();
const rate = airwallexRates(aw);
settingUp = true;
const reset = await setAvailable(aw, cur, scenario.startingCash, { waitMs: 60_000, retryAfterMs: 20_000 }).finally(() => (settingUp = false));
trace({ service: "airwallex", op: "Demo setup · reset the sandbox balance", endpoint: "simulated deposit or payout", detail: `${money(reset.before, cur)} → ${money(reset.after, cur)}, so every run starts the same`, ok: true, ms: 0 });
console.log(`Sandbox ${cur} balance set to ${money(reset.after, cur)} (was ${money(reset.before, cur)})`);
if (reset.pending) console.log(`The sandbox hasn't settled the ${money(reset.pending, cur)} top-up yet, so the run starts from ${money(reset.after, cur)} instead of ${money(scenario.startingCash, cur)}.`);
// --request "…" asks for something else than data/intent.json does, without the page.
const asked = process.argv.indexOf("--request");
if (asked > 0 && process.argv[asked + 1]) intent = { ...intent, request: process.argv[asked + 1] };
if (process.argv.includes("--wait")) {
  console.log(`Waiting for the buyer to post the intent at ${stage.url}/buyer …`);
  stage.emit("await-intent", { defaults: intent, company, catalog: catalogForPages });
  intent = { ...intent, ...(await stage.intent) };
} else if (intent.request && process.env.ANTHROPIC_API_KEY) {
  // Without the page, the agent reads the request in data/intent.json; the four fields there are the fallback.
  try {
    const drafted = await draft(intent.request);
    if (drafted) intent = { ...intent, ...drafted.intent };
  } catch (error) {
    console.log(`(The agent couldn't draft the intent, ${error.message}; posting the one in data/intent.json.)`);
  }
}
console.log(`Intent: ${intent.category}, ${intent.quantity} units, up to ${money(intent.budget.amount, intent.budget.currency)}/${intent.budget.per}, ${intent.termMonths} months`);
const SPOKEN = { opening: "Explain the pick to you", reopened: "Explain the re-auction to you", annual: "Explain why not yet", recheck: "Explain the switch to you" };
// The agent explains each decision in its own words; the run goes on without it if the model is unavailable.
async function voice(args) {
  try {
    const explanation = await explain(args);
    if (explanation) trace(claudeCall({ op: SPOKEN[args.key] ?? "Explain the decision", model: explanation.model, usage: explanation.usage, ms: explanation.ms }));
    if (explanation) run.explanations.push({ key: args.key, ...explanation });
    else if (!run.model) console.log("(No ANTHROPIC_API_KEY, so the agent's explanation is the console's own wording.)");
    return explanation;
  } catch (error) {
    console.log(`(The model is unavailable, ${error.message}; the console falls back to its own wording.)`);
    return null;
  }
}

// The ranking is the agent's own code, not a call: it says so on the panel.
const ranked = (result) =>
  trace(codeStep({ op: "Rank the bids", where: "src/auction.mjs", detail: `${result.ranked.length} bids on total cost${result.ranked.some((b) => b.verdict === "breaks-reserve") ? ", cash checked against the reserve" : ""} → ${result.winner?.vendor ?? "none fits"}` }));

// The story ends early when nothing fits or the human declines; the stage stays open either way.
class Stop extends Error {}
const stop = (why) => {
  throw new Stop(why);
};
// `later` marks the parts that happen months after the purchase (renewal, a deposit): the buyer console
// plays the purchase first and offers those afterwards.
const scene = (n, title, { later = false } = {}) => {
  console.log(`\n━━ ${n}. ${title}`);
  run.scenes.push({ n, title, later });
  stage.emit("scene", { n, title, later });
};
const say = (text) => {
  console.log(text);
  stage.emit("note", { text: text.trim() });
};
// What a vendor's own agent sees. Vendors never see the company's name.
const vendorSees = (vendor, text) => stage.emit("vendor", { vendor, text });
// `kind` says what the charge is in the story (agreed, overcharge, renewal, exit, old-card), for the pages.
const chargeAt = (card, label, amount, kind) =>
  chargeAndPrint(aw, card, { label, kind, amount, currency: card.approval.currency, mcc: card.approval.merchantCategory, merchant: card.approval.vendor });

// Replaces the current card with one for the newly approved bid, then freezes the old one. When leaving
// the old vendor has a price, that exit fee is the last charge the old card takes before it is frozen.
async function switchCard(oldCard, bid, { exit = null } = {}) {
  const card = await cardFor(aw, bid, { replaces: oldCard.id });
  const paid = exit ? await chargeAt(oldCard, "Exit fee", exit.amount, "exit") : null;
  const frozen = await freezeCard(aw, oldCard);
  console.log(`Old card ${frozen.id} (${oldCard.approval.vendor}) → ${frozen.status}`);
  stage.emit("cardStatus", { id: frozen.id, status: frozen.status });
  return { card, frozen, paid };
}

// ─── bid bonds (Metal) ───
// A vendor posts a bond before it bids. A loser's bond goes straight back; the winner's stays until its
// first charge clears on the card and then becomes Outbid's fee. Bonds still open when the run stops
// are returned too.
const bonds = new Map(); // vendor → its open bond
async function post(vendors) {
  const posted = await postBonds(metal, {
    vendors, auction: run.auction, amount: bondTerms.amount,
    onPosted: (b) => {
      bonds.set(b.vendor, b);
      console.log(`${b.vendor} posts a ${money(b.amount, bondTerms.currency)} bid bond (USDZ): ${explorer(b.hash)}`);
      stage.emit("bond", { step: "posted", vendor: b.vendor, amount: b.amount, currency: bondTerms.currency, hash: b.hash, url: explorer(b.hash) });
      vendorSees(b.vendor, `Posted a ${money(b.amount, bondTerms.currency)} bid bond to enter the auction.`);
    },
  });
  run.settlements.push(...posted.map((b) => ({ vendor: b.vendor, posted: b })));
  return posted;
}
async function giveBack(vendor, why) {
  const bond = bonds.get(vendor);
  if (!bond) return;
  bonds.delete(vendor);
  const { hash } = await returnBond(metal, bond);
  console.log(`${vendor}'s bond is returned (${why}): ${explorer(hash)}`);
  stage.emit("bond", { step: "returned", vendor, amount: bond.amount, currency: bondTerms.currency, why, hash, url: explorer(hash) });
  vendorSees(vendor, `Bond returned: ${why}.`);
  run.settlements.find((x) => x.posted === bond).returned = { hash, why };
}
// The operator's transactions share a nonce, so they queue behind each other.
let operatorQueue = Promise.resolve();
const queued = (fn) => (operatorQueue = operatorQueue.then(fn, fn));
// Ctrl-C in the middle of a run: the bonds still open go back before the process exits, so a take that is
// cut short locks nothing in the escrow. A second Ctrl-C skips it; `npm run bonds:return` cleans up after.
let closing = false;
process.on("SIGINT", async () => {
  if (closing) process.exit(130);
  closing = true;
  if (bonds.size) console.log(`\nReturning ${bonds.size} open bond${bonds.size === 1 ? "" : "s"} before closing (Ctrl-C again to skip) …`);
  for (const vendor of [...bonds.keys()]) await queued(() => giveBack(vendor, "the run was stopped")).catch((error) => console.log(`(Couldn't return ${vendor}'s bond: ${error.message})`));
  process.exit(130);
});

// A cleared charge is the proof of sale: the winner's bond becomes Outbid's fee, and Outbid sends the
// buyer a cashback out of it. The cashback is Outbid's own money, paid through Airwallex.
async function settle(card, charge) {
  const { vendor } = card.approval;
  const bond = bonds.get(vendor);
  if (!bond) return;
  if (charge.outcome !== "approved") return say("The agreed charge did not clear, so the bond stays in escrow until the vendor's refund date.");
  console.log(`Proof of sale: Airwallex transaction ${charge.id}`);
  bonds.delete(vendor);
  const released = await queued(() => releaseBond(metal, bond, { chargeId: charge.id }));
  console.log(`${vendor}'s ${money(bond.amount, bondTerms.currency)} bond is released to Outbid as its fee: ${explorer(released.hash)}`);
  stage.emit("bond", { step: "released", vendor, cardId: card.id, txId: charge.id, amount: bond.amount, currency: bondTerms.currency, hash: released.hash, url: explorer(released.hash) });
  vendorSees(vendor, `The buyer's charge cleared, so the ${money(bond.amount, bondTerms.currency)} bond became Outbid's fee for the sale.`);
  const sent = await payout(aw, { amount: cashback, currency: bondTerms.currency, reference: `Outbid cashback ${released.hash.slice(0, 10)}` });
  console.log(`Cashback ${money(cashback, bondTerms.currency)} from Outbid to the buyer's bank: transfer ${sent.id} (${sent.status})`);
  stage.emit("cashback", { vendor, amount: cashback, of: bond.amount, currency: bondTerms.currency, transferId: sent.id, status: sent.status });
  Object.assign(run.settlements.find((x) => x.posted === bond), { released, cashback: { amount: cashback, payout: sent } });
}

// One round of bidding, as the pages and the terminal see it. A vendor's reasoning goes to its own
// console only; the buyer's side sees the bids and the short message that comes with each.
function tellRound(round) {
  for (const m of round.moves) {
    const price = m.price ? `${money(m.price.amount, m.price.currency)} ${m.billing}` : "no bid";
    console.log(`  round ${round.n} · ${m.vendor} ${m.action === "pass" ? `stops at ${price}` : `${m.action === "open" ? "opens at" : "goes down to"} ${price}`}${m.message ? ` · "${m.message}"` : ""}`);
    vendorSees(m.vendor, `${m.action === "pass" ? `Round ${round.n}: stops at ${price}.` : m.action === "open" ? `Sees the anonymous intent. Opens at ${price}.` : `Round ${round.n}: goes down to ${price}.`}${m.reasoning ? ` ${m.reasoning}` : ""}`);
  }
  stage.emit("round", { n: round.n, leader: round.leader, moves: round.moves.map(({ reasoning, ...m }) => m) });
  trace(codeStep({ op: `Bidding · round ${round.n}`, where: "src/bidding.mjs", detail: `${round.moves.map((m) => `${m.vendor} ${m.action === "pass" ? "stops" : money(m.price.amount, m.price.currency)}`).join(", ")} → ${round.leader} leads` }));
}

async function play() {
  run.auction = randomUUID();
  // What the intent asks for has to be on the market, and the card's merchant category follows it.
  if (!catalog[intent.category]) stop(`\nNothing on the market is called ${intent.category}, so there is nobody to ask.`);
  intent.merchantCategory = catalog[intent.category].merchantCategory;
  const bidders = bidderNames.map(agentOf).filter((a) => a.sells(intent));
  if (!bidders.length) stop(`\nNo vendor sells ${catalog[intent.category].name} yet, so the intent has nobody to bid on it.`);
  stage.emit("start", { intent, company, scenario, vendors: vendorNames, bidders: bidders.map((a) => a.name), bond: bondTerms, vendorModel: run.vendorModel, catalog: catalogForPages });

  scene(1, "Vendors' agents bid against each other.");
  let cash = await available(aw, cur);
  console.log(`Cash: ${money(cash, cur)} available, reserve floor ${money(company.policy.reserveFloor, cur)}\n`);
  stage.emit("cash", { available: cash });
  // Vendors bid harder for a sale that is certain, so the intent goes out with one more fact: the
  // balance covers a month at the budget above the reserve. That is checked here, on the Airwallex
  // balance just read, and an intent that fails it is not posted.
  const monthAtBudget = intent.budget.amount * (await rate(intent.budget.currency, cur));
  const verified = cash - company.policy.reserveFloor >= monthAtBudget;
  trace(codeStep({ op: "Check the funds behind the intent", where: "src/demo-cli.mjs", detail: verified ? "the balance covers the budget above the reserve" : "the balance can't cover the budget above the reserve" }));
  if (!verified) stop("\nThe balance can't cover a month at this budget above the reserve, so the intent isn't posted.");
  stage.emit("funds", { verified });
  trace(codeStep({ op: "Post the anonymous intent", where: "src/vendors.mjs", detail: `${bidders.length} vendor agents read it` }));
  await post(bidders.map((a) => a.name));
  const bidding = await runBidding({ intent, currency: cur, rate, agents: bidders, onRound: tellRound });
  run.bidding = bidding.rounds;
  const bids = bidding.bids;
  const opening = await decide({ intent, company, cash, bids, rate });
  ranked(opening);
  printRanking(opening, cur, { key: "opening", title: "Cheapest first over the term, priced with Airwallex FX", explanation: await voice({ intent, company, result: opening, key: "opening" }) });
  run.opening = opening;
  // The losers' bonds go back while the buyer decides.
  const losers = bids.filter((b) => b.vendor !== opening.winner?.vendor).map((b) => b.vendor);
  const returning = queued(async () => { for (const v of losers) await giveBack(v, "another bid won"); });
  returning.catch(() => {});
  if (!opening.winner) stop("\nNo bid fits the budget and reserve.");
  say(`\nPick: ${opening.winner.vendor}`);
  if (opening.reconsider) say(`Reconsider ${opening.reconsider.candidate} on ${opening.reconsider.at}, or sooner if cash recovers.`);
  for (const bid of bids) vendorSees(bid.vendor, bid.vendor === opening.winner.vendor ? "Won. The buyer's card will confirm it." : "Lost. Another bid won; the buyer stays anonymous.");

  scene(2, "One approval becomes the card.");
  if (!(await approve(approvalFor(opening.winner)))) stop("Not approved. No card issued.");
  let current = opening.winner;
  let card = await cardFor(aw, current);
  run.charges.push(await chargeAt(card, "Agreed charge", card.approval.amount, "agreed"));
  // The same vendor, billing more than it bid: the card's limit is the bid, so the network declines it.
  const extra = scenario.overcharge;
  run.charges.push(await chargeAt(card, `Agreed charge + ${extra.label.toLowerCase()}`, card.approval.amount + extra.amount, "overcharge"));
  await returning;

  scene(3, "The cleared charge closes the sale.");
  await settle(card, run.charges[0]);

  scene(4, "The vendor raises its price.", { later: true });
  const hiked = renewalBid(current);
  run.charges.push(await chargeAt(card, `Renewal at ${money(hiked.price.amount, hiked.price.currency)}`, hiked.price.amount, "renewal"));
  cash = await available(aw, cur);
  stage.emit("cash", { available: cash });
  // The other vendors stand by the last bid they made in the opening auction.
  const renewal = await reauction({ intent, company, cash, rate, incumbent: current, standing: bids, think });
  ranked(renewal.opened);
  console.log(`\nAuction reopened with ${current.vendor} at its renewal price:`);
  // The buyer console tells this one with the message to the incumbent, so it needs no explanation.
  printRanking(renewal.opened, cur, { key: "reopened", title: `The auction reopens with ${current.vendor} at its new price` });
  if (renewal.offer) {
    const per = current.billing === "annual" ? "year" : "month";
    const ask = `${renewal.offer.from} costs ${money(renewal.offer.amount, renewal.offer.currency)} per ${per}. Match, or the company switches.`;
    console.log(`\nTo ${current.vendor}: ${ask}`);
    const matched = renewal.matched?.price ?? null;
    console.log(matched ? `${current.vendor} matches at ${money(matched.amount, matched.currency)}.` : `${current.vendor} passes.`);
    stage.emit("offer", { to: current.vendor, from: renewal.offer.from, amount: renewal.offer.amount, currency: renewal.offer.currency, per, matched });
    if (renewal.matched?.reasoning) vendorSees(current.vendor, `Asked to match. ${renewal.matched.reasoning}`);
  }
  run.renewal = renewal;
  if (!renewal.result.winner) stop("\nNo bid fits the budget and reserve.");
  say(`\nPick: ${renewal.result.winner.vendor}`);
  if (!(await approve(approvalFor(renewal.result.winner)))) stop("Not approved. The old card stays as it is.");
  const previous = current;
  current = renewal.result.winner;
  // The term is over, so nothing is owed for leaving at renewal.
  ({ card } = await switchCard(card, current));
  if (current.vendor !== previous.vendor) vendorSees(previous.vendor, "Lost the renewal to a lower bid. The card is frozen.");
  run.charges.push(await chargeAt(card, "Renewed charge", card.approval.amount, "agreed"));

  scene(5, "Cash changes, and so does the best deal.", { later: true });
  const newcomers = laterNames.map(agentOf).filter((a) => a.sells(intent));
  await post(newcomers.map((a) => a.name));
  const offers = [];
  for (const agent of newcomers) {
    const made = await agent.move(intent);
    if (!made.bid) continue;
    offers.push(made.bid);
    vendorSees(agent.name, `Sees the anonymous intent. Offers ${money(made.bid.price.amount, made.bid.price.currency)} ${made.bid.billing}.${made.reasoning ? ` ${made.reasoning}` : ""}`);
  }
  cash = await available(aw, cur);
  stage.emit("cash", { available: cash });
  // The bids standing after the renewal, including the incumbent's renewed price, and the new offer.
  // Leaving the current vendor mid-term costs the exit fee its bid set, and every other bid carries it.
  const standing = [...renewal.result.ranked, ...offers];
  const leaving = await costOfLeaving(current, cur, rate);
  if (leaving) console.log(`Leaving ${current.vendor} now costs ${money(leaving.fee.amount, leaving.fee.currency)} (${money(leaving.amount, cur)}), counted against every other bid.`);
  const offered = await decide({ intent, company, cash, bids: standing, rate, leaving });
  ranked(offered);
  printRanking(offered, cur, { key: "annual", title: "A prepaid year, checked against today's cash", explanation: await voice({ intent, company, result: offered, key: "annual", context: { current: current.vendor, newOffers: offers.map((b) => b.vendor) } }) });
  run.annual = offered;
  let recheck = offered;
  if (offered.winner?.vendor === current.vendor) {
    console.log(`Staying with ${current.vendor} for now. The agent looks again when cash changes.`);
    // Said before the deposit is sent, so the page opens the payment's moment and its calls land there.
    stage.emit("incoming", { payer: scenario.customerPayment.payer, amount: scenario.customerPayment.amount, currency: cur });
    const paid = await deposit(aw, scenario.customerPayment.amount, scenario.customerPayment.payer);
    if (!paid.landed) stop(`${scenario.customerPayment.payer}'s ${money(scenario.customerPayment.amount, cur)} payment is still pending in the sandbox, and the recheck needs it in the balance. Cash stays at ${money(paid.cash, cur)}; run the demo again later.`);
    cash = await available(aw, cur);
    console.log(`${scenario.customerPayment.payer} paid ${money(scenario.customerPayment.amount, cur)}. Cash: ${money(cash, cur)}\n`);
    stage.emit("deposit", { payer: scenario.customerPayment.payer, amount: scenario.customerPayment.amount, currency: cur });
    stage.emit("cash", { available: cash });
    recheck = await decide({ intent, company, cash, bids: standing, rate, leaving });
    ranked(recheck);
    printRanking(recheck, cur, { key: "recheck", title: "The same rules, re-run on the new balance" });
  }
  run.recheck = recheck;
  if (!recheck.winner || recheck.winner.vendor === current.vendor) stop(`\nStaying with ${current.vendor}.`);
  say(`\nSwitch: ${current.vendor} → ${recheck.winner.vendor}`);
  if (!(await approve({ ...approvalFor(recheck.winner), leaving: leaving ? { vendor: current.vendor, ...leaving.fee } : null }))) stop(`Not approved. Staying with ${current.vendor}.`);
  const switched = await switchCard(card, recheck.winner, { exit: leaving?.fee ?? null });
  if (switched.paid) run.charges.push(switched.paid);
  vendorSees(current.vendor, `Lost the account: the buyer switched to an annual plan${switched.paid?.outcome === "approved" ? ` and paid the ${money(leaving.fee.amount, leaving.fee.currency)} exit fee your bid set` : ""}. The card is frozen.`);
  vendorSees(recheck.winner.vendor, "Won, now that the buyer's cash allows the prepay.");
  card = switched.card;
  const annual = await chargeAt(card, "First annual charge", card.approval.amount, "agreed");
  run.charges.push(annual, await chargeAt(switched.frozen, `Old card, ${switched.frozen.approval.vendor}`, switched.frozen.approval.amount, "old-card"));
  await settle(card, annual);
}

try {
  await play();
} catch (error) {
  if (!(error instanceof Stop)) throw error;
  say(error.message);
} finally {
  // Whatever happened, no vendor's bond is left locked: the ones still open go back.
  for (const vendor of [...bonds.keys()]) await queued(() => giveBack(vendor, "the auction closed without a sale")).catch((error) => console.log(`(Couldn't return ${vendor}'s bond: ${error.message})`));
  stage.emit("end");
  console.log(`\nRun log: ${saveRun("demo", { ...run, events: stage.events, log: aw.log, metal: metal.log })}`);
  console.log("The stage stays open; press Ctrl-C to close it.");
}
