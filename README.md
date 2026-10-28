# Outbid

Your agent posts what it wants to buy. Vendors compete. The winning bid becomes the card.

Outbid is a purchase-intent auction for company SaaS buying, built for the Airwallex Agentic Banking Hackathon
(Kit 02: Intent-Bound Purchase Agent). A company's agent posts an anonymous intent, vendor agents bid, the agent
picks a bid that respects the company's cash reserve, and the approved terms become an Airwallex virtual card
that can only pay that vendor, that amount, in that currency.

> Work in progress. The demo runs end to end against the Airwallex sandbox and Metal testnet. Buyer and vendor
> screens are next.

## Demo

`npm run demo` plays the whole story against the sandbox and Metal testnet. It first sets the USD balance to the
scenario's starting cash (`data/scenario.json`) with a simulated deposit or a payout, so every run starts from the
same place.

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

Every step that changes a card asks for approval; add `-- --yes` to approve them all.

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

Since Oct 26 the sandbox answers every simulated card charge with `400 failed to process transaction`
([status](https://status.airwallex.com/)). While that lasts, the CLI checks the charge against the controls read back
from the issued card and says so on screen. The spike never does this: it reports an API error as a failed check.

## Sandbox notes

- FX quotes come back in the market pair's direction whichever way you trade: selling USD for EUR returns
  `currency_pair: EURUSD` with USD per EUR, so the rate is inverted for that direction.
- A card is frozen with `POST /api/v1/issuing/cards/{id}/update` and `card_status: INACTIVE`, and unfrozen with
  `ACTIVE`. Other names such as `FROZEN` are rejected with `invalid card_status`.
- A `LOCAL` USD transfer to an ACH beneficiary has no fee and lowers the available balance as soon as it is created.
  Simulated deposits show up in the available balance right away.

## Sandbox spike

`spike.mjs` issues a virtual card bound to a winning bid ($1,350/month at a software merchant) and simulates three charges.

| Charge | Result (Oct 23, US sandbox business) |
| --- | --- |
| $1,350 at a software merchant (MCC 5734) | cleared (`CLEARING` / `PENDING`) |
| $1,650 renewal hike | declined (`FAILED` / `LIMIT_EXCEEDED`) |
| $100 at a restaurant (MCC 5812) | declined (`FAILED` / `MERCHANT_CATEGORY_NOT_ALLOWED`) |

### Run

1. Create a sandbox account at [sandbox.airwallex.com](https://sandbox.airwallex.com). Register the business in the
   **United States** and name it `Sandbox Business` or `New Business Sandbox` so it skips review. Card issuing is
   rejected with `Invalid issuance details` for businesses in unsupported regions.
2. Create a Client ID and API key under Account → Developer → API keys.
3. `cp .env.example .env` and fill in the keys. Never commit `.env`.
4. `npm run spike` (Node 20 or later, no dependencies).

The script funds the wallet with a simulated deposit, reuses or creates a cardholder (simulating review), issues the bid-bound
card and simulates the three charges. The full request/response log is written to `out/` (not committed).

### Notes

- Only `program.purpose: COMMERCIAL` is sent, so the account's default card program is used.
- Following the [builder guide](https://airwallexdev.com/guide), a declined transaction ends in `FAILED` with a
  `failure_reason`, and a cleared one may stay `PENDING`, so `transaction_type: CLEARING` counts as approved.
- The per-transaction limit is inclusive: a charge equal to the limit passes.
