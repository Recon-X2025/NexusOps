NexusOps product scorecard
==========================

Purpose
-------
Structured 0–3 scoring of each product module against market leaders, with two
ICP weight profiles (India mid-market ITSM-led vs global enterprise).

Files
-----
  data/dimensions.json      — Dimension definitions and scale
  data/weight-profiles.json — ICP weight vectors (sum to 1.0 per profile)
  data/modules.json         — Module rows, specialist owner, scores, evidence, notes
  out/module-scorecard.csv — Generated wide CSV (open in Excel/Sheets)
  out/summary.txt          — Mean weighted score per profile

Regenerate CSV
--------------
  pnpm scorecard

Editing
-------
Adjust scores and notes in data/modules.json. Adjust ICP weights in
data/weight-profiles.json. Re-run pnpm scorecard.

Scores are qualitative; update modules.json when shipping materially changes
a dimension (e.g. custom fields admin UI, AR surfaces, Temporal HA).
