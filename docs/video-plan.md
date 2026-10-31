# Demo video plan

Deliverables: a working demo, a video under 5 minutes, and a repository link with run instructions. Deadline
Nov 14, 2026 03:29 KST. Recording happens in the Nov 10–12 wrap-up block. Decline reasons on screen come from
Airwallex Issuing.

## Scenes (4:50)

| Time | Scene | On screen | Point |
| --- | --- | --- | --- |
| 0:00–0:30 | The problem | One slide | Companies buy software at list price while vendors spend heavily on sales and marketing to find them. When agents buy, that's backwards |
| 0:30–1:20 | Bids and the decision | `npm run demo`, scene 1 | Bids ranked by FX-priced total cost. The cheapest annual prepay would break the reserve in week 7, so it's passed over and a reconsider date is recorded. Rules live in code; the model explains |
| 1:20–2:10 | The winning bid becomes the card | Scene 2 + card controls in the Airwallex dashboard | Approved terms = card controls. The agreed charge clears; a restaurant charge fails with `MERCHANT_CATEGORY_NOT_ALLOWED` |
| 2:10–3:00 | Renewal hike | Scene 4 | The hike fails with `LIMIT_EXCEEDED` → re-auction → "Match, or the company switches." → new card, old card frozen |
| 3:00–3:40 | Cash recovers | Scene 5 + dashboard balance | A customer payment lands → re-run → switch to annual. The frozen card declines |
| 3:40–4:30 | Settlement | Demo scene 3 + Metal explorer | First charge clears → the vendor's acquisition fee splits into rebate and fee in one transaction, with the explorer link. The rebate goes out through Airwallex Payouts |
| 4:30–4:50 | Close | The APIs used | Balances, FX, Issuing, transactions, Global Accounts, Payouts, Metal |

## Open choices

- **Lead vendor:** below an EURUSD of about 1.144 Vendor B (€1,180) wins first; above it, Vendor A ($1,350)
  (1.1065 on Oct 28 → B). The pitch uses A's $1,650 hike as its example, but record with the day's rate and
  point out in one line that FX changes the decision.
- **Screens:** terminal output alone is flat. The minimal buyer and vendor views in the wrap-up block decide
  how good the video looks.
- **Evidence:** before recording, rerun `npm run spike` to capture real declines and an `out/` log.
- **Order:** the demo settles the fee right after the first charge (scene 3); the video moves it to the end, as
  the pitch does.
- **Recording:** shoot scene by scene and cut together. `npm run demo -- --yes` runs straight through and resets
  the balance to USD 25,000 at the start, so it can be retaken any number of times.
