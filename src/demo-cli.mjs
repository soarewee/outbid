#!/usr/bin/env node
// The demo story against the live sandbox, scene by scene:
// 0. The buyer says what the company needs in plain words; Claude writes the anonymous intent from it.
// 1. Two vendors bid on it, priced with Airwallex FX; the cheapest over the term wins.
// 2. The winning bid becomes a card and the vendor prepays its acquisition fee into the Metal escrow.
//    The agreed charge clears; a charge at the wrong merchant is declined.
// 3. The cleared charge proves the sale: the escrow splits the fee into the buyer's rebate and Outbid's
//    fee, and the rebate goes out through Airwallex Payouts.
// 4. At renewal the hike is declined; the auction reopens and the incumbent matches or loses.
// 5. A third vendor offers a prepaid year, cheaper in total. Today's cash can't carry it above the
//    reserve, so the agent stays; a customer payment lands, the same rules re-run, and it switches with
//    a new card, freezing the old one. The new vendor's fee goes through the same escrow.
// Every Airwallex request, Metal transaction and Claude call is also sent to the buyer console's agent
// panel (src/trace.mjs), so the page shows what the agent is doing and where.
// The run is shown live on the stage (local pages). Run: npm run demo
//   --yes    approve every step without a prompt
//   --wait   let the buyer post the intent from the page (http://localhost:4780/buyer) instead of
//            reading data/intent.json; the story starts when it is posted
import { createClient, saveRun } from "./airwallex.mjs";
import { airwallexRates } from "./fx.mjs";
import { bidderNames, collectBids, laterBids, renewalBid, vendorNames } from "./vendors.mjs";
import { decide } from "./auction.mjs";
import { reauction } from "./renewal.mjs";
import { available, deposit, payout, setAvailable } from "./funds.mjs";
import { createMetal, explorer, prepayFee, releaseFee } from "./metal.mjs";
import { approvalFor } from "./approval.mjs";
import { freezeCard } from "./issuing.mjs";
import { openStage } from "./stage.mjs";
import { approve, cardFor, chargeAndPrint, load, money, printRanking, useStage } from "./cli.mjs";
import { MODEL, draftIntent, explain } from "./model.mjs";
import { airwallexCall, claudeCall, codeStep, metalCall } from "./trace.mjs";

let intent = load("intent");
const company = load("company");
const scenario = load("scenario");
const cur = company.currency;
const fee = scenario.acquisitionFee;

const run = { scenes: [], charges: [], settlements: [], model: process.env.ANTHROPIC_API_KEY ? MODEL : null, drafts: [], explanations: [] };
// The agent drafts the intent from the buyer's own words. The draft is checked by code before it is posted.
async function draft(text) {
  const drafted = await draftIntent(text);
  if (!drafted) return null;
  stage.emit("call", claudeCall({ op: "Read your request, wrote the intent", model: drafted.model, usage: drafted.usage, ms: drafted.ms, detail: `${drafted.withheld.length} things kept from vendors` }));
  run.drafts.push({ request: text, ...drafted });
  stage.emit("drafted", { request: text, intent: drafted.intent, withheld: drafted.withheld, note: drafted.note, model: drafted.model });
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
if (process.argv.includes("--wait")) {
  console.log(`Waiting for the buyer to post the intent at ${stage.url}/buyer …`);
  stage.emit("await-intent", { defaults: intent, company });
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
await aw.login();
const rate = airwallexRates(aw);
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
const chargeAt = (card, label, amount) =>
  chargeAndPrint(aw, card, { label, amount, currency: card.approval.currency, mcc: card.approval.merchantCategory, merchant: card.approval.vendor });

// Replaces the current card with one for the newly approved bid, then freezes the old one.
async function switchCard(oldCard, bid) {
  const card = await cardFor(aw, bid, { replaces: oldCard.id });
  const frozen = await freezeCard(aw, oldCard);
  console.log(`Old card ${frozen.id} (${oldCard.approval.vendor}) → ${frozen.status}`);
  stage.emit("cardStatus", { id: frozen.id, status: frozen.status });
  return { card, frozen };
}

// The winning vendor prepays its acquisition fee into the escrow for this card's deal.
async function prepay(card) {
  const { vendor } = card.approval;
  const prepaid = await prepayFee(metal, { vendor, dealKey: `outbid:${card.id}`, amount: fee.amount });
  console.log(`${vendor} prepays its ${money(fee.amount, fee.currency)} acquisition fee into the escrow (USDZ): ${explorer(prepaid.hash)}`);
  stage.emit("escrow", { step: "prepaid", vendor, cardId: card.id, amount: fee.amount, currency: fee.currency, hash: prepaid.hash, url: explorer(prepaid.hash) });
  return prepaid;
}

// A cleared charge is the proof of sale: the escrow splits the fee and the rebate is paid out.
async function settle(card, prepaid, charge) {
  const { vendor } = card.approval;
  if (charge.outcome !== "approved") return say("The agreed charge did not clear, so the fee stays in escrow until the vendor's refund date.");
  console.log(`Proof of sale: Airwallex transaction ${charge.id}`);
  const released = await releaseFee(metal, { dealId: prepaid.dealId, chargeId: charge.id });
  const rebate = (fee.amount * released.rebateBps) / 10_000;
  const outbidFee = fee.amount - rebate;
  console.log(`Escrow split ${money(fee.amount, fee.currency)}: ${money(rebate, fee.currency)} rebate, ${money(outbidFee, fee.currency)} Outbid fee: ${explorer(released.hash)}`);
  stage.emit("escrow", { step: "released", vendor, cardId: card.id, txId: charge.id, amount: fee.amount, rebate, outbidFee, currency: fee.currency, hash: released.hash, url: explorer(released.hash) });
  const rebatePayout = await payout(aw, { amount: rebate, currency: fee.currency, reference: `Outbid rebate ${released.hash.slice(0, 10)}` });
  console.log(`Rebate payout ${money(rebate, fee.currency)} to the buyer's bank: transfer ${rebatePayout.id} (${rebatePayout.status})`);
  stage.emit("escrow", { step: "payout", amount: rebate, currency: fee.currency, transferId: rebatePayout.id, status: rebatePayout.status });
  run.settlements.push({ vendor, prepaid, released: { ...released, rebate, payout: rebatePayout } });
}

async function play() {
  settingUp = true;
  const reset = await setAvailable(aw, cur, scenario.startingCash, { waitMs: 60_000, retryAfterMs: 20_000 }).finally(() => (settingUp = false));
  trace({ service: "airwallex", op: "Demo setup · reset the sandbox balance", endpoint: "simulated deposit or payout", detail: `${money(reset.before, cur)} → ${money(reset.after, cur)}, so every run starts the same`, ok: true, ms: 0 });
  console.log(`Sandbox ${cur} balance set to ${money(reset.after, cur)} (was ${money(reset.before, cur)})`);
  if (reset.pending) console.log(`The sandbox hasn't settled the ${money(reset.pending, cur)} top-up yet, so the run starts from ${money(reset.after, cur)} instead of ${money(scenario.startingCash, cur)}.`);
  stage.emit("start", { intent, company, scenario, vendors: vendorNames, bidders: bidderNames });

  scene(1, "Two vendors bid. The cheapest wins.");
  let cash = await available(aw, cur);
  console.log(`Cash: ${money(cash, cur)} available, reserve floor ${money(company.policy.reserveFloor, cur)}\n`);
  stage.emit("cash", { available: cash });
  trace(codeStep({ op: "Post the anonymous intent", where: "src/vendors.mjs", detail: `${bidderNames.length} vendor agents read it` }));
  const bids = await collectBids(intent);
  for (const bid of bids) vendorSees(bid.vendor, `Sees the anonymous intent. Bids ${money(bid.price.amount, bid.price.currency)} ${bid.billing}.`);
  const opening = await decide({ intent, company, cash, bids, rate });
  ranked(opening);
  printRanking(opening, cur, { key: "opening", title: "Cheapest first over the term, priced with Airwallex FX", explanation: await voice({ intent, company, result: opening, key: "opening" }) });
  run.opening = opening;
  if (!opening.winner) stop("\nNo bid fits the budget and reserve.");
  say(`\nPick: ${opening.winner.vendor}`);
  if (opening.reconsider) say(`Reconsider ${opening.reconsider.candidate} on ${opening.reconsider.at}, or sooner if cash recovers.`);
  for (const bid of bids) vendorSees(bid.vendor, bid.vendor === opening.winner.vendor ? "Won. The buyer's card will confirm it." : "Lost. Another bid won; the buyer stays anonymous.");

  scene(2, "One approval becomes the card.");
  if (!(await approve(approvalFor(opening.winner)))) stop("Not approved. No card issued.");
  let current = opening.winner;
  let card = await cardFor(aw, current);
  // The vendor's prepay (Metal, several seconds) runs while the card is charged, so the charges land on
  // the card right after it is issued instead of after the escrow. The fee is released only after both.
  const prepaying = prepay(card);
  prepaying.catch(() => {}); // awaited below; this only keeps an early failure from being unhandled
  run.charges.push(await chargeAt(card, "Agreed charge", card.approval.amount));
  const wrong = scenario.wrongMerchant;
  run.charges.push(await chargeAndPrint(aw, card, { label: "Wrong merchant", amount: wrong.amount, currency: card.approval.currency, mcc: wrong.mcc, merchant: wrong.name }));
  let prepaid = await prepaying;

  scene(3, "The cleared charge releases the vendor's fee.");
  await settle(card, prepaid, run.charges[0]);

  scene(4, "The vendor raises its price.", { later: true });
  const hiked = renewalBid(current);
  run.charges.push(await chargeAt(card, `Renewal at ${money(hiked.price.amount, hiked.price.currency)}`, hiked.price.amount));
  cash = await available(aw, cur);
  stage.emit("cash", { available: cash });
  const renewal = await reauction({ intent, company, cash, rate, incumbent: current });
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
  }
  run.renewal = renewal;
  if (!renewal.result.winner) stop("\nNo bid fits the budget and reserve.");
  say(`\nPick: ${renewal.result.winner.vendor}`);
  if (!(await approve(approvalFor(renewal.result.winner)))) stop("Not approved. The old card stays as it is.");
  const previous = current;
  current = renewal.result.winner;
  ({ card } = await switchCard(card, current));
  if (current.vendor !== previous.vendor) vendorSees(previous.vendor, "Lost the renewal to a lower bid. The card is frozen.");
  run.charges.push(await chargeAt(card, "Renewed charge", card.approval.amount));

  scene(5, "Cash changes, and so does the best deal.", { later: true });
  const offers = await laterBids(intent);
  for (const bid of offers) vendorSees(bid.vendor, `Sees the anonymous intent. Bids ${money(bid.price.amount, bid.price.currency)} ${bid.billing}.`);
  cash = await available(aw, cur);
  stage.emit("cash", { available: cash });
  // The bids standing after the renewal, including the incumbent's renewed price, and the new offer.
  const standing = [...renewal.result.ranked, ...offers];
  const offered = await decide({ intent, company, cash, bids: standing, rate });
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
    recheck = await decide({ intent, company, cash, bids: standing, rate });
    ranked(recheck);
    printRanking(recheck, cur, { key: "recheck", title: "The same rules, re-run on the new balance" });
  }
  run.recheck = recheck;
  if (!recheck.winner || recheck.winner.vendor === current.vendor) stop(`\nStaying with ${current.vendor}.`);
  say(`\nSwitch: ${current.vendor} → ${recheck.winner.vendor}`);
  if (!(await approve(approvalFor(recheck.winner)))) stop(`Not approved. Staying with ${current.vendor}.`);
  const switched = await switchCard(card, recheck.winner);
  vendorSees(current.vendor, "Lost the account: the buyer switched to an annual plan. The card is frozen.");
  vendorSees(recheck.winner.vendor, "Won, now that the buyer's cash allows the prepay.");
  card = switched.card;
  const prepayingAnnual = prepay(card);
  prepayingAnnual.catch(() => {});
  const annual = await chargeAt(card, "First annual charge", card.approval.amount);
  run.charges.push(annual, await chargeAt(switched.frozen, `Old card, ${switched.frozen.approval.vendor}`, switched.frozen.approval.amount));
  prepaid = await prepayingAnnual;
  await settle(card, prepaid, annual);
}

try {
  await play();
} catch (error) {
  if (!(error instanceof Stop)) throw error;
  say(error.message);
} finally {
  stage.emit("end");
  console.log(`\nRun log: ${saveRun("demo", { ...run, events: stage.events, log: aw.log, metal: metal.log })}`);
  console.log("The stage stays open; press Ctrl-C to close it.");
}
