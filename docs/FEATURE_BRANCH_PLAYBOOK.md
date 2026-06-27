# Feature-Branch Playbook — Prototype Locally, Merge Safely

**Date:** 2026-06-27
**Audience:** Anyone prototyping changes (e.g. the SMB "needed-now" items) before the team reviews and merges.
**Why this exists:** To get the isolation of "build it locally first" **without** the risk of an offline fork that later has to be reconciled against `main` by reading two whole codebases.

---

## The decision in one line

> **Use a short-lived feature branch off `main`. Never an offline fork that diverges and gets manually merged later.**

A feature branch *is* local and private for as long as you want. It just stays anchored to the project's history, so the eventual merge is a normal PR — small, reviewable, CI-checked — instead of a two-codebase reconciliation.

---

## Why not "build locally, then merge two codebases later"

| Risk | What goes wrong |
|---|---|
| **Silent loss of guards** | Reconciling two independently-evolved trees on a 50-router / 132-table monorepo with shared RBAC is how a permission check, tenant-isolation filter, or migration silently gets dropped. Auth and India-compliance code are the worst places for this. |
| **No safety net until the end** | Offline work skips CI, tRPC parity checks, and migration-ordering validation until the final merge — exactly when divergence is largest and hardest to untangle. |
| **Breaks the "honesty" discipline** | The team's docs are built on "claims must match code, verified continuously." A big offline merge breaks that loop. |
| **Merge cost grows non-linearly** | The longer two trees diverge, the more conflicts and the more judgment calls. Small, frequent merges are cheap; one giant merge is expensive and error-prone. |

A feature branch removes all four because `git` tracks the common ancestor and replays only *your* deltas.

---

## The workflow

### 1. Branch from an up-to-date `main`
```
git checkout main
git pull
git checkout -b feat/<short-name>      # e.g. feat/saml-sso
```
One branch per story (see `docs/SMB_NEEDED_NOW_BACKLOG.md`). Independent branches = independent, small reviews.

### 2. Build — it's private until you push
Commit as often as you like. The branch lives only on your machine until you choose to push it. This is your "keep it local" phase.
```
git add <specific files>               # prefer naming files over `git add .`
git commit -m "feat(auth): validate SAML assertion signature"
```

### 3. Rebase on `main` frequently (the key habit)
Pull `main`'s new work into your branch **often** (daily, or before any big change) so you're always merging *small* deltas, never one giant divergence at the end.
```
git fetch origin
git rebase origin/main
# resolve any small conflicts now, while they're small
```
> This single habit is what makes the difference between a safe merge and a dangerous one.

### 4. Keep the safety net green locally
Before pushing, run what CI will run, so review is about design, not broken builds:
```
pnpm build
pnpm test                              # or the relevant test:layerN
pnpm check:trpc-parity                 # web <-> API procedure alignment
pnpm lint
```
If your change adds a DB migration, make sure it's a **new, ordered** migration file — never edit an existing one.

### 5. Open a PR when ready
Push the branch and open a PR against `main`. Let CI + parity checks + review run. The team reviews a *small, anchored* diff — not a reconciliation of two trees.
```
git push -u origin feat/<short-name>
gh pr create --title "..." --body "..."   # or via the GitHub UI
```

### 6. Merge via the project's normal path
Squash or merge per the repo's convention, after green CI and review approval. Delete the branch after merge.

---

## Guardrails specific to this codebase

These are the places a careless merge does the most damage — keep them intact:

- **RBAC / permissions:** every mutation flows through the module-permission matrix. Never add a code path (mobile, SSO, API) that authenticates without going through existing authorization.
- **Tenant isolation:** queries are `org_id`-scoped. A dropped scope filter is a cross-tenant data leak. Preserve scoping in every new query.
- **Migrations:** additive and ordered (`packages/db/drizzle/`). New file per change; never rewrite history of an applied migration.
- **tRPC parity:** web and mobile consume the API contract. Run `check:trpc-parity`; don't create shadow/mobile-only procedures.
- **Secrets at rest:** reuse the per-tenant DEK / encryption pattern (as integrations do). No plaintext secrets in DB or logs.
- **"Dashboard honesty":** no placeholder tiles shipped as if real. If a panel has no data, it says so.

---

## What NOT to do

- ❌ Don't develop on a long-lived fork that you plan to "merge by reading both codebases later."
- ❌ Don't let a branch run for weeks without rebasing on `main`.
- ❌ Don't use `git push --force` to a shared branch, or force-push `main`/`master`.
- ❌ Don't edit an already-applied migration to "fix" it — add a new one.
- ❌ Don't bypass CI / hooks (`--no-verify`) to land faster.

---

## TL;DR for the "I prototype, team reviews" model

1. `git checkout -b feat/x` off fresh `main`.
2. Build privately; commit freely.
3. `git rebase origin/main` **often** — merge small, merge continuously.
4. Run build + tests + `check:trpc-parity` locally before pushing.
5. Open a PR; team reviews a small, anchored diff; CI gates the merge.

This gives you exactly the "keep it local until I'm ready" control you wanted — minus the dangerous whole-codebase reconciliation step.
