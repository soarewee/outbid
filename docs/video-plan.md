# Demo video plan

> The submission video (youtu.be/MQ9fp_v3k3o, recorded Nov 10) follows the flow as it was then: three bids at
> the start, the cheapest losing on the reserve. Since Nov 12 the purchase is a plain comparison, Claude writes the
> intent from the buyer's request, and the reserve check moved into the last edge case; `docs/demo-day-video.md`
> plans a video of the current flow.

Submission: a working demo, a video under 5 minutes, and a repository link with run instructions, all in
English. Deadline Nov 14, 2026 03:29 KST; the video is recorded in the Nov 10–12 block and the repository goes
public right before the form is sent (`docs/submission.md`). The decline reasons on screen come from Airwallex
Issuing, and the escrow transactions are public on the Metal explorer.

## Goal

In about 4:30, one real run from start to finish, with nothing cut but waiting: whose problem it is, the intent
posted on camera, the bids, the reserve decision in the agent's own words, one approval, the card and the
network's declines, the rebate, then the two edge cases, and the evidence. What a judge should be able to repeat
afterwards, one line each, in the order the builder guide puts them:

- The decision changes when the balance does: Cedar is cheapest and loses; after a customer pays, it wins.
- The approval is bound to vendor, amount, currency and merchant, and the card, not a policy, enforces it.
- The limits and the reserve are code. The model reads the vendors' terms and explains; it never picks.
- Vendors pay only for closed deals: the network's cleared charge releases the escrow, and Payouts carry the
  rebate out.

No slides. Every title the video needs is on the site: the headline is the opening and the end card, *Built on*
is the API list, and the evidence table is the proof. The buyer console is the film: it plays one moment at a
time, stops between parts on Continue, and waits for the approvals, so the recording is driven by clicks and
nothing passes by unread.

## Screens

Two apps, each full screen: the browser and the terminal (one command, at the start). Browser tabs, in this
order so ⌘1–⌘4 land where the script says:

1. The site, `localhost:4780` (or the hosted copy; the local one shows the run that is happening).
2. The buyer console, `localhost:4780/buyer`.
3. The vendor console as Birch, `localhost:4780/vendor?v=Vendor%20B`.
4. The Airwallex sandbox dashboard, logged in beforehand, at Issuing → Cards.

The Metal explorer opens from the console's own caption link (`0x… on Metal`) in a new tab and is closed after
the cut. Side by side (buyer left, vendor right) was the earlier idea and is set aside for the same reason as
before: half-width windows shrink every line the video zooms on.

**Live, not replay.** Run `npm run demo -- --wait`, so the console's badge says *Live · Airwallex sandbox* and
the intent is posted on camera. The run itself takes about two and a half minutes of machine time (bids at
once; the agent's paragraph about 5 s; the card about 1 s; each escrow transaction 5–15 s; each charge about
3 s; the customer deposit usually at once, on Nov 2 about 25 s), which fits under the narration with the dead
waits trimmed in the editor. If the sandbox misbehaves on the day, play `npm run demo:replay --
evidence/2026-11-02.json` with the same clicks: the badge then says *Replay · recorded 2026-11-02 against the
Airwallex sandbox*, which is honest, and the narration does not change.

## Script

About 4:40 with ~600 words of narration in short plain sentences, so the screen gets room to show the run.
Read each line as its own take, so lines can be re-recorded and cut by transcript. "⌘1…⌘4" is the browser
tab; "⌘Tab" is the switch between the browser and the terminal. The editor's auto-zoom follows clicks; "zoom"
is a zoom keyframe set by hand for a moment with no click.

| Time | On screen | Narration |
| --- | --- | --- |
| 0:00–0:15 | ⌘1 the site, hero at the top, as it is. | Companies buy software and compute at list price. Vendors spend a fortune on sales to find them. When an agent does the buying, that's backwards: the agent already knows exactly what it needs. So let vendors compete for it. |
| 0:15–0:25 | Zoom on the headline. ⌘Tab to the terminal: `npm run demo -- --wait`, the *Stage* line, *Waiting for the buyer to post the intent*. | Your agent posts what it wants to buy. Vendors compete. The winning bid becomes the card. This is Outbid, running live against the Airwallex sandbox. |
| 0:25–0:45 | ⌘2 the buyer console: the intent form with its defaults. Zoom on the four fields, then on the reserve line. Click *Post intent*. | The agent posts an anonymous intent. Two H100 GPUs, up to 3,750 dollars a month, for twelve months. Vendors see those four fields. Not the company's name, not its cash. And the agent carries one rule, in code: keep cash above a 20,000 dollar floor. |
| 0:45–1:05 | The bids land one by one: Arbor $3,400, Birch €2,960, Cedar $34,500 a year. ⌘3 the vendor console: Birch's open intent, its bid and its rank. ⌘2. | Three vendor agents bid. Arbor, 3,400 dollars a month. Birch, 2,960 euros a month. Cedar, 34,500 dollars for the year, prepaid. The cheapest in total. This is Birch's side of it: the intent, its own bid, and nothing else. |
| 1:05–1:40 | *3 bids. Birch wins.*, then *Why not Cedar? Cash.* with the cash chart drawing itself. Zoom on *$19,500 on day 45*, then on *In the agent's words*. | The cheapest bid doesn't automatically win. Outbid prices the euro bid with Airwallex FX and ranks total cost. Then the agent reads the live Airwallex balance and what's already due. Cedar's prepay would drop cash to 19,500 on day 45. Under the floor. So Birch wins, and the agent writes down when to look at Cedar again. The ranking and the reserve check are code. The explanation is Claude's, written from that ranking and the vendors' own terms. The model never picks the winner. |
| 1:40–1:55 | Continue. The approval: zoom on the four rows (vendor, amount, currency, merchant). Click *Approve*. | One approval. This vendor, this amount, this currency, this kind of merchant. Nothing broader. |
| 1:55–2:30 | The card flips in; its three controls tick on; the agreed charge clears; Corner Bistro is declined, `MERCHANT_CATEGORY_NOT_ALLOWED`. ⌘4 the Airwallex dashboard: the card's transactions, the decline. ⌘2. | That approval is issued as an Airwallex virtual card whose controls are exactly those terms. The agreed charge clears. A restaurant charge is declined by the network, with the reason. Same thing in the Airwallex dashboard: Outbid didn't decide that, the card did. The vendor can't overcharge. The agent can't overspend. And nobody can fake a sale. |
| 2:30–2:55 | Zoom on the caption *Birch put its $25.00 acquisition fee in escrow*. Continue. *$20.00 back to you*, the split bar, the three rows. Click the Metal link, the explorer, back. | Birch prepaid a 25 dollar acquisition fee into an escrow on Metal. The cleared charge is the proof of sale, reported by the network. So the escrow splits the fee in one transaction: 20 dollars back to the buyer, through Airwallex Payouts, and 5 to Outbid. Vendors pay only for closed deals. |
| 2:55–3:05 | *That's the purchase.* and its checklist. Press *Play the edge cases*. | That's the whole purchase. Now two things that happen months later. |
| 3:05–3:50 | *Birch billed €3,612.20. The card said no.*, `LIMIT_EXCEEDED`. The reopened ranking. *Outbid asks Birch to match €3,017.05*, *We match*. Approve. *New terms, new card*: old frozen, new active. ⌘3: the message from Outbid on Birch's console. ⌘2. | At renewal, Birch bills 22 percent more. The card declines it, with the limit that was approved. Nobody had to notice. Outbid takes that as a reopened auction. Arbor is lower now, so Birch gets one message: match, or the company switches. It matches. New terms, new card, and the old card is frozen. |
| 3:50–4:20 | Continue. *Northwind Traders just paid*: cash counts up to $109,980. *Rechecked: Cedar fits now*, the ranking. Approve. The swap; the old card declined, `CARD_INACTIVE`; *$20.00 back to you* again. | A customer pays 30,000 dollars into the Global Account. Nothing about the intent changed, but the cash did, so the agent re-runs the same rules. Cedar's prepay fits now, and it's the cheapest. The company switches. The old card is frozen and declines. And Cedar's fee splits the same way. |
| 4:20–4:40 | ⌘1 the site, scroll to *Built on* and the evidence table. Zoom on one row with a decline reason, then on the Metal column. | Every id on this page is from a run like the one you just watched. The cards, the declines with their reason codes, the transfers, and the escrow transactions on Metal, which anyone can open. Balances, FX, Issuing, card transactions, Global Accounts, Payouts. And Metal, for the one thing Airwallex doesn't have. |
| 4:40–4:50 | Scroll to *Three steps to a running auction*, then smoothly back to the hero; zoom until the headline fills the frame; hold. | Node 20, two sandboxes, one env file, npm run demo. Outbid. Your agent posts what it wants to buy. Vendors compete. The winning bid becomes the card. |

The intent form is left at its defaults (they are `data/intent.json`), so nothing is typed on camera.

## What the video needs built

- [x] The buyer console as a film: one moment at a time, Continue between parts, approvals on the page, the
  edge cases apart, a live/replay badge.
- [x] The vendor console, one vendor at a time, filled in from the same run.
- [x] The site with *Built on* and the evidence table (`evidence/2026-11-02.json`, `npm run evidence`).
- [x] The agent's words from Claude on the *Why not* and recheck moments (`ANTHROPIC_API_KEY`).
- [x] The demo survives a sandbox deposit that stays `PENDING` (Nov 7): it resends once, starts from the cash it
  has if the opening top-up never lands, and stops with a message if the customer payment doesn't.
- [x] If the recording run is better than the Nov 2 one, `npm run evidence` on it, point `web/index.html` and
  the `Dockerfile` at the new file, and `fly deploy`, so the hosted replay and the evidence table show the run
  in the video (Nov 10: `evidence/2026-11-10.json`, the 14:25 KST run).

## Tools

Default: record and edit in one app, [Screen Studio](https://screen.studio/) or [Prequel](https://prequel.sh/)
(7-day trial, so start it in the recording week). Both auto-zoom on clicks, cut by deleting sentences from the
transcript, and generate captions locally. No tier that adds a watermark.

- Titles and the close: the site's own sections, with manual zoom keyframes.
- The run: click-follow zoom; trim the escrow waits and the deposit wait where they drag.
- Captions: generated by the recorder, burned in or uploaded as SRT.
- 1080p or higher; browser at 100% zoom with fonts enlarged if needed; terminal font large.

## Before recording

- `.env` has all three: Airwallex keys, `ANTHROPIC_API_KEY` (so the *Why not* moment carries the agent's
  words, not the template), and the Metal key with enough USDZ for two $25 prepays plus gas.
- Check the day's EURUSD. Birch (€2,960) beats Arbor ($3,400) below about 1.1486; above it Arbor wins the
  opening and the renewal story moves to Arbor. The narration names Birch, so either record below the
  threshold or reread the lines with Arbor. (Nov 2: 1.1153.)
- Check the sandbox USD balance. The demo resets it to $80,000 with a simulated deposit or a payout; a deposit
  can stay pending (the console then shows the cash it has, and the story still works: Cedar breaks the
  reserve from $75,000 too). If the Northwind payment at the end does not land within 150 s the run stops
  with a message: record that part again, or from the replay.
- Log in to the sandbox dashboard beforehand, on tab 4, at Issuing → Cards. No password on screen.
- A dry run of the whole flow with the four tabs, watching the moments the script zooms on: *$19,500 on day
  45*, the four approval rows, the decline reasons, the split bar.
- Only the browser and the terminal open, so ⌘Tab always lands on the other. No bookmarks bar, no other tabs,
  no extensions: nothing on screen that is not the product or Airwallex's and Metal's own pages.
- Clear the terminal before the one command. The stage line and the *Waiting for the buyer* line are what the
  viewer sees.
- A person's own voice over a synthetic one, English, no music (or royalty-free only).

## Open

- Whether the dashboard cut (tab 4) stays. It is the strongest proof that the card decided, but it costs a
  tab switch and a login. If it goes, the console's reason codes are the same strings Issuing returned, and
  the evidence table at the end covers it.
- Whether to show the vendor console twice (bids and the match request) or once. Twice is in the script;
  the second is the one to cut if the video runs long.
