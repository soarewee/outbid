# Submission

What goes into the HackerEarth form (Nov 14, 2026 03:29 KST), and what has to be true before it is sent. The
title and the description follow the shortlisted pitch; what changed in the build (GPU capacity instead of a
design tool, vendors' agents that bid in rounds, bid bonds in place of a rebated fee, the numbers of the recorded
run) is reflected here so the form matches the demo.

## Title

Outbid: Your Agent Posts What It Wants to Buy. Vendors Compete. The Winning Bid Becomes the Card.

## One line

A purchase-intent auction for what a company buys on subscription. The buyer tells its agent what it needs to
get done, the agent works out what to buy and what the company can spend, vendors' agents bid against each
other for it, the cheapest wins, and the approved terms become an Airwallex virtual card whose limit is the
winning bid, in that currency, at that kind of vendor. Both sides are bound: a vendor posts a bond to bid and
can't charge more than it bid, and leaving a commitment early costs the exit fee the bid set.

## Description

**AI agents are starting to buy for companies, but buying is still built for people: websites, quote requests,
sales calls.** An agent needs one thing: the best offer. So Outbid flips it. The agent posts what it needs,
vendors' agents compete to win it, and the winning bid becomes a card that can't be charged a cent more than
that bid.

**How it works (Kit 02: Intent-Bound Purchase Agent)**

1. **Say what you need done.** The buyer writes it the way they'd tell a colleague: "We're Fernhill Robotics.
   Our perception team needs to fine-tune a vision model next year. It needs about 150 GB of GPU memory." No
   hardware, no vendor, no budget. The agent works out the rest. **Claude** (with a JSON schema) works out what
   to buy from what is on the market: two 80 GB H100s, for 12 months, and says why. It never invents a budget:
   code reads the **Airwallex balance** and takes the most the company can pay a month and still keep its
   reserve through the bills already due ($5,100 at $80,000). It lists what it kept from vendors (the name, the
   team, the use, the balance), and code checks the four fields before they are posted. Vendors see those
   fields, and that the funds behind them are verified, and nothing else.
2. **Vendors' agents bid against each other.** Each vendor posts a bond to bid and has its own agent (Claude),
   which sees only its own vendor's floor and the price to beat. Both open; whoever is behind is told the price
   to beat, priced with **Airwallex FX**, and undercuts or stops. In the recorded run Orbit goes $3,380 →
   $3,170 and stops; Harbor goes €2,940 → €2,800 and wins. A vendor's floor is enforced in code whatever its
   agent says. The ranking and the budget live in code too; Claude reads the vendors' terms and explains the
   pick, and never picks.
3. **You see the agent work.** Beside the story, the buyer console lists every call the agent makes as it makes
   it: Claude for words, Airwallex for money, Metal for the bid bonds, its own code for the rules, and the
   buyer's approvals. The purchase ends on a count: the buyer did two things, the agent made the rest.
4. **Approval is bound to the terms.** The human approves one thing: this vendor, this amount, this currency,
   this merchant category, and what leaving early would cost.
5. **The winning bid becomes the card.** Outbid issues an **Airwallex virtual card** (Issuing) whose controls
   are those terms: a per-transaction limit at the bid, a currency allowlist, the vendor's merchant category.
   The agreed charge clears; the same vendor billing a setup fee on top of its bid is declined by the network
   with `LIMIT_EXCEEDED`. A vendor that bid low to win can't make it back later.
6. **One thing is onchain: the bid bonds.** A vendor's bond sits in an escrow on **Metal testnet** (Airwallex has
   no escrow object, and a marketplace shouldn't hold deposits from vendors it has never met). The loser's goes
   straight back. The winner's becomes Outbid's fee when its charge clears on the card: the cleared **card
   transaction** is the proof of sale, and its id is recorded with the release. Outbid sends the buyer a
   cashback out of its fee through **Airwallex Payouts**. The company's money never leaves Airwallex.

**The decision keeps changing as the facts do.** At renewal the incumbent bills 22% more; the card declines it
with `LIMIT_EXCEEDED`, and that decline tells the agent to reopen the auction and ask the incumbent: match the
lower bid, or the company switches. It matches, and gets a new card while the old one is frozen. Then a third
vendor, Summit, offers the year prepaid for $32,500, the cheapest total even after the exit fee the current
vendor's bid set, which is counted against every other offer. The agent reads the company's **Airwallex
balance** and upcoming obligations: paying both up front would put cash under the $20,000 reserve floor on day
45, so it waits. A $30,000 customer payment lands in the **Global Account**, the same rules re-run, the prepay
fits, and after approval the company switches: the old card takes the exit fee as its last charge, is frozen,
and declines with `CARD_INACTIVE`. The reserve lives in code.

**Does it have to be a card?** Not necessarily: the auction works with any payment rail. But a card is hard to
beat. Almost every vendor already takes one, so there is nothing for it to integrate. A subscription already bills
a card every month, so Outbid only puts a limit on it, and the agent never holds the power to send money. The
network enforces that limit before any money moves. And a declined charge tells the agent right away, while a
cleared one is a third party's record that the sale happened. The card's controls are the amount, the currency
and the merchant category; a vendor that is a known merchant brand at Airwallex can be bound by brand as well
(`allowed_merchant_brands`), which the sandbox enforces but can't simulate a matching charge for, so the demo's
fictional vendors are bound by category.

**What's built.** Everything above runs end to end against the Airwallex sandbox and Metal testnet with
`npm run demo`: Balances, FX, Issuing, card transactions, Global Accounts and Payouts on Airwallex; a Foundry
`FeeEscrow` contract for the bid bonds on Metal. A buyer console and a vendor console fill in live from the
run; the buyer writes the request, posts the intent and gives each approval on the page, with the agent's calls
listed beside it. Each run saves its request log, and `evidence/2026-11-13.json` is a publishable copy of the
run behind the site, with the response fields that prove each step. The hosted copy at outbid.fly.dev replays
the purchase in that run, the one in the video, without touching the sandbox. The demo buys GPUs, but nothing
in the code is about GPUs: what can be bought and each vendor's price list are data, and the same run works
for 25 design tool seats. The two vendors are demo vendors; next, the agent brings in public price lists as
opening bids, so there is competition from day one.

## Links

| What | Where |
| --- | --- |
| Repository, with run instructions in the README | https://github.com/soarewee/outbid |
| Video (3 minutes 38 seconds) | https://youtu.be/LJz_P2lyHMo |
| Hosted replay of the recorded run: site, buyer console, vendor console | https://outbid.fly.dev |
| Evidence of the run (Airwallex ids and response fields, Metal transactions) | `evidence/2026-11-13.json` in the repository |
| Fee escrow on Metal testnet | address in `contracts/deployments/metal-testnet.json`, transactions on testnet.metalntwx.com |

## Before sending the form

In this order, on Nov 13 after the video is up:

- [x] `gitleaks git .` over the whole history finds nothing (Nov 7: 31 commits, no leaks). Airwallex keys have
  no fixed format, so also confirm by eye that `.env` was never committed: `git log --all --oneline -- .env`
  prints nothing.
- [x] MIT license in the repository, visible in its About.
- [x] Delete the unused `FLY_API_TOKEN` GitHub Actions secret (Nov 7; no workflow used it).
- [x] Revoke the Fly token named `outbid` (Nov 7); the hosted replay is deployed by hand with `fly deploy`.
- [x] Put the YouTube link in the README (next to the hosted replay) and in the table above.
- [x] `AGENTS.md`: change "The repo is private until submission" to say it is public, and keep the parent
  project described without a local path.
- [x] If the recording run replaced the Nov 2 evidence: `npm run evidence`, update `web/index.html` and the
  `Dockerfile`, `fly deploy`, and check the hosted buyer console still plays (Nov 10: the 14:25 KST run).
- [x] Make the repository public (`gh repo edit --visibility public --accept-visibility-change-consequences`).
- [x] From an empty folder, `git clone`, `cp .env.example .env`, fill it, `npm test`, `npm run demo -- --yes`:
  the run instructions work as written (Nov 10: 18 tests pass, all five parts ran against the sandbox and Metal).
- [ ] Fill the form with the title, the description and the links above; check that the video is public and
  under 5 minutes.
