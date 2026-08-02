---
name: qa-audit
description: Deep quality audit of a NexusOps subsystem against docs/quality-bar.md. Audits standing code, not diffs. Use when asked to audit, review the quality of, or deep-check a subsystem or module.
---

# QA Audit

Deep audit of the subsystem named in $ARGUMENTS, as it exists today.
This is NOT a diff review. Audit the standing code.

**The person running this is not a developer.** They cannot evaluate a finding
by reading the code themselves. Every finding must be explained in plain
English as well as technically, and must say what it means for their users or
their business if left unfixed.

## First

Read `docs/quality-bar.md` and `CLAUDE.md`. `quality-bar.md` is the definition
of quality for this repo — do not substitute your own standards. If it does
not exist, stop and say so rather than inventing a rubric.

## Context you must account for

This codebase was largely written by Claude Code. Assume the original author's
blind spots are your blind spots, and compensate deliberately. Hunt for the
failure modes that generated code exhibits:

- Happy-path-only error handling; failure branches never thought through
- Drifted or invented contracts between modules written in separate sessions
- Tests that assert what the implementation does rather than what the
  requirement demands
- Abstractions with exactly one caller, built for a generality that never came
- Silent catch blocks, swallowed promise rejections, errors logged then dropped
- Retry and timeout logic that looks right but has no bound
- Config read once at import time that the runtime assumes is live

## Method — in order

1. **Map it.** Entry points, persistent state, external boundaries (network,
   DB, queue, third-party).
2. **Break the boundaries.** For each one, work out what happens when it fails,
   hangs, or returns a partial result. Most real defects live here.
3. **Trace one path.** Follow a single complete request end to end. List every
   assumption not validated at the point it is relied upon.
4. **Test the tests.** This repo uses pnpm with a Playwright suite in `e2e/`
   (see `playwright.config.ts`). Read the specs covering this subsystem. Flag
   any spec that would still pass if the underlying logic were inverted, and
   name the specific branches from steps 2 and 3 that nothing covers.

## Evidence rule — the most important instruction

Every finding needs `file:line`, the offending code, and a concrete failure
scenario: specific inputs leading to a specific bad state.

If you cannot state a concrete failure scenario, **discard the finding.** Do
not soften it into a "consideration", "nit", or "worth noting".

## Do not report

- Style, naming, formatting, import order — the linter owns these
- Anything outside `docs/quality-bar.md`
- Speculative hardening with no demonstrated exploit path
- Anything listed under "Known accepted debt" in the quality bar

## Severity

- **BLOCKER** — data loss, auth bypass, silent corruption
- **HIGH** — incorrect behaviour under realistic inputs
- **MEDIUM** — correct but fragile; breaks on a plausible next change
- **LOW** — worth saying, no urgency

## Output

Write to `reports/audit-$ARGUMENTS.md`, in this order:

1. **In plain English** — three to six sentences a non-technical owner can act
   on. What is the state of this part of the system? Is anything actually
   dangerous? What is the one thing worth fixing first, and why? No jargon.
2. **Verdict** — one paragraph on the subsystem's health.
3. **Findings**, grouped by severity. Each one gets:
   - file:line and the offending code
   - the concrete failure scenario
   - a one-line "what this means in practice" in plain English
4. **Root causes** — collapse the symptoms into the 2-3 design decisions that
   produced them. This section matters more than the finding list.
5. **Recommended order of work** — ranked by blast radius, not by count.

Do not modify any source file. Audit and remediation stay separate, or the
findings become unverifiable. If you find nothing above MEDIUM, say so plainly
in one line — finding nothing is a valid result. Do not pad.

## Before you finish

1. Open `reports/audit-plan.md` and tick this subsystem's checkbox.
2. Tell the user, in plain English and in this order:
   - whether anything here needs attention urgently, in one sentence
   - where to find the full report
   - the exact command to paste next, copied from the plan's first
     unticked box
3. If every box is now ticked, say so, and offer to write
   `reports/audit-summary.md` — a single plain-English roll-up across all
   subsystems, ranked by what to fix first.
