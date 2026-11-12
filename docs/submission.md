# Submission

What goes into the HackerEarth form (Nov 14, 2026 03:29 KST), and what has to be true before it is sent. The
title and the description follow the shortlisted pitch; what changed in the build (GPU capacity instead of a
design tool, the numbers of the recorded run) is reflected here so the form matches the demo.

## Title

Outbid: Your Agent Posts What It Wants to Buy. Vendors Compete. The Winning Bid Becomes the Card.

## One line

A purchase-intent auction for what a company buys on subscription. The buyer tells its agent what it needs,
the agent writes an anonymous intent, vendors bid, the cheapest wins, and the approved terms become an Airwallex
virtual card that can only pay that vendor, that amount, in that currency. Vendors pay only for closed deals:
their prepaid fee is split into the buyer's rebate when the card charge clears.

## Description

**Ads compete for people's attention. But more and more of the buying is done by AI agents, and agents don't
see ads.** So vendors need a new place to compete. Outbid lets them bid for an agent's purchase directly, and the
winning bid becomes a card that can only pay what the buyer approved.

**How it works (Kit 02: Intent-Bound Purchase Agent)**

1. **Say what you need.** The buyer writes it the way they'd tell a colleague: "We're Fernhill Robotics. Our
   perception team needs two H100s for 12 months, under $3,750 a month. We have about $80,000 in the bank…"
   The agent (**Claude**, with a JSON schema) writes the anonymous intent from it: H100 GPU capacity, 2 GPUs, up
   to $3,750 a month, 12 months. It lists what it kept from vendors (the name, the team, the cash, the bills),
   and code checks the four fields before they are posted. Vendors see those fields and nothing else.
2. **Vendors bid, the cheapest wins.** Two vendor agents answer: Orbit $3,400 a month, Harbor €2,960 a month.
   Outbid prices the euro bid with **Airwallex FX** and ranks total cost over the term; Harbor wins. The ranking
   and the budget live in code; Claude reads the vendors' terms and explains the pick, and never picks.
3. **You see the agent work.** Beside the story, the buyer console lists every call the agent makes as it makes
   it: Claude for words, Airwallex for money, Metal for the escrow, its own code for the rules, and the buyer's
   approvals.
4. **Approval is bound to the terms.** The human approves one thing: this vendor, this amount, this currency,
   this merchant category.
5. **The winning bid becomes the card.** Outbid issues an **Airwallex virtual card** (Issuing) whose controls
   are those terms: a per-transaction limit at the approved amount, a currency allowlist, the vendor's merchant
   category. The agreed charge clears; a restaurant charge is declined by the network with
   `MERCHANT_CATEGORY_NOT_ALLOWED`.
6. **Vendors pay only for closed deals.** Like any marketplace, Outbid takes a small fee from the winning
   vendor: Harbor prepaid a $25 acquisition fee into an escrow on **Metal testnet** (Airwallex has no escrow
   object, and a marketplace shouldn't hold vendors' fees itself). The fee is released only when the charge
   actually goes through on the card: the cleared **card transaction** is the proof of sale, reported by the
   network rather than by either party. The escrow splits the fee in one transaction, $5 to Outbid and $20
   back to the buyer who brought the deal, and **Airwallex Payouts** carry the rebate to the buyer's bank.

**The decision keeps changing as the facts do.** At renewal the incumbent bills 22% more; the card declines it
with `LIMIT_EXCEEDED`, Outbid reopens the auction and tells the incumbent: match the lower bid, or the company
switches. It matches, and gets a new card while the old one is frozen. Then a third vendor, Summit, offers the
year prepaid for $34,500, the cheapest total. The agent reads the company's **Airwallex balance** and upcoming
obligations: paying it up front would put cash at about $19,500 on day 45, under the $20,000 reserve floor, so
it waits. A $30,000 customer payment lands in the **Global Account**, the same rules re-run, the prepay fits,
and after approval the company switches; the old card declines with `CARD_INACTIVE`. The reserve lives in code.

**Why a card, not just a bid?** A bid is a promise; the vendor's billing system decides what gets charged, and
an agent holding an open company card can pay anyone anything. A virtual card per winning bid means the vendor can't
overcharge, the agent can't overspend beyond what the human approved, and nobody can fake a sale, because every
settled charge is reported by the network, not by either party. And almost every vendor already takes cards, so
it needs no vendor integration.

**What's built.** Everything above runs end to end against the Airwallex sandbox and Metal testnet with
`npm run demo`: Balances, FX, Issuing, card transactions, Global Accounts and Payouts on Airwallex; a Foundry
`FeeEscrow` contract on Metal. A buyer console and a vendor console fill in live from the run; the buyer writes
the request, posts the intent and gives each approval on the page, with the agent's calls listed beside it. Each run saves its request log, and `evidence/2026-11-12.json`
is a publishable copy of the run behind the site, with the response fields that prove each step. The hosted
copy at outbid.fly.dev replays the purchase in that run, the one in the video, without touching the sandbox.

## Links

| What | Where |
| --- | --- |
| Repository, with run instructions in the README | https://github.com/soarewee/outbid |
| Video (3 minutes) | https://youtu.be/0mQKk-4Egrw |
| Hosted replay of the recorded run: site, buyer console, vendor console | https://outbid.fly.dev |
| Evidence of the run (Airwallex ids and response fields, Metal transactions) | `evidence/2026-11-12.json` in the repository |
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
