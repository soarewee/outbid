# Outbid

Your agent posts what it wants to buy. Vendors compete. The winning bid becomes the card.

Outbid is a purchase-intent auction for what a company buys on subscription, software or GPU capacity, built for the Airwallex Agentic Banking Hackathon
(Kit 02: Intent-Bound Purchase Agent). The buyer tells the company's agent what it needs in plain words, the agent
(Claude) writes an anonymous intent from it, vendors' own agents bid against each other round by round, the cheapest
bid over the term wins (or waits, if paying it would break the company's cash reserve), and the approved terms become
an Airwallex virtual card that can only pay that vendor, that amount, in that currency. Both sides are bound: a
vendor posts a bond to bid and can't charge more than it bid, and leaving a commitment early costs the exit fee the
bid set.

> **Demo video (3.5 min): [youtu.be/LJz_P2lyHMo](https://youtu.be/LJz_P2lyHMo)**
>
> The demo runs end to end against the Airwallex sandbox and Metal testnet, with a buyer console and a vendor
> console that fill in live. A replay of a recorded run is hosted at [outbid.fly.dev](https://outbid.fly.dev)
> (site, [buyer console](https://outbid.fly.dev/buyer), [vendor console](https://outbid.fly.dev/vendor)); it never
> touches the sandbox. `fly deploy` from the repository updates it (`Dockerfile`, `fly.toml`).

## Run it

Node 20 or later, no dependencies, no build.

1. Create a sandbox account at [sandbox.airwallex.com](https://sandbox.airwallex.com). Register the business in the
   **United States** and name it `Sandbox Business` or `New Business Sandbox` so it skips review; card issuing is
   rejected with `Invalid issuance details` for businesses in unsupported regions. Create a Client ID and API key
   under Account → Developer → API keys.
2. Get a Metal testnet RPC endpoint and a disposable test key (`cast wallet new`) funded with USDZ from the faucet.
   The escrow is already deployed; the key only funds the vendors' bid bonds.
3. `cp .env.example .env` and fill in the keys. Never commit `.env`.
4. `npm run demo -- --wait`, then open [localhost:4780/buyer](http://localhost:4780/buyer), tell the agent what the
   company needs, and post the intent it writes. With `ANTHROPIC_API_KEY` in `.env` Claude writes it; without, you
   fill in the four fields yourself.

## The site and the two consoles

`web/` is three static pages served by the demo itself (`src/stage.mjs`, `node:http` only), at
[localhost:4780](http://localhost:4780) while a demo or replay is running:

- `/` (`web/index.html`) is the site: what Outbid does, how it works, who sees what, why a card, the sandbox
  evidence, and how to run it. It also opens straight from the file.
- `/buyer` (`web/buyer.html`) is the **buyer console**, where the company's agent starts. It opens on a text box:
  the buyer says what the company needs in their own words, and the agent (Claude) writes the anonymous intent
  from it, showing what it kept from vendors (the name, the cash, what it's for). Beside the story, on screens
  1180px and wider, the **agent panel** lists every call the agent makes as it makes it, tagged by where it goes:
  Claude for words, Airwallex for money, Metal for the bid bonds, Code for its own rules, and You for the approvals
  (`src/trace.mjs` names each one). The rest is one screen: the purchase at the top (the intent, a status,
  available cash, what the card pays, Outbid's cashback so far, and the reserve floor once it matters) and the moment
  that is happening now in the middle. Inside a part the moments replace
  each other on their own; between parts the run stops on a Continue button, so nothing passes by
  unread, and the approval waits for its click (in a replay too). The purchase is three parts: the intent
  being posted (or the request box, with `--wait`), the vendors' agents posting their bonds and undercutting each
  other round by round until one stops, then their last bids ranked by FX-priced
  total cost, with the agent's explanation in its own words; the approval, which says exactly what the buyer agrees to, and
  then that approval issued as the card, its controls locking in one by one and each charge landing on it
  with the reason Issuing gave (the agreed charge clears; the same vendor billing a setup fee on top is declined);
  the cleared charge releasing the winner's bond. It ends on its own screen: "That's the purchase.", with a count
  of what the buyer did and what the agent called.
  The edge cases (months later, the declined renewal hike, the reopened auction and the message to the
  incumbent; a prepaid year that would break the reserve, the customer payment, the recheck, and the exit fee paid on the old
  card before it is frozen) are listed there and played only on request, under a band that
  says so, and a card that replaces another is shown as a swap, not as another card. Small things show as
  a caption under the stage, and the strip at the bottom jumps to any part.
- `/vendor` (`web/vendor.html`) is a **vendor console**, one vendor at a time (switch at the top, or `?v=Vendor%20B`).
  Its agent sees the anonymous intent and that the funds behind it are verified, its own bid in each round with its
  agent's reasoning, whether it was picked, the deal the buyer's card is
  bound to, its own charges (cleared, or declined for billing above what it bid), its bid bond (posted, then
  returned or released as Outbid's fee), and at renewal the message from Outbid: match, or the buyer switches. Never the buyer's name,
  cash or the other bids.

Both consoles fill in live from the same run, so they can be recorded side by side. The run names the vendors
`Vendor A`, `Vendor B` and `Vendor C` (so do the pitch and the saved runs); the pages show them as the fictional
brands Orbit, Harbor and Summit, each with its own mark (`web/brands.js`).

## Demo

`npm run demo` plays the whole story against the sandbox and Metal testnet. The demo first sets the USD balance to
the scenario's starting cash (`data/scenario.json`) with a simulated deposit or a payout, before the request is
read, so every run starts from the same place. Vendors price per GPU, so the bids follow the quantity in the intent; 2 GPUs give the demo's numbers,
and keep the annual prepay under the sandbox's card limit.

0. Claude reads the buyer's request (`request` in `data/intent.json`, or the text box with `--wait`) and writes the
   anonymous intent from it. The request names no budget, so the agent doesn't ask for one: code reads the
   Airwallex balance and takes the most the company can pay a month and still keep its reserve through the horizon
   (`affordablePerMonth` in `src/auction.mjs`; $5,100 at the scenario's $80,000). Code checks the four fields
   before they are posted.
1. The agent checks the Airwallex balance covers the budget above the reserve, so the intent goes out as funded.
   Two vendors each post a $25 bid bond into the escrow on Metal, and their agents bid: both open, then whoever is
   behind is told the price to beat (priced with Airwallex FX) and undercuts or stops (`src/bidding.mjs`). The last
   bids are ranked on total cost over the term; the cheapest wins and the loser's bond goes straight back.
2. The winning bid becomes a card. The agreed charge clears; the same vendor billing a setup fee on top of its bid
   is declined with `LIMIT_EXCEEDED`.
3. The cleared charge is the proof of sale. Outbid reports it to the escrow, which releases the winner's bond to
   Outbid as its fee for the sale. Outbid sends the buyer a cashback out of that fee (20%) through Airwallex Payouts.
4. At renewal the incumbent's price hike is declined by the card. The auction reopens with the hiked price, and the
   incumbent is offered the best competing price: match, or the company switches. Any change of terms gets a new card
   and the old one is frozen.
5. A third vendor offers the term prepaid, the cheapest total even after the exit fee the current vendor's bid set
   (one month's price, counted against every other bid). Paying both up front would put cash under the reserve
   floor in week 7, so the agent stays and says when it will look again. A customer payment lands in the Global
   Account, the agent re-runs the same rules, the prepay now fits, and after approval it gets a new card; the old
   card takes the exit fee as its last charge, is frozen, and declines.

The demo buys GPUs, but nothing in the code is about GPUs. What can be bought is a list in `data/catalog.json`
(a name, a unit, a description the agent reads, the card's merchant category), and each vendor in
`src/vendors.mjs` has a price list with a list price and a floor per category it sells. The agent picks the
category that fits the request, vendors bid on whatever is on their list, and the card is bound to that
category's merchant code. The catalog has a second category to show it: `npm run demo -- --request "Our product
team of 25 people needs a design tool for the next year."` runs the same five parts for 25 design tool seats,
on a card bound to software vendors (MCC 5734). To sell something new, add it to the catalog and give a vendor
a price for it.

Every step that changes a card asks for approval, on the buyer console or in the terminal; add `-- --yes` to approve
them all. The buyer console also stops between parts until Continue is pressed, so a live run that has moved on is
simply queued until the viewer gets there. `-- --wait` lets the buyer post the intent from the console instead of reading `data/intent.json`. Each run
saves its stage events with the request log in `out/`, and `npm run demo:replay -- out/demo-<time>.json` plays them
back on the pages with the original pacing, without touching the sandbox (`--speed 2` to hurry).

## Where the agent runs, and what Claude does

The buyer's agent is the demo process itself (`npm run demo`, on your machine). It calls Airwallex for money,
Metal for the bid bonds, and Claude (`claude-opus-5-5`, over the Messages API, `src/model.mjs`) for words, and the
buyer console's agent panel shows each call as it happens. For the buyer, Claude does two things:

- **It writes the intent.** It reads the buyer's request and returns the four fields as JSON against a schema
  (structured outputs), with a list of what it kept back from vendors. The request can describe a job instead of naming what to buy ("fine-tune a vision model, about 150 GB of
  GPU memory"): Claude picks the category that fits, of the ones on the market (H100s today), works out how many
  units the job needs, and gives the reason. It fills in what the request leaves loose ("next year" is 12 months)
  and says so, but it never invents a budget: when none is stated it says so, and
  code sets it from the balance. Code checks the fields
  (`stage.checkIntent`) before they are posted, and the buyer can edit them first.
- **It explains each decision.** After each ranking it gets the ranking, each vendor's own terms and, only when a
  bid would break the reserve, the cash projection, and writes one short paragraph for the buyer, marked on the
  page as the agent's words.

Each vendor has an agent too (`src/vendors.mjs`, `vendorMove` in `src/model.mjs`, `claude-haiku-5-5` by default,
`OUTBID_VENDOR_MODEL` to change it). It is shown only its own vendor's private profile (list price, floor, how much
it wants the deal), the anonymous intent and the price to beat, and decides each round whether to undercut or stop,
with a short message that goes with its bid and its reasoning, which only its own console shows. Its limits are
code: a bid is clamped between the vendor's floor and its list price whatever the agent answers, and nothing a
vendor's agent writes is passed to the buyer's model. Without a key the vendors bid on a fixed strategy.

The decision is code: `src/auction.mjs` ranks the bids by total cost over the term, prices foreign-currency bids
with Airwallex FX, checks each against the monthly budget and projects cash against the reserve floor; when the
company would have to leave its current vendor, that vendor's exit fee is added to every other bid. The model
never picks the winner. Without `ANTHROPIC_API_KEY` the buyer fills in the four fields and the console uses its
own wording; the decision is the same either way.

## Evidence

`evidence/2026-11-13.json` is a publishable copy of the run behind the site and the Demo Day video (up to the
end of the purchase, `--purchase-only`): the stage events, the Metal escrow
transactions (public on [testnet.metalntwx.com](https://testnet.metalntwx.com)), and for each Airwallex call that
proves a step (a card issued, a charge decided, a transfer created, an FX quote, a deposit) the response fields that
prove it, with the ids. Credentials, cardholder and beneficiary records are left out. `npm run evidence -- out/demo-<time>.json`
writes one for any saved run (`--purchase-only` keeps the events up to the end of the purchase, for a run stopped
in the edge cases, so the replay ends on "That's the purchase."), and the consoles say whether they are live against the sandbox or replaying a recording.

## Bid bonds on Metal

Everything that touches the company's money is on Airwallex: the balance, FX, the card, the charges, the payout.
One thing is onchain: the vendors' bid bonds. A bond is money that belongs to nobody yet (back to the vendor if it
loses, Outbid's fee if its sale clears), posted by vendors Outbid has never met, so Outbid shouldn't be the one
holding it.

`contracts/` is a Foundry project with `FeeEscrow`, deployed on Metal testnet (chain 63825) at the address in
`contracts/deployments/metal-testnet.json`. A vendor posts its bond in USDZ before it bids, one deal per auction and
vendor. Outbid's attester can send a bond only two ways: back to the vendor that posted it (it lost, or the buyer
declined), or to Outbid's fee account with the hash of the cleared Airwallex transaction as the proof, once, before
the deadline. If no charge clears by the deadline, the vendor takes its bond back itself. The contract can't see the
card network, so the cleared charge is Outbid's attestation; what the contract guarantees is where a bond can go,
and a public record of which charge released it. Every transfer checks that the recipient's balance rose by the full amount, since Metal can quarantine a
credit instead of delivering it.

- `cd contracts && forge test` runs the contract tests (no library dependencies).
- `npm run escrow:deploy` deploys a new escrow and records it (needs `METAL_RPC_URL` and `METAL_PRIVATE_KEY`).
- A run returns the bonds still open when it ends or is stopped with Ctrl-C. If one was killed harder than that
  (a crash, a closed terminal), its bonds stay locked until their deadline and the test wallets run dry after a few
  such runs: `npm run bonds:return` finds the bonds still funded and sends each back to its vendor.
- Vendor and fee wallets are test wallets derived from `METAL_PRIVATE_KEY`, so no other keys are stored.
  The operator funds each vendor's bond and sweeps earlier demo fees back when it runs short.

In the sandbox one Airwallex account plays both the buyer and Outbid, so the cashback payout leaves the same wallet
the buyer's cash is read from.

## Auction

`npm run auction` runs one auction against the sandbox: three vendor agents bid on an anonymous intent, bids are
priced in the company's currency with Airwallex FX and ranked by total cost over the term, and the cheapest bid that
keeps projected cash (live balance minus upcoming obligations) above the reserve floor wins. After you approve the
terms, it issues a virtual card whose controls are exactly those terms and simulates the first charge at the winning
price. Add `-- --yes` to approve without a prompt. The run log is written to `out/`.

Every charge outcome comes from Airwallex Issuing. An API error is reported as an error, never as a decline. With
`ANTHROPIC_API_KEY` set, the agent's explanation of the ranking is written by Claude (see "The agent's voice").

## Sandbox notes

- FX quotes come back in the market pair's direction whichever way you trade: selling USD for EUR returns
  `currency_pair: EURUSD` with USD per EUR, so the rate is inverted for that direction.
- A card is frozen with `POST /api/v1/issuing/cards/{id}/update` and `card_status: INACTIVE`, and unfrozen with
  `ACTIVE`. Other names such as `FROZEN` are rejected with `invalid card_status`.
- A simulated charge answers with `process_result` (`APPROVED` or `DECLINED`), `failure_reason` on a decline, and
  `card_transaction_id`, which is the proof of sale the escrow release records. Between Oct 26 and Oct 31 the
  endpoint answered every charge with `400 failed to process transaction`.
- Airwallex's standard card controls are currency, merchant category, amount, dates and count: none names one
  merchant. `authorization_controls.allowed_merchant_brands.ids` does, for merchants in Airwallex's brand list
  (`GET /api/v1/issuing/merchant_brands?name=…`, which the sandbox serves). A sandbox card created with a brand id
  stores it and declines other merchants with `MERCHANT_BRAND_NOT_ALLOWED` (Nov 13). But a simulated charge carries
  only a free-text `merchant_info`, which the sandbox never resolves to a brand, so the brand's own charge is declined
  too. So a vendor with a brand id gets a card bound to it (`cardControls` in `src/approval.mjs`), and the demo's
  fictional vendors, which have none, get cards bound by category, currency and amount: a different vendor in the
  same category billing the same currency within the limit would clear.
- A card's per-transaction limit is capped per account: `GET /api/v1/issuing/config` reports `maximum: 50000` for USD
  and EUR here, and a higher limit is rejected with `limit setting exceed max spending limit for the account`.
- A `LOCAL` USD transfer to an ACH beneficiary has no fee and lowers the available balance as soon as it is created.
  Simulated deposits usually show up in the available balance right away, but not always: on Nov 7 a $4,540 deposit
  stayed `PENDING` (estimated to settle at the end of the day) while a $1 one settled in 0.2 s. The demo sends a deposit
  again if it hasn't landed in 45 s, starts from the cash it has if the opening top-up never lands, and stops with a
  message if the customer payment in the last part doesn't.

## Sandbox spike

`spike.mjs` issues a virtual card bound to a winning bid ($1,350/month at a software merchant) and simulates three charges.

| Charge | Result (Oct 31, US sandbox business) |
| --- | --- |
| $1,350 at a software merchant (MCC 5734) | `APPROVED` |
| $1,650 renewal hike | `DECLINED` / `LIMIT_EXCEEDED` |
| $100 at a restaurant (MCC 5812) | `DECLINED` / `MERCHANT_CATEGORY_NOT_ALLOWED` |

`npm run spike` funds the wallet with a simulated deposit, reuses or creates a cardholder (simulating review), issues the bid-bound
card and simulates the three charges. The full request/response log is written to `out/` (not committed).

### Notes

- Only `program.purpose: COMMERCIAL` is sent, so the account's default card program is used.
- The per-transaction limit is inclusive: a charge equal to the limit passes.
