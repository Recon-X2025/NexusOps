# Notifications — gap remediation (Seq 6)

**QA pack:** `docs/QA_NOTIFICATIONS_ITSM_E2E_TEST_PACK.md`.  
**C5:** Layer 8 §8.29.

---

## Hero scope

- In-app notification **CRUD surface** for the signed-in user (list, unread, mark read, mark all read).
- **Admin fan-out** via `send` guarded by **`users:write`**.
- **Preferences** read path; upsert when DB unique exists.

**Deferred:** push/email/slack dispatch workers, digest scheduling, per-event-type matrix UI.

---

## Exit criteria

- [x] NTF-TC-01–07 covered by Layer 8 + RBAC; NTF-TC-08 by Playwright.
- [x] Register row **6** → Class **L**.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 6 C2 |
