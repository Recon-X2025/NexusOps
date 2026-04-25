# NexusOps module scorecard — review guide

This folder holds a **qualitative** module-by-module comparison vs market leaders (0–3 scores on eight dimensions) and two **ICP weight profiles**.

## Quick links

| Artifact | Purpose |
|----------|---------|
| [data/modules.json](data/modules.json) | **Source of truth** — specialist owner, scores, evidence paths, notes |
| [data/dimensions.json](data/dimensions.json) | What each dimension means; 0–3 scale |
| [data/weight-profiles.json](data/weight-profiles.json) | **India mid-market ITSM-led** vs **global enterprise** weights |
| [out/module-scorecard.csv](out/module-scorecard.csv) | Wide table with `weighted_*` columns — open in Excel/Sheets |
| [out/summary.txt](out/summary.txt) | Mean weighted score per profile |
| [README.txt](README.txt) | Regenerate instructions (`pnpm scorecard` from repo root) |

## Regenerate CSV after edits

From repository root:

```bash
pnpm scorecard
```

## Latest roll-up (from generated summary)

Run `pnpm scorecard` to refresh; authoritative numbers are in [out/summary.txt](out/summary.txt).

- **India / mid-market / ITSM-led** (`india_midmarket_itsm`): mean **1.347** (17 modules, 0–3 scale).
- **Global enterprise** (`global_enterprise`): mean **1.349**.

## Interpretation

- **3** = best-in-class / leading for that dimension.  
- **0** = large gap vs typical leaders.  
- Weighted columns are still on **0–3**; they are a dot product of dimension scores and the profile weights.

Scores reflect product/docs judgment at the date in `modules.json` (`as_of`); update JSON when capabilities change materially.
