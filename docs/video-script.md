# Demo video script (under 5 minutes)

Screen: the buyer console left, the vendor console (Birch) right, the terminal below, the Airwallex
sandbox dashboard (Issuing → Cards, Transactions) in a fourth window to cut to. Run
`npm run demo -- --wait` so the intent is posted on camera. Replay fallback: `npm run demo:replay`.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | About page hero | Companies buy software and compute at list price while vendors spend a fortune finding them. Outbid is a purchase-intent auction: the company's agent posts what it wants, vendors compete, and the winning bid becomes the card. Built on the Airwallex sandbox and Metal testnet. |
| 0:25 | Buyer console, the intent form. Type nothing; the defaults are the demo. Click Post intent. | The agent posts an anonymous intent: two H100 GPUs, up to $3,750 a month, twelve months. Vendors see those four fields and nothing else. And it carries a rule, in code: keep cash above a $20,000 floor for 90 days. |
| 0:45 | Bids land one by one. Cut to the vendor console: Birch sees the anonymous intent and its own bid. | Three vendor agents bid. Arbor $3,400 a month. Birch €2,960 a month. Cedar $34,500 for the year, prepaid, the cheapest in total. |
| 1:05 | The ranking, then "Why not Cedar? Cash." with the chart drawing. | The cheapest bid does not automatically win. The agent reads the Airwallex balance and what is already due, and projects cash for each bid. Cedar's prepay would put cash at $19,500 on day 45, under the floor. So Birch wins, and the agent notes when to revisit Cedar. The ranking and the reserve check are code; the explanation you are reading was written by Claude from that ranking and the vendors' terms. |
| 1:40 | Press Continue. The approval. Click Approve. | One approval: this vendor, this amount, this currency, this merchant category. Nothing broader. |
| 1:55 | The card flips in; the controls lock; the agreed charge clears; Corner Bistro is declined. Cut to the sandbox dashboard: the card and its two transactions. | That approval is issued as an Airwallex virtual card whose controls are exactly those terms. The agreed charge clears. A restaurant charge is declined by the network, with the reason. No policy to enforce, no one to watch: the card cannot be used any other way. |
| 2:30 | Continue. "$20.00 back to you" counts up; the Metal link in the caption. | Birch prepaid a $25 acquisition fee into an escrow on Metal. The cleared charge is the proof of sale, reported by the network, so the escrow splits the fee: $20 back to the buyer through Airwallex Payouts, $5 to Outbid. Vendors pay only for closed deals. |
| 2:55 | "That's the purchase." Press Play the edge cases. | That is the whole purchase. Two things that happen months later. |
| 3:05 | Renewal: €3,612 declined, LIMIT_EXCEEDED. Re-auction. The message to Birch. Approve. New card, old card frozen. | At renewal Birch bills 22 percent more. The card declines it with the limit that was approved. Outbid reopens the auction, Arbor is now lowest, and Birch is asked to match or lose the account. It matches. New terms, new card; the old one is frozen. |
| 3:50 | Continue. The deposit counts up; recheck; approve Cedar; the annual card; the old card declined. | A customer pays $30,000. The agent re-runs the same rules on the new balance. Cedar's prepay fits now and it is the cheapest, so the company switches. The old card is frozen and declines. |
| 4:25 | Evidence table on the About page; a Metal transaction in the explorer. | Every id on this page is from the run you just watched: the cards, the declines with their reason codes, the transfers, and the escrow transactions on Metal, which anyone can open. |
| 4:45 | README, run instructions. | Node 20, no dependencies. Two sandboxes, one env file, `npm run demo`. Outbid. |
