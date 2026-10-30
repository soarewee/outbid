#!/usr/bin/env node
// The demo story against the live sandbox, scene by scene:
// 1. Vendors bid; the cheapest annual prepay is passed over to protect the reserve.
// 2. The winning bid becomes a card and the vendor prepays its acquisition fee into the Metal escrow.
//    The agreed charge clears; a charge at the wrong merchant is declined.
// 3. The cleared charge proves the sale: the escrow splits the fee into the buyer's rebate and Outbid's
//    fee, and the rebate goes out through Airwallex Payouts.
// 4. At renewal the hike is declined; the auction reopens and the incumbent matches or loses.
// 5. A customer payment lands; the agent re-runs the decision and switches to the annual prepay with a
//    new card, freezing the old one.
// Run: npm run demo   (add -- --yes to approve every step without a prompt)
import { createClient, saveRun } from "./airwallex.mjs";
import { airwallexRates } from "./fx.mjs";
import { collectBids, renewalBid } from "./vendors.mjs";
import { decide } from "./auction.mjs";
import { reauction } from "./renewal.mjs";
import { available, deposit, payout, setAvailable } from "./funds.mjs";
import { createMetal, explorer, prepayFee, releaseFee } from "./metal.mjs";
import { approvalFor } from "./approval.mjs";
import { freezeCard } from "./issuing.mjs";
import { approve, cardFor, chargeAndPrint, load, money, printRanking } from "./cli.mjs";

const intent = load("intent");
const company = load("company");
const scenario = load("scenario");
const cur = company.currency;

const aw = createClient();
const metal = createMetal();
await aw.login();
const rate = airwallexRates(aw);
const run = { scenes: [] };
const scene = (n, title) => {
  console.log(`\n━━ ${n}. ${title}`);
  run.scenes.push({ n, title });
};
const stop = (why) => {
  console.log(why);
  finish();
  process.exit(0);
};
const finish = () => console.log(`\nRun log: ${saveRun("demo", { ...run, log: aw.log, metal: metal.log })}`);
const chargeAt = (card, label, amount) =>
  chargeAndPrint(aw, card, { label, amount, currency: card.approval.currency, mcc: card.approval.merchantCategory, merchant: card.approval.vendor });

// Replaces the current card with one for the newly approved bid, then freezes the old one.
async function switchCard(oldCard, bid) {
  const card = await cardFor(aw, bid);
  const frozen = await freezeCard(aw, oldCard);
  console.log(`Old card ${frozen.id} (${oldCard.approval.vendor}) → ${frozen.status}`);
  return { card, frozen };
}

const reset = await setAvailable(aw, cur, scenario.startingCash);
console.log(`Sandbox ${cur} balance set to ${money(reset.after, cur)} (was ${money(reset.before, cur)})`);

scene(1, "Vendors bid on the intent");
console.log(`Intent: ${intent.category}, ${intent.seats} seats, up to ${money(intent.budget.amount, intent.budget.currency)}/${intent.budget.per}, ${intent.termMonths} months`);
let cash = await available(aw, cur);
console.log(`Cash: ${money(cash, cur)} available, reserve floor ${money(company.policy.reserveFloor, cur)}\n`);
const opening = await decide({ intent, company, cash, bids: await collectBids(intent), rate });
printRanking(opening, cur);
if (!opening.winner) stop("\nNo bid fits the budget and reserve.");
console.log(`\nPick: ${opening.winner.vendor}`);
if (opening.reconsider) console.log(`Reconsider ${opening.reconsider.candidate} on ${opening.reconsider.at}, or when ${opening.reconsider.orWhen}.`);
run.opening = opening;

scene(2, "The winning bid becomes the card");
if (!(await approve(approvalFor(opening.winner)))) stop("Not approved. No card issued.");
let current = opening.winner;
let card = await cardFor(aw, current);
const fee = scenario.acquisitionFee;
const prepaid = await prepayFee(metal, { vendor: current.vendor, dealKey: `outbid:${card.id}`, amount: fee.amount });
console.log(`${current.vendor} prepays its ${money(fee.amount, fee.currency)} acquisition fee into the escrow (USDZ): ${explorer(prepaid.hash)}`);
run.prepaid = prepaid;
run.charges = [await chargeAt(card, "Agreed charge", card.approval.amount)];
const wrong = scenario.wrongMerchant;
run.charges.push(await chargeAndPrint(aw, card, { label: "Wrong merchant", amount: wrong.amount, currency: card.approval.currency, mcc: wrong.mcc, merchant: wrong.name }));

scene(3, "The cleared charge releases the fee");
const agreed = run.charges[0];
if (agreed.outcome !== "approved") stop("The agreed charge did not clear, so the fee stays in escrow until the vendor's refund date.");
// The Airwallex transaction id is the proof of sale. If the sandbox can't simulate the charge there is
// none, so the offline check's result stands in and says so.
const chargeId = agreed.id ?? `offline-check:${card.id}:${agreed.amount}`;
if (!agreed.id) console.log(`  (no sandbox transaction id; proof is ${chargeId})`);
const released = await releaseFee(metal, { dealId: prepaid.dealId, chargeId });
const rebate = (fee.amount * released.rebateBps) / 10_000;
console.log(`Escrow split ${money(fee.amount, fee.currency)}: ${money(rebate, fee.currency)} rebate, ${money(fee.amount - rebate, fee.currency)} Outbid fee: ${explorer(released.hash)}`);
const rebatePayout = await payout(aw, { amount: rebate, currency: fee.currency, reference: `Outbid rebate ${released.hash.slice(0, 10)}` });
console.log(`Rebate payout ${money(rebate, fee.currency)} to the buyer's bank: transfer ${rebatePayout.id} (${rebatePayout.status})`);
run.released = { ...released, rebate, payout: rebatePayout };

scene(4, "Renewal: the price hike is declined and re-auctioned");
const hiked = renewalBid(current);
run.charges.push(await chargeAt(card, `Renewal at ${money(hiked.price.amount, hiked.price.currency)}`, hiked.price.amount));
cash = await available(aw, cur);
const renewal = await reauction({ intent, company, cash, rate, incumbent: current });
console.log(`\nAuction reopened with ${current.vendor} at its renewal price:`);
printRanking(renewal.opened, cur);
if (renewal.offer) {
  console.log(`\nTo ${current.vendor}: ${renewal.offer.from} costs ${money(renewal.offer.amount, renewal.offer.currency)} per ${current.billing === "annual" ? "year" : "month"}. Match, or the company switches.`);
  console.log(renewal.matched ? `${current.vendor} matches at ${money(renewal.matched.price.amount, renewal.matched.price.currency)}.` : `${current.vendor} passes.`);
}
run.renewal = renewal;
if (!renewal.result.winner) stop("\nNo bid fits the budget and reserve.");
console.log(`\nPick: ${renewal.result.winner.vendor}`);
if (!(await approve(approvalFor(renewal.result.winner)))) stop("Not approved. The old card stays as it is.");
current = renewal.result.winner;
({ card } = await switchCard(card, current));
run.charges.push(await chargeAt(card, "Renewed charge", card.approval.amount));

scene(5, "Cash recovers, so the annual bid comes back");
await deposit(aw, scenario.customerPayment.amount, scenario.customerPayment.payer);
cash = await available(aw, cur);
console.log(`${scenario.customerPayment.payer} paid ${money(scenario.customerPayment.amount, cur)}. Cash: ${money(cash, cur)}\n`);
// The bids standing after the renewal, including the incumbent's renewed price.
const recheck = await decide({ intent, company, cash, bids: renewal.result.ranked, rate });
printRanking(recheck, cur);
run.recheck = recheck;
if (!recheck.winner || recheck.winner.vendor === current.vendor) stop(`\nStaying with ${current.vendor}.`);
console.log(`\nSwitch: ${current.vendor} → ${recheck.winner.vendor}`);
if (!(await approve(approvalFor(recheck.winner)))) stop(`Not approved. Staying with ${current.vendor}.`);
const switched = await switchCard(card, recheck.winner);
card = switched.card;
run.charges.push(await chargeAt(card, "First annual charge", card.approval.amount));
run.charges.push(await chargeAt(switched.frozen, `Old card, ${switched.frozen.approval.vendor}`, switched.frozen.approval.amount));

finish();
