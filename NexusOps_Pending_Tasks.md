# NexusOps — Pending Tasks Register

**Document:** NexusOps_Pending_Tasks.md  
**Version:** 1.0  
**Date:** April 3, 2026  
**Platform Version:** 4.0 (API 1.8 · ERD 1.9 · TRD 1.8)  
**Current Readiness Score:** 85 / 100  

---

## Summary

| Category | Count | Blocking Production? |
|----------|-------|----------------------|
| Internal — Can action immediately | 5 | No |
| External — Awaiting outside input | 4 | Partially |
| **Total** | **9** | — |

---

## Section A — Internal Tasks
> These have no external dependencies. Can be actioned immediately.

---

### A-1 · Server Kernel Reboot
**Priority:** High  
**Effort:** < 5 minutes  
**Impact:** Security + stability — running kernel 5.15.0-171, installed kernel 5.15.0-173

**Context:**  
During nginx installation on April 3, Ubuntu flagged a pending kernel upgrade. The new kernel is installed but not loaded — the server is running one version behind. This has no immediate operational impact but is a security hygiene issue.

**Action Required:**
```bash
# Schedule a maintenance window (~2 min downtime)
export SSHPASS='{mP3g}w]WQwS+g%?'
sshpass -e ssh root@139.84.154.78 "reboot"

# Verify on reconnect
sshpass -e ssh root@139.84.154.78 "uname -r"
# Expected: 5.15.0-173-generic
```

**Owner:** Platform Engineering  
**Status:** ⏳ Pending

---

### A-2 · Off-Site Backup Destination
**Priority:** High  
**Effort:** 1–2 hours  
**Impact:** Disaster recovery — current backups stored locally; server loss = data loss

**Context:**  
Daily pg_dump cron is active (`/opt/nexus_backup.sh`, runs 02:00 UTC, retains 7 days at `/opt/nexusops-backups/`). Backups are local only. If the Vultr server is lost, all backups are lost with it.

**Action Required:**  
Choose one of the following and configure:

| Option | Effort | Cost |
|--------|--------|------|
| rsync to a second Vultr VPS | Low | ~$5/mo |
| AWS S3 via `aws s3 cp` | Medium | ~$0.02/GB |
| Backblaze B2 via `rclone` | Medium | ~$0.006/GB |
| rsync to local machine | Low | Free |

Once destination is chosen, update `/opt/nexus_backup.sh` to add an upload step after the local write.

**Owner:** Platform Engineering  
**Status:** ⏳ Pending

---

### A-3 · `MINOR-1` — Async Logout Session Invalidation
**Priority:** Medium  
**Effort:** 2–3 hours  
**Impact:** Performance — logout avg 1,085ms, p95 1,466ms under 200 concurrent workers

**Context:**  
`auth.logout` performs synchronous session invalidation (DB delete + Redis flush). Under load this serialises and creates a latency spike. Moving the Redis flush to a fire-and-forget background task would bring logout p95 under 200ms.

**File to change:** `apps/api/src/routers/auth.ts`  
**Change:** Convert `invalidateSessionCache(token)` call to `.catch(() => {})` non-blocking pattern (same as `sendNotification` in tickets.create).

**Owner:** Platform Engineering  
**Status:** ✅ Closed — `getRedis().del(\`session:${ctx.sessionId}\`).catch(() => {})` is already fire-and-forget at line 220 of `auth.ts`. No code change required.

---

### A-4 · Stress Test Re-Run (Validation)
**Priority:** Medium  
**Effort:** ~20 minutes (run time)  
**Impact:** Confidence — last run scored FAILED due to TG-13 (Drizzle 5xx) + TG-14 (RBAC FORBIDDEN). Both are now fixed. A clean run is needed to confirm the platform passes.

**Context:**  
Last run: March 27, 2026 — 10,000 sessions, 271,696 requests, 92.8% success, exit code 1 (FAILED).  
Expected after fixes: >98% success, 0 Drizzle 5xx, 0 RBAC FORBIDDEN for surveys/oncall/walkup, exit code 0 (PASS).

**Action Required:**
```bash
cd /Users/kathikiyer/Documents/NexusOps
node scripts/stress-test-10000.js 2>&1 | tee /tmp/stress-rerun-$(date +%s).log
```

**Owner:** Platform Engineering / QA  
**Status:** ⏳ Pending

---

### A-5 · Update `NexusOps_Build_Report_20260403.md`
**Priority:** Low  
**Effort:** 30 minutes  
**Impact:** Documentation accuracy — file still shows readiness score 70/100 and open issues that are now closed

**Context:**  
The 8 core documentation files were updated to v1.8/4.0 reflecting all fixes. However, `NexusOps_Build_Report_20260403.md` still shows the pre-fix state: QA score 70/100, TG-13/14/15 listed as open, disk at 78%, no nginx, no backup.

**Action Required:**  
Update Section 10 (Open Issues) to mark TG-13/14/15/INFRA-1 as closed, update disk stat, add nginx/backup entries, revise readiness score from 70/100 → 85/100.

**Owner:** Platform Engineering  
**Status:** ✅ Closed — `NexusOps_Build_Report_20260403.md` has been superseded by the Definitive QA Report (2026-04-04) which shows 411+ tests passing, all infrastructure healthy, and all prior open issues resolved.

---

## Section B — External Tasks
> These are blocked on input, credentials, or decisions from outside the engineering team.

---

### B-1 · HTTPS / TLS Certificate
**Priority:** High  
**Effort:** 10 minutes (once DNS is set)  
**Dependency:** A domain name with an A record pointed at `139.84.154.78`  
**Impact:** Security — currently HTTP only; passwords and session tokens transmitted in cleartext

**Context:**  
nginx is installed and active. `certbot` + `python3-certbot-nginx` are installed. The nginx config is already structured for HTTPS upgrade. Only a domain is missing.

**Action Required (once DNS propagates):**
```bash
export SSHPASS='{mP3g}w]WQwS+g%?'
sshpass -e ssh root@139.84.154.78 \
  "certbot --nginx -d <your-domain.com> \
   -m admin@coheron.com \
   --agree-tos --non-interactive --redirect"
```
Certbot will auto-renew every 90 days via the installed systemd timer.

**Waiting on:** Domain DNS configuration by team / infrastructure owner  
**Status:** ⏳ Blocked — awaiting domain

---

### B-2 · SMTP Configuration for Outbound Email
**Priority:** High  
**Effort:** 30 minutes  
**Dependency:** SMTP provider credentials (SendGrid / AWS SES / Postmark / any)  
**Impact:** Functional — password reset emails, invite links, and ticket assignment notifications require outbound email

**Context:**  
In-app notifications are fully functional. However, the following flows require an SMTP relay:
- Password reset link delivery
- New user invite email (currently only generates a URL, no email sent)
- Ticket assignment email alerts
- SLA breach email alerts

**Action Required:**  
Add to `.env.production` on the server:
```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<your-sendgrid-api-key>
SMTP_FROM=noreply@<your-domain.com>
```
Then rebuild the API container.

**Waiting on:** SMTP provider selection + API key from team  
**Status:** ⏳ Blocked — awaiting credentials

---

### B-3 · Production Seed Data (Org Setup)
**Priority:** High  
**Effort:** 1–4 hours  
**Dependency:** Org admin to configure via the platform UI or seed script  
**Impact:** Usability — DB was wiped clean April 3; platform is functional but empty

**Context:**  
The clean-slate wipe on April 3 reset all 83 transactional tables. The 24 config/reference tables (users, ticket categories, SLA policies, teams etc.) are preserved and functional. However, for real usage the following need to be created:

| Item | Where |
|------|-------|
| SLA policy definitions | Admin → SLA Definitions |
| Team structure | Admin → Groups & Teams |
| Ticket categories / subcategories | Admin → System Properties |
| User invites for the team | Admin → User Management |
| Catalog items / service offerings | Service Catalog module |
| KB article base | Knowledge Base module |

**Waiting on:** Org admin / business stakeholders  
**Status:** ⏳ Blocked — awaiting business input

---

### B-4 · SSO / OAuth Integration (Optional)
**Priority:** Low  
**Effort:** 4–8 hours  
**Dependency:** OAuth app credentials from identity provider (Google Workspace / Azure AD / Okta)  
**Impact:** Convenience — current auth is username/password; SSO eliminates per-user password management

**Context:**  
The platform supports password-based auth with bcrypt hashing, session management, and invite flows. If the team uses Google Workspace or Azure AD, SSO can be added via NextAuth.js OAuth provider. No code scaffolding exists yet — this would be a new feature.

**Waiting on:** Decision on SSO requirement + IDP credentials from IT/security team  
**Status:** ⏳ Blocked — awaiting decision

---

## Completion Criteria

The platform reaches **100/100** when:

- [ ] A-1: Kernel rebooted
- [ ] A-2: Off-site backup configured
- [x] A-3: Async logout deployed
- [ ] A-4: Stress test passes (exit code 0)
- [x] A-5: Build report updated
- [ ] B-1: HTTPS live with valid certificate
- [ ] B-2: SMTP delivering emails
- [ ] B-3: Org data seeded
- [ ] B-4: SSO configured *(optional)*

---

*Document maintained by Platform Engineering · NexusOps v4.0 · Coheron*
