# Outbid

Your agent posts what it wants to buy. Vendors compete. The winning bid becomes the card.

Outbid is a purchase-intent auction for company SaaS buying, built for the Airwallex Agentic Banking Hackathon
(Kit 02: Intent-Bound Purchase Agent). A company's agent posts an anonymous intent, vendor agents bid, the agent
picks a bid that respects the company's cash reserve, and the approved terms become an Airwallex virtual card
that can only pay that vendor, that amount, in that currency.

> Work in progress. Today the repository holds the sandbox spike that proves the card controls.

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

The script funds the wallet with a simulated deposit, creates a cardholder (simulating review), issues the bid-bound
card and simulates the three charges. The full request/response log is written to `out/` (not committed).

### Notes

- Only `program.purpose: COMMERCIAL` is sent, so the account's default card program is used.
- Following the [builder guide](https://airwallexdev.com/guide), a declined transaction ends in `FAILED` with a
  `failure_reason`, and a cleared one may stay `PENDING`, so `transaction_type: CLEARING` counts as approved.
- The per-transaction limit is inclusive: a charge equal to the limit passes.
