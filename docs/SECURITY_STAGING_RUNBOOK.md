# Security — staging runbook (Seq 12)

**Route:** `/app/security` · **API:** `security.*`.

## Preconditions

- Staging org with **SOC** users (`security_analyst` or admin) and at least one **requester** for negative checks.
- Optional: seeded CMDB assets for “affected systems” linkage (N/A if free text only).

## Smoke checklist

1. **RBAC:** Requester cannot create incidents or vulnerabilities in API (matches `security-rbac.test.ts`).
2. **Analyst:** Create incident → advance states → add containment note → close or `false_positive`.
3. **Vulns:** Create → list → remediate; confirm org isolation (second org cannot `getIncident` by UUID).
4. **Dashboards:** `openIncidentCount` matches list filters (spot-check).
5. **Web:** `/app/security` loads without React runtime error (`e2e/security.spec.ts`).

## N/A

- Meilisearch / external threat intel feeds — document when connectors ship.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 12 C3 |
