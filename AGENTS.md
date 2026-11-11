# AGENTS.md

Instructions for any coding agent working in this repo (Claude Code reads it through `CLAUDE.md`).

Outbid is a purchase-intent auction for company SaaS buying: a company's agent posts an anonymous intent,
vendor agents bid, the agent picks a bid that respects the company's cash reserve, and the approved terms
become an Airwallex virtual card that can only pay that vendor, that amount, in that currency. Vendors prepay
an acquisition fee into an escrow; when the card charge clears, the fee is split into the buyer's rebate and
Outbid's fee. It is a solo entry in the Airwallex Agentic Banking Hackathon (Kit 02: Intent-Bound Purchase
Agent).

## The hackathon

[Airwallex Agentic Banking Hackathon](https://airwallex.hackerearth.com/), shortlisted on Oct 27. Submission
deadline **Nov 14, 2026 03:29 KST**. The shortlisted pitch is the title and description in
`docs/submission.md`; the demo must match it.

What drives the build:

- It must be built on the Airwallex API (sandbox): balances, FX, Issuing, card transactions, Global Accounts,
  Payouts. Metal testnet holds only what Airwallex doesn't: the fee escrow.
- Follow the [builder guide](https://airwallexdev.com/guide): decisions change when balances, deadlines or risk
  change; approvals are bound to amount, currency, counterparty and terms; limits and the reserve live in
  code, and the model reads vendor terms and explains the trade-off.
- Deliverables: a working demo, a video under 5 minutes, and a repository link with run instructions.
  Everything is in English. The repo has been public since Nov 10, so anything committed is published.
- Outbid is an independent entry. Don't mention the team's other hackathon entries in the repo or demo.

## Working here

- Never commit `.env`, API keys, sandbox credentials or the `out/` request logs. The repo will be public.
- Commit straight to `main`. `git pull --rebase` before pushing; never force-push `main`. Commit as the
  human; never change git author settings.
- One commit per intent, not per edit: follow-up edits from the same sitting go into that commit (amend or
  squash local commits before pushing, never after).
- Commit messages:

  ```
  type: subject            # English, ≤72 chars, no period (feat, fix, refactor, docs, test, chore)

  Why: what was missing or why this change (required)
  Notes: alternatives considered, sandbox findings, taste calls (optional)

  Co-Authored-By: ...
  ```

  Write `Why:`/`Notes:` from what the person told you. If you don't know why they wanted a change, ask in
  one line before committing.
- Talk with the person in Korean; write code, docs and UI in English.
