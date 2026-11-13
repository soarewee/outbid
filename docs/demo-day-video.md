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

## V2: what the organisers asked for (Nov 13)

Feedback on the first cut, and where V2 answers it:

- **More energy.** Talk it through like to a friend, standing, from beats rather than a script. The lines below
  are the meaning, not the wording.
- **Fewer zooms.** Screen Studio's automatic zoom off. Two manual zooms, neither tighter than 1.5×, so the
  agent panel stays in frame: the bidding, and the declined setup fee.
- **Say what an H100 is** the first time (scene 2).
- **Drop "how does Outbid make money"; say why it is new.** The fee is now a bid bond and gets one breath, as the
  one thing that is onchain (scene 9). The time goes to the bidding and to why it wasn't possible before.
- **Why a card?** Scene 8, without overselling it: it doesn't have to be a card, but a card is convenient.
  Vendors already take them, the network checks the limit before money moves, and nobody sets that limit by
  hand: the auction does.
- **How autonomous is the agent?** The request is one loose sentence with no budget. The agent works out the
  rest where the viewer can see it (scene 3): the term from "next year", the budget from the Airwallex balance
  and the reserve, what to keep from vendors. The end screen counts the buyer's two acts against the agent's
  calls (scene 10), and the renewal happens with nobody there (scene 11).
- **How do vendor bids work?** Each vendor runs its own agent (Claude, with a private floor) and they undercut
  each other live (scene 4). Getting vendors on day one is named as what's next (scene 12).
- **What is onchain?** Scene 9, in one sentence, with the reason.

## What the viewer should get

One purchase, and the feeling that sellers fought for it:

- **You say it loosely, the agent works out the rest.** One sentence with no budget becomes the anonymous
  intent: Claude reads the term out of it, code sets the budget from the Airwallex balance, and the viewer sees
  what was kept from vendors.
- **Vendors' agents fight.** Each posts a bond, opens, and undercuts the other round by round until one stops.
  The price falls on screen.
- **The approval is the card.** One click becomes a card that pays that vendor that amount; the same vendor
  billing a setup fee on top is declined by the network.
- **Both sides are bound.** The vendor can't charge more than it bid, and that is said. What leaving early
  costs the buyer is on the approval screen and in the questions after, not in the narration: one thing at a time.
- **Onchain is one thing:** the vendors' bid bonds, on Metal. Everything of the buyer's is on Airwallex.
- **Who did what** is on the end screen: You 2, and the agent's calls by service.

## Run it on the day

**The day before**

1. `.env` has all three: the Airwallex keys, `ANTHROPIC_API_KEY` (without it the request box falls back to the
   plain form and the vendors bid on a fixed strategy, so the fight has no words), and the Metal key with about
   $80 of USDZ for three $25 bonds plus gas.
2. The vendors' agents decide their own bids, so the numbers differ a little from take to take. Harbor has the
   lower floor (€1,300 a GPU against Orbit's $1,560, which holds while EURUSD is under 1.20) and is told that
   winning matters more than margin, so it should win; say the winner's name from the screen, not from memory.
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
   middle), eye level, quiet room, headphones or a decent microphone, Do Not Disturb on. Automatic zoom off.
4. Start recording on ⌘1 and follow the script. Every click is on the page; the terminal is never shown.
5. If a step fails or a take goes wrong: Ctrl-C in the terminal once and let it return the open bonds, run the
   command again, reload ⌘2. If a run died without that (the terminal was closed, or it crashed),
   `npm run bonds:return` first. Each run
   resets the sandbox balance to $80,000 before the request box opens (wait for it: up to a minute) and returns
   any bond still open, so takes are interchangeable. The budget the agent sets follows the balance it reads:
   $5,100 a month at $80,000, a little more if an earlier simulated deposit lands late.

**After**

The recording run becomes the evidence: `npm run evidence -- out/demo-<time>.json`, point `web/index.html` and
the `Dockerfile` at the new file, update the site's static copies and the evidence table (they still show the
Nov 12 run: two fixed bids, the restaurant, the $20 rebate), update `docs/submission.md`, and `fly deploy`, so
outbid.fly.dev replays the run in the video.

## Script

Aim for **3:30**, including time to watch the product. The times below are edit points. Let the bids and the
decline land before talking over them. ▶ is an action, 👀 is the screen cue, and 🎙 is spoken.
The lines name Harbor as the winner and Orbit as the loser: Harbor's floor is lower in dollars while EURUSD is
under 1.20, and the floors are code. If a take ever ends the other way, drop it and run again. Read the prices,
and the order of the bids in scene 4, off the screen.
Say it the way you would across a table, laptop open, to someone who runs the bank this is built on.

**1. Opening · 0:00–0:22**
▶ Start on ⌘1, the site's hero. Camera bubble large.

🎙 Hi, I'm Jo. AI agents are starting to buy for companies. But buying is still built for people: websites,
quote requests, sales calls. An agent doesn't need any of that. It needs one thing: the best offer. So we
flipped it. With Outbid, your agent posts what it needs, and vendors compete to win it. Let me show you.

▶ ⌘2, the buyer console.

**2. The request · 0:22–0:35**
▶ Point to the request in the text box.

🎙 Our team needs to fine-tune a vision model next year. It needs about 150 gigs of GPU memory. That's all I
tell my agent. No hardware, no vendor, no budget.

▶ **Ask your agent.** Trim the wait while *Claude is reading your request…* is visible.

**3. The intent · 0:35–0:55**
👀 The fields fill in, with Claude's note on the quantity, the *Code set the budget* line and the *Kept from
vendors* chips.
▶ Keep the completed request and the agent panel in view.

🎙 My agent works out the rest. It matched the job to what's on the market: two H100s. It set the budget from
our Airwallex balance: the most we can spend, with payroll and tax coming up, without touching our reserve. And
vendors never see who we are.

**4. The bidding · 0:55–1:27**
▶ **Post intent.**
👀 Both vendors post their bonds, then their opening bids arrive.

🎙 Two demo vendors. Each has its own agent and a private minimum price, and each puts down a deposit to bid.

▶ Zoom on the two rows (zoom 1 of 2). Read two or three actual prices as they change. Leave a beat between
bids; the next line follows the exchange on screen.

🎙 Orbit opens. Harbor goes lower. Orbit comes back… Harbor again… and Orbit stops. One sentence from me, and
two vendors just competed for it.

**5. Why this is practical now · 1:27–1:40**
👀 The final bids remain visible.

🎙 Nobody would run this by hand for every subscription. With agents on both sides, it's practical. And
vendors get a buyer who's ready to buy right now.

**6. The comparison · 1:40–1:48**
👀 *Two bids. … wins.* Point to the FX comparison and the winner.

🎙 Now, those bids were in different currencies, so the agent used Airwallex FX to compare the total cost.

**7. The approval · 1:48–1:56**
▶ **Continue.**
👀 The approval shows the vendor, amount, currency, merchant category, and exit terms. Read the vendor and
amount from the screen.

🎙 This is the one thing I do: approve. Harbor, this amount, in euros.

**8. The payment · 1:56–2:36**
▶ **Approve.**
👀 The card appears and its three controls tick on. Keep the *Airwallex sandbox* badge visible.

🎙 Harbor's winning offer becomes a new Airwallex card. The amount, currency, and merchant category come
straight from the deal I approved. Nobody has to set the limits separately.

👀 The agreed charge is approved. Then the same vendor's charge with a setup fee is declined.
▶ Zoom on the two charges (zoom 2 of 2).

🎙 The agreed charge goes through. Now Harbor tries to sneak in a setup fee… declined. Airwallex Issuing enforces the card's
transaction limit.

▶ Pause on the decline before continuing.

🎙 That's the advantage of a card. The safeguards are already built in: limits, instant declines, and a freeze
whenever I want. And every vendor already accepts one, so Harbor has nothing new to build.

**9. The bond · 2:36–2:54**
▶ **Continue.**
👀 *The charge cleared, so the sale is real.*

🎙 One thing is onchain: the vendors' deposits. They sit in escrow on Metal, so Outbid never holds them. The
loser gets its deposit back. The winner's becomes our fee once the payment clears. My company's money stays on
Airwallex.

**10. The outcome · 2:54–3:01**
👀 *That's the purchase.*, with the calls by service under the recap.
▶ Point at *You 2*.

🎙 My part was one request and one approval. The agents handled the negotiation and the payment.

**11. The renewal · 3:01–3:14**
▶ Point at *Edge cases · months later*. Don't play them.

🎙 And my agent stays responsible for this purchase. If Harbor raises the price next year, the card declines
it, and that decline tells the agent to reopen the auction. I only approve the new terms.

**12. Close · 3:14–3:32**
▶ ⌘1, the site's hero. Camera bubble large again. Keep `outbid.fly.dev` visible as the replay link.

🎙 Next, I want to bring in real vendors, starting with public prices as offers to beat. Buyers get a
comparison on day one, and vendors can join and bid lower. That's the market I want to build: agents bring the
demand, vendors compete to win it, and Airwallex moves the money. Thank you.

**Where the waits are.** After *Ask your agent*, Claude drafts for 3–5 s. After *Post intent*, the bonds take
about 10 s on Metal and each round of bidding 2–4 s (five or six calls in all). After *Approve*, the card is
issued and charged in about 5 s, and the bond's release in scene 9 is one Metal transaction. Trim them in the
editor; never trim a price falling.

**What outbid.fly.dev is.** A replay of a recorded run: the site and both consoles, playing the recorded
events. It calls nothing, Airwallex, Metal or Claude; the badge says *Replay*, the agents' words are the ones
recorded, and the Metal links open the real transactions. The close shows the link on screen and never says "try it", for
that reason. Until the V2 run is published as the evidence, it replays the Nov 12 run.

## If it runs long

Speed the cut up in the editor rather than dropping scenes. Never lose the *Kept from vendors* chips, the
bidding, the approval or the declined setup fee: those are the product.

## Questions after the video

Short answers, in the same plain words as the video.

- **Are the vendors AI agents too?** Yes. Each vendor has its own agent, a Claude model that sees only its own
  floor and the price to beat and decides whether to undercut or stop. Its floor is enforced in code. The two
  vendors themselves are ones I set up for the demo; in production each vendor runs its agent against the same
  interface.
- **Where does Claude run, and what does it decide?** The buyer's agent runs on my machine, `npm run demo`. For
  the buyer Claude writes the intent and explains each decision; it never picks. Ranking, budget and the cash
  reserve are code. For a vendor it decides the bid, inside limits that are code.
- **Does it have to be a card?** Not necessarily: the auction works with any payment rail. A card is convenient
  in a few ways. Vendors already take cards, so there is nothing for them to integrate. Subscriptions already
  bill a card every month, so we only put a limit on it, and the agent never needs the power to send money. The
  card network enforces that limit before any money moves. And a declined charge tells the agent right away, so
  it reopens the auction, while a cleared one is a third party's record that the sale happened.
- **Could another vendor charge that card?** In the demo the card is bound to the vendor's merchant category,
  its currency and the bid's amount, which is what Airwallex's standard controls offer. Airwallex can also bind
  a card to one merchant brand, and the code does that when the vendor has a brand id; the sandbox enforces it
  but can't simulate the brand's own charge, and the demo's vendors are fictional, so it is off here. Not said
  in the video.
- **What if the vendor doesn't deliver?** The card doesn't solve that, and the video doesn't claim it does. What
  limits the damage today: billing is monthly, so one month is the most at stake, and a card charge can be
  disputed. Vetting vendors, or keeping the bond when a winner doesn't deliver, is not built.
- **What stops the buyer walking away?** The bid says what leaving early costs. The agent counts that exit fee
  against every other offer, so it only switches when it is still cheaper, and the old card takes the fee as its
  last charge before it is frozen.
- **What is onchain, and why?** Only the vendors' bid bonds. Lose and it comes straight back; win and it becomes
  Outbid's fee when the card charge clears. Outbid reports the cleared charge, so that part is Outbid's word; what
  the contract guarantees is that a bond can only go back to its vendor or to the fee account, and which charge
  released it is public.
- **How do you get vendors on day one?** Not built yet: the agent would post public list prices as opening bids,
  so a vendor that joins has something to beat and the buyer gets a comparison even with no vendors signed up.
- **Is this real money?** It runs on the Airwallex sandbox and Metal testnet: real APIs, real card network
  decisions, test money.

## Organisers' checklist

- [ ] Under 4 minutes.
- [ ] The product on screen within 30–45 s (*Ask your agent*, scene 2, at about 0:25).
- [ ] The working product, no slides.
- [ ] One use case: the purchase.
- [ ] Readable screen, clear audio and video.
- [ ] Camera at eye level, good light.
- [ ] Easy to follow without other context.
- [ ] Says why it matters and what people can do next.
- [ ] Watched the whole recording once before sending.
