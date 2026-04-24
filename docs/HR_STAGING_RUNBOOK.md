# HR module — staging runbook

**Canonical cross-module ENV table:** `docs/STAGING_RUNBOOK_MODULES_ADDENDA.md` (sections **HR + leave** and **Shared prerequisites**).

---

## HR-specific smoke (5 min)

1. Confirm migrations applied; org seeded.  
2. Log in as admin; open `/app/hr`.  
3. Create employee for a user without HR profile; verify row.  
4. Create case → resolve.  
5. As employee persona, submit leave; as admin, approve.  
6. **N/A:** payroll export, calendar integrations — skip unless explicitly enabled.

---

## Rollback / data hygiene

Use disposable staging org; truncate HR tables only if coordinated with QA (FKs from leave to employees).

---

| Version | Date |
|---------|------|
| 1.0 | 2026-04-07 |
