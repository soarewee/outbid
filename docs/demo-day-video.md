# Demo Day video plan

A second recording, for the ABH Demo Day, next to the submission video (`docs/video-plan.md`). Same product,
different audience: a live room with a 10-minute slot, not judges reading the repo. The organisers' rules that
shape the cut:

- **Under 4 minutes, ideally 2–3.** Intro under 30 s; the product on screen and clicked within 30–45 s.
- **One use case, start to finish**, with the before and after obvious. Nothing explained that isn't shown.
- **Face in a small camera bubble**, 1080p or higher, product full screen, few window switches.
- **Structure:** the problem (0:00–0:30), the demo (to 3:00), the outcome with a result (to 3:30), what's next
  and how to try it (to 4:00).
- Conversational, not read word for word. A first cut goes to the organisers for feedback and may need a V2.

## What the viewer should get

One purchase, told plainly, with the agent visible the whole time:

- **You say it, the agent writes it.** One sentence in plain English becomes the anonymous intent, and the
  viewer sees what Claude kept out of it (the name, the team, the cash).
- **The cheapest bid wins.** No reserve, no twist in the purchase: two bids, priced with Airwallex FX, lowest
  total wins.
- **The approval is the card.** One click becomes a card that can only pay that vendor that amount; a
  restaurant charge is declined by the network.
- **Vendors pay only for closed deals.** The cleared charge releases the vendor's fee; $20 comes back.
- **Where the agent runs** is on screen throughout: the agent panel beside the story lists every call as it is
  made, tagged Claude (words), Airwallex (money), Metal (escrow), Code (rules), You (approvals).

The reserve floor and the cash projection are not in this video. They live in the edge cases, named once at
the end.

## Run it on the day

**The day before**

1. `.env` has all three: the Airwallex keys, `ANTHROPIC_API_KEY` (without it the request box falls back to the
   plain form and the first beat is gone), and the Metal key with USDZ for the vendors' $25 prepays plus gas.
2. Check the day's EURUSD. Harbor (€2,960) beats Orbit ($3,400) only below about 1.1486; above it Orbit wins and
   every line naming Harbor is wrong.
3. Rehearse without touching the sandbox: `npm run demo:replay -- out/demo-<time>.json` on the latest saved
   run plays it back with the agent panel and waits for the same clicks (a replay opens on the intent already
   written, so the request box is the one thing it can't rehearse). `--speed 2` to hurry.

**Recording**

1. In a terminal, from the repository:

   ```bash
   npm run demo -- --wait
   ```

   It prints `Waiting for the buyer to post the intent`. Leave it running behind the browser; it is the agent.
2. Browser full screen at 1920×1080, zoom 100%, no bookmarks bar, no extensions, two tabs: `localhost:4780`
   (⌘1, the site) and `localhost:4780/buyer` (⌘2, the request box). The agent panel needs the window at least
   1180 px wide.
3. Screen Studio (or Tella): camera on, bubble bottom left (the panel is on the right, the numbers in the
   middle), eye level, quiet room, headphones or a decent microphone, Do Not Disturb on.
4. Start recording on ⌘1 and follow the script. Every click is on the page; the terminal is never shown.
5. If a step fails or a take goes wrong: Ctrl-C in the terminal, run the command again, reload ⌘2. Each run
   resets the sandbox balance to $80,000, so takes are interchangeable.

**After**

The recording run becomes the evidence: `npm run evidence -- out/demo-<time>.json`, point `web/index.html` and
the `Dockerfile` at the new file, update the evidence table on the site, and `fly deploy`, so outbid.fly.dev
replays the run in the video, agent panel included.

## Script

Eighteen scenes. Each has what to do (▶), what to wait for on screen before speaking (👀, nothing added to the
screen: these are the product's own moments), and the line (🎙). Keep the meaning, use your own words. Dead air
is trimmed and the whole cut sped up in the editor if it runs past 4 minutes.

**1. Opening**
▶ Start recording on ⌘1, the site's hero. Camera bubble large.

🎙 Hi, I'm Jo, and this is Outbid. Ads compete for people's attention. But more and more, AI agents do the
buying, and agents don't see ads. So vendors need a new place to compete. With Outbid, they bid for your
agent's purchase directly, and the winning bid becomes a card that can only pay what you approved.

▶ ⌘2, the buyer console.

**2. The request**
▶ Zoom on the request text.

🎙 Let me show you. I tell our agent what we need, in plain words: two H100s for a year, under 3,750 a month.

▶ **Ask your agent.** Say nothing while the button reads *Claude is reading your request…* (3–5 s, trimmed in
the editor).

**3. The intent**
👀 The four fields fill in and the *Kept from vendors* chips strike through.
▶ Zoom on the chips.

🎙 My agent turns that into a purchase intent with just what, how many, the budget and the term, while our name and our cash stay out of it.

**4. The agent panel**
▶ Point at the agent panel on the right.

**5. Post**
▶ **Post intent.**

🎙 Once I post it, the intent goes out to vendors anonymously.

**6. The bids**
👀 Both bids have landed, Orbit and Harbor.

🎙 Two vendors read the intent, and each answers with a bid.

**7. The pick**
👀 *Two bids. Harbor wins.*
▶ Zoom on the two rows.

🎙 The agent prices both in dollars with Airwallex FX and compares the whole year. Harbor comes out cheaper, so
Harbor wins.

**8. Who decides**
▶ Point at the panel: *Code · Rank the bids*, then *Claude · Explain the pick to you*.

🎙 The pick itself is rule-based and done in code, Claude only explains it to me, and the final call is still mine.

**9. The approval**
▶ **Continue.**
👀 The approval, with its four rows: vendor, amount, currency, merchant.

🎙 Now the one thing I have to do: approve.

**10. The card**
▶ **Approve.**
👀 The card flips in and its three limits tick on.

🎙 That approval just became an Airwallex virtual card, and its limits are exactly what I approved.

**11. The agreed charge**
👀 *Harbor €2,960.00 · Approved* lands on the card.

🎙 Harbor charges its 2,960 euros, and the payment goes through.

**12. The restaurant**
👀 *Corner Bistro · Declined* lands and the card shakes.

🎙 But when someone tries the same card at a restaurant, the network declines it, because the card only works within the terms I approved.

**13. The escrow**
👀 The caption *Harbor put its $25.00 acquisition fee in escrow*.

🎙 So how does Outbid make money? Like any marketplace, it takes a small fee from the winning vendor, so Harbor put its 25 dollar acquisition fee into an escrow on Metal.

**14. The rebate**
▶ **Continue.**
👀 *$20.00 back to you* counts up and the bar splits.

🎙 The fee is only released once Harbor's charge actually goes through on the card. That's the proof the sale really happened, and nobody can fake it.

**15. On Metal**
▶ In the agent panel on the right, find the Metal line *Escrow · Outbid releases the fee* (near the bottom;
scroll the panel if needed) and click its `0x…` link. The panel stays put while the console moves on, so
there is no rush. The explorer opens in a new tab; scroll to the transfers.

🎙 Here's that release on Metal, public for anyone to check: 5 dollars to Outbid, and 20 back to us, because Outbid shares its fee with the buyer who brought the deal.

▶ ⌘W, back to the console.

**16. The outcome**
👀 *That's the purchase.* is already up: it follows the rebate on its own, no Continue.
▶ Scroll the panel slowly from top to bottom.

🎙 So, before: you'd give your agent a card with no limit on who it pays or how much. Now, it took one
sentence and one click, and the agent ended up with a card that pays Harbor exactly 2,960 euros, and nothing
else.

**17. After the sale**
▶ Zoom on *Edge cases · months later*. Don't play them.

🎙 And it keeps working after the sale. If Harbor raises its price at renewal, the card says no and the
auction reopens. If a cheaper prepaid deal shows up, the agent waits until our cash can carry it.

**18. Close**
▶ ⌘1, the site's hero; zoom until the headline fills the frame, camera bubble large again.

🎙 That's Outbid. When agents do the buying, vendors compete for your agent, not your attention. And the
winning bid simply becomes the card. You can see it running at outbid.fly.dev. Thanks.

**For scene 15**, open a Metal transaction once in rehearsal to see where the 20/5 split shows on the explorer.

**Where the waits are.** After *Ask your agent* in scene 2, Claude drafts for 3–5 s: trim it. Between scenes 10 and 11, the card is
issued and the first charge sent (about 4 s); the escrow prepay runs at the same time, so the two charges land
3–4 s apart and its caption follows. Scene 14's release is one Metal transaction (2–3 s), and the explorer in scene 15 may load slowly. Trim whatever is left
in the editor.

**What outbid.fly.dev is.** A replay of a recorded run: the site and both consoles, playing the recorded
events. It calls nothing, Airwallex, Metal or Claude; the badge says *Replay*, the agent's words are the ones
recorded, and the Metal links open the real transactions. Scene 18 says "see it running at outbid.fly.dev", not "try it", for that reason.

## If it runs long

Speed the cut up in the editor rather than dropping scenes. Never lose the request box, the *Kept from
vendors* chips, the approval or the restaurant decline: those are the product.

## Questions after the video

Short answers, in the same plain words as the video.

- **Are the vendors AI agents too?** In the demo they're simple scripted bidders. In production each vendor
  runs its own agent against the same interface: an anonymous intent in, a bid out, and a match request at
  renewal.
- **Where does Claude run, and what does it decide?** The agent runs on my machine, `npm run demo`. Claude is
  called over the Messages API for two things: writing the intent from my words, and explaining each decision.
  It never decides. Ranking, budget and the cash reserve are code, and code checks the intent before it's
  posted.
- **Why a card, not just paying the bid?** A bid is a promise; the vendor's billing decides what's charged. A
  card per approval means the network enforces the terms on every charge, and almost every vendor already takes
  cards, so there's nothing for them to integrate.
- **What if the vendor never charges?** The fee sits in escrow until a deadline, then goes back to the vendor.
- **Is this real money?** It runs on the Airwallex sandbox and Metal testnet: real APIs, real card network
  decisions, test money.

## Organisers' checklist

- [ ] Under 4 minutes.
- [ ] The product on screen within 30–45 s (*Ask your agent*, scene 2, at about 0:30).
- [ ] The working product, no slides.
- [ ] One use case: the purchase.
- [ ] Readable screen, clear audio and video.
- [ ] Camera at eye level, good light.
- [ ] Easy to follow without other context.
- [ ] Says why it matters and what people can do next.
- [ ] Watched the whole recording once before sending.
