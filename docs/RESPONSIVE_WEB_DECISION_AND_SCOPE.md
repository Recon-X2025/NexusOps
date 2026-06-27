# Responsive Web Now, Native App Later — Decision & Scope

**Date:** 2026-06-27
**Status:** Decided
**Related:** `docs/SMB_NEEDED_NOW_BACKLOG.md` (Story 3 — mobile), `docs/FEATURE_BRANCH_PLAYBOOK.md`

---

## Decision

**Make the existing Next.js web app fully responsive (adapt to screen size) now. Defer the native mobile app (`apps/mobile/`).**

Rationale:
- **One codebase.** Responsive web serves desktop + tablet + phone browsers from the app already maintained. The native app is a separate Expo/React Native codebase with its own app-store releases and push infra to keep in sync.
- **Covers most of the mobile job for the SMB segment.** Approvals, ticket updates, expense review, and dashboards work fine in a phone browser. Only **native push notifications** and **camera receipt capture** genuinely require the native app — and those can wait.
- **Reversible / non-blocking.** The native app already exists in `apps/mobile/`; deferring it costs nothing and responsive web doesn't block shipping it later.

Accepted trade-off: responsive web on a phone is **good, not great** — no native push, no offline, lives in a browser tab. Acceptable for v1 of the SMB segment.

### When to revisit the native app
Pull the native app forward only when **either** is true:
- Design partners specifically need **push-driven approvals** (notification → tap → approve while the laptop is closed), or
- **On-the-go camera receipt capture** becomes a real adoption driver for expenses.

Until then, `apps/mobile/` stays in the repo, untouched.

---

## Current state (verified 2026-06-27)

A codebase pass shows the **app shell is already responsive**; the **content pages are mostly not**.

**Already done (no work needed):**
- Sidebar has a mobile drawer pattern — floating button + dialog overlay on small screens (`md:hidden`), full sidebar on desktop (`hidden md:flex`). See `apps/web/src/components/layout/app-sidebar.tsx`.
- Header is responsive (`apps/web/src/components/layout/app-header.tsx`).

**The actual gap — content pages assume desktop width:**
- Hardcoded multi-column grids dominate. Rough counts across `apps/web/src/app/app/`:
  - `grid-cols-2` used **~103×** but `md:grid-cols-2` only **~11×**
  - `grid-cols-4` used **~43×** but `md:grid-cols-4` only **~6×**
  - `grid-cols-3` used **~41×** but `md:grid-cols-3` only **~7×**
  - → Most grids stay multi-column on a phone (cramped / overflowing) instead of collapsing to one column.
- Wide data tables overflow horizontally on mobile. Confirmed table-heavy pages include: `tickets`, `vendors`, `accounting`, `attendance`, `escalations`, `work-orders` (+ `[id]`, `parts`), `devops`, `settings/api-keys`.

**Implication:** this is a **mechanical fix to content pages**, not an architecture change. The hard part (navigation chrome) is already done.

---

## Scope

### What "make it adapt to screen size" means here
1. **Grids:** convert hardcoded `grid-cols-3/4/5` → responsive (`grid-cols-1 md:grid-cols-3`, etc.) so cards stack on phones and expand on desktop.
2. **Tables:** wrap wide tables in an `overflow-x-auto` container, or switch to a stacked/card layout on small screens, so they scroll instead of breaking layout.
3. **Spacing & typography:** fix the few fixed paddings/font sizes that assume desktop width.
4. **Touch targets:** ensure buttons/rows are comfortably tappable (mostly fine already).

### Starting point: **manager-loop pages first** (decided)
These are the pages a person actually opens on a phone, so they deliver real-world payoff first with the smallest test surface:

| Priority | Page(s) | Path | Why first |
|---|---|---|---|
| 1 | **Approvals** | `apps/web/src/app/app/approvals/` | The #1 phone job: approve/reject on the go |
| 2 | **Expenses** (employee + finance queue) | `app/hr/expenses/`, `app/finance/expenses/` | File + review expenses; table-heavy, needs overflow fix |
| 3 | **Leave / time-off** | `app/hr/` (leave surfaces) | Manager approves leave from phone |
| 4 | **Tickets** (list + detail) | `app/tickets/`, `app/tickets/[id]/` | View/update on the move; known table overflow |
| 5 | **Dashboard / Command Center** | `app/dashboard/`, `app/command/` | Quick status check on a phone |

### Phase 2 (after manager loop): global grid/table sweep
A mechanical pass across remaining pages to fix hardcoded grids and table overflow everywhere (vendors, accounting, attendance, escalations, work-orders, devops, etc.). Lower urgency — these are less likely to be opened on a phone.

### Explicitly out of scope
- Native push notifications / offline / camera capture (these are the native-app triggers above).
- Any change to `apps/mobile/`.
- New components or design-system changes — reuse existing Tailwind + UI primitives.

---

## How to build it (per the playbook)

- Branch from `main`: `feat/responsive-manager-loop` (see `docs/FEATURE_BRANCH_PLAYBOOK.md`).
- Pure-Tailwind, presentation-only changes — **no** logic, RBAC, query, or API changes. Keep diffs visual.
- Verify each page at common breakpoints (~375px phone, ~768px tablet, ≥1024px desktop).
- Run `pnpm build` + `pnpm lint` before PR; no migrations or `check:trpc-parity` impact expected (UI-only).
- Ship the manager loop as one reviewable PR, then the global sweep as a second.

---

## Summary

| Question | Answer |
|---|---|
| Responsive web now? | **Yes** — shell already responsive; fix content pages. |
| Native app now? | **No** — defer until push or camera capture is a real driver. |
| Where to start? | **Manager-loop pages** (approvals, expenses, leave, tickets, dashboard). |
| Effort shape? | Mechanical Tailwind pass (grids + table overflow), not an architecture change. |
| Risk? | Low — presentation-only, one codebase, no logic/RBAC changes. |
