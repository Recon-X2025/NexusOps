---
name: qa-map
description: Inventory the whole NexusOps codebase, draft a quality bar, and build a complete audit checklist. Run this once before any auditing. Use when asked to plan an audit, map the codebase, or figure out what needs auditing.
---

# QA Map

Run once, before any auditing begins. Produces the plan that everything else
follows.

**The person running this is not a developer.** Write every explanation in
plain English. No jargon without a one-line definition beside it. Never assume
they can read code to fill in a gap.

## Step 1 — Inventory

Explore the repository and identify every distinct subsystem: authentication,
data layer, API surface, background jobs, integrations, UI, and so on. Be
exhaustive. It is better to list twelve narrow areas than four vague ones,
because each will be audited separately and narrow scopes produce sharper
findings.

For each subsystem, record:
- A short plain-English description of what it does for the business
- The main folders and files it covers
- Roughly how much of the app's critical logic it holds (high / medium / low)
- Whether a failure here would be visible to customers, silent, or both

## Step 2 — Draft the quality bar

Open `docs/quality-bar.md`. Any bracketed placeholder is unfilled.

Fill them in yourself by reading the codebase and inferring the rules this
project already appears to follow — the data invariants, the tenancy rules,
the API conventions, the error-handling patterns. Then rewrite the file with
your proposals in place.

At the top of the file, add a section titled **"Please confirm these"** listing
each rule you inferred, in one plain sentence each, with a note on what it
would mean if the rule were wrong. The user will read this and correct you.
Do not present inferred rules as settled fact.

## Step 3 — Write the plan

Create `reports/audit-plan.md`:

```
# NexusOps Audit Plan

Generated: <date>
Subsystems: <count>

## How to use this file
Run one audit at a time. Copy the command next to the first unchecked box
and paste it into Claude Code. Come back here when it finishes.

## Checklist
- [ ] **auth** — handles who can log in and what they can see
      Command: /qa-audit auth
      Criticality: high | Failure is: silent
- [ ] **billing** — ...
      Command: /qa-audit billing
      Criticality: high | Failure is: visible
...
```

Order the checklist by criticality, highest first, so that if the user stops
early they have still covered what matters most.

## Step 4 — Tell them what happens next

End your response with, in plain English:
- How many subsystems you found
- Roughly how many sessions this will take
- The exact single command to paste next
- A reminder that they should read the "Please confirm these" section of
  `docs/quality-bar.md` first and correct anything you got wrong

Do not modify any source code. This step only reads and writes documentation.
