# Outbid

Your agent posts what it wants to buy. Vendors compete. The winning bid becomes the card.

Outbid is a purchase-intent auction for company SaaS buying, built for the Airwallex Agentic Banking Hackathon
(Kit 02: Intent-Bound Purchase Agent). A company's agent posts an anonymous intent, vendor agents bid, the agent
picks a bid that respects the company's cash reserve, and the approved terms become an Airwallex virtual card
that can only pay that vendor, that amount, in that currency.

> The demo runs end to end against the Airwallex sandbox and Metal testnet, with a buyer console and a vendor
> console that fill in live. Open `web/index.html` for the site.

## Run it

Node 20 or later, no dependencies, no build.

1. Create a sandbox account at [sandbox.airwallex.com](https://sandbox.airwallex.com). Register the business in the
   **United States** and name it `Sandbox Business` or `New Business Sandbox` so it skips review; card issuing is
   rejected with `Invalid issuance details` for businesses in unsupported regions. Create a Client ID and API key
   under Account → Developer → API keys.
2. Get a Metal testnet RPC endpoint and a disposable test key (`cast wallet new`) funded with USDZ from the faucet.
   The escrow is already deployed; the key only funds the vendors' prepaid fees.
3. `cp .env.example .env` and fill in the keys. Never commit `.env`.
4. `npm run demo -- --wait`, then open [localhost:4780/buyer](http://localhost:4780/buyer) and post the intent.

## The site and the two consoles

`web/` is three static pages served by the demo itself (`src/stage.mjs`, `node:http` only), at
[localhost:4780](http://localhost:4780) while a demo or replay is running:

- `/` (`web/index.html`) is the site: what Outbid does, how it works, who sees what, why a card, the sandbox
  evidence, and how to run it. It also opens straight from the file.
- `/buyer` (`web/buyer.html`) is the **buyer console**, where the company's agent starts. One screen: the
  purchase at the top (the intent, a status, available cash, the reserve floor, what the card pays, the
  rebates so far) and the moment that is happening now in the middle. Inside a part the moments replace
  each other on their own; between parts the run stops on a Continue button, so nothing passes by
  unread, and the approval waits for its click (in a replay too). The purchase is three parts: vendors
  reading the intent and their bids landing, ranked by FX-priced total cost, and why the cheapest loses,
  with the cash forecast drawing itself; the approval, which says exactly what the buyer agrees to, and
  then that approval issued as the card, its controls locking in one by one and each charge landing on it
  with the reason Issuing gave; the rebate counting up. It ends on its own screen: "That's the purchase."
  The edge cases (months later, the declined renewal hike, the reopened auction and the message to the
  incumbent; the deposit and the recheck) are listed there and played only on request, under a band that
  says so, and a card that replaces another is shown as a swap, not as another card. Small things show as
  a caption under the stage, and the strip at the bottom jumps to any part.
- `/vendor` (`web/vendor.html`) is a **vendor console**, one vendor at a time (switch at the top, or `?v=Vendor%20B`).
  Its agent sees the anonymous intent, its own bid and rank, whether it was picked, the deal the buyer's card is
  bound to, its own charges (cleared, or declined for billing above what the buyer approved), its fee in escrow
  and released, and at renewal the message from Outbid: match, or the buyer switches. Never the buyer's name,
  cash or the other bids.

Both consoles fill in live from the same run, so they can be recorded side by side.

## Demo

`npm run demo` plays the whole story against the sandbox and Metal testnet. The demo first sets the USD balance to
the scenario's starting cash (`data/scenario.json`) with a simulated deposit or a payout, so every run starts from
the same place. Vendors price per seat, so the bids follow the seats in the intent; 10 seats gives the pitch's numbers.

1. Three vendors bid. The annual prepay is cheapest but would break the reserve in week 7, so the best monthly bid wins
   and the agent records when to reconsider.
2. The winning bid becomes a card, and the winning vendor prepays its acquisition fee into the escrow on Metal. The
   agreed charge clears and a restaurant charge is declined.
3. The cleared charge is the proof of sale. Outbid reports it to the escrow, which splits the fee into the buyer's
   rebate (80%) and Outbid's fee in one transaction, and the rebate goes to the buyer's bank through Airwallex Payouts.
4. At renewal the incumbent's price hike is declined by the card. The auction reopens with the hiked price, and the
   incumbent is offered the best competing price: match, or the company switches. Any change of terms gets a new card
   and the old one is frozen.
5. A customer payment lands in the Global Account. The agent re-runs the decision, the annual prepay now fits, and
   after approval it gets a new card while the old card is frozen and declines.

Every step that changes a card asks for approval, on the buyer console or in the terminal; add `-- --yes` to approve
them all. The buyer console also stops between parts until Continue is pressed, so a live run that has moved on is
simply queued until the viewer gets there. `-- --wait` lets the buyer post the intent from the console instead of reading `data/intent.json`. Each run
saves its stage events with the request log in `out/`, and `npm run demo:replay -- out/demo-<time>.json` plays them
back on the pages with the original pacing, without touching the sandbox (`--speed 2` to hurry).

## Fee escrow on Metal

`contracts/` is a Foundry project with `FeeEscrow`, deployed on Metal testnet (chain 63825) at the address in
`contracts/deployments/metal-testnet.json`. A vendor funds a deal with USDZ; only Outbid's attester can release it,
once, before the deadline, and the split is fixed at deployment. If no charge clears by the deadline, the vendor takes
the fee back. Every transfer checks that the recipient's balance rose by the full amount, since Metal can quarantine a
credit instead of delivering it.

- `cd contracts && forge test` runs the contract tests (no library dependencies).
- `npm run escrow:deploy` deploys a new escrow and records it (needs `METAL_RPC_URL` and `METAL_PRIVATE_KEY`).
- Vendor, rebate and fee wallets are test wallets derived from `METAL_PRIVATE_KEY`, so no other keys are stored.
  The operator funds each vendor's prepay and sweeps earlier demo rebates back when it runs short.

In the sandbox one Airwallex account plays both the buyer and Outbid, so the rebate payout leaves the same wallet the
buyer's cash is read from.

## Auction

`npm run auction` runs one auction against the sandbox: three vendor agents bid on an anonymous intent, bids are
priced in the company's currency with Airwallex FX and ranked by total cost over the term, and the cheapest bid that
keeps projected cash (live balance minus upcoming obligations) above the reserve floor wins. After you approve the
terms, it issues a virtual card whose controls are exactly those terms and simulates the first charge at the winning
price. Add `-- --yes` to approve without a prompt. The run log is written to `out/`.

Every charge outcome comes from Airwallex Issuing. An API error is reported as an error, never as a decline.

## Sandbox notes

- FX quotes come back in the market pair's direction whichever way you trade: selling USD for EUR returns
  `currency_pair: EURUSD` with USD per EUR, so the rate is inverted for that direction.
- A card is frozen with `POST /api/v1/issuing/cards/{id}/update` and `card_status: INACTIVE`, and unfrozen with
  `ACTIVE`. Other names such as `FROZEN` are rejected with `invalid card_status`.
- A simulated charge answers with `process_result` (`APPROVED` or `DECLINED`), `failure_reason` on a decline, and
  `card_transaction_id`, which is the proof of sale the escrow release records. Between Oct 26 and Oct 31 the
  endpoint answered every charge with `400 failed to process transaction`.
- A `LOCAL` USD transfer to an ACH beneficiary has no fee and lowers the available balance as soon as it is created.
  Simulated deposits show up in the available balance right away.

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
