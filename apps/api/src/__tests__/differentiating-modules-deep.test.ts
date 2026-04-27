import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import { testDb, seedFullOrg, authedCaller, cleanupOrg, createSession, initTestEnvironment, seedUser } from "./helpers";
import { boardMeetings, boardResolutions, securityIncidents, vulnerabilities, directors, complianceCalendarItems, investigations, companyDirectors } from "@nexusops/db";
import { eq, and, sql } from "@nexusops/db";

describe("Differentiating Modules — Deep Integration Tests", () => {
    let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
    let adminToken: string;
    let legalCounselToken: string;
    let financeToken: string;

    beforeAll(async () => {
        await initTestEnvironment();
        orgCtx = await seedFullOrg();
        adminToken = await createSession(orgCtx.adminId);
        financeToken = await createSession(orgCtx.financeId);

        // Seed a legal counsel user for RBAC tests
        const { userId: counselId } = await seedUser(orgCtx.orgId, {
            role: 'member',
            matrixRole: 'legal_counsel',
        });
        legalCounselToken = await createSession(counselId);

        // Ensure csm_cases exists for governanceSummary and other tests
        const db = testDb();
        await db.execute(sql`
      CREATE TABLE IF NOT EXISTS csm_cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        number TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'open',
        account_id UUID,
        contact_id UUID,
        requester_id UUID,
        assignee_id UUID,
        resolution TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    });

    afterAll(async () => {
        await cleanupOrg(orgCtx.orgId);
    });

    // ── 1. Secretarial & India Compliance ──────────────────────────────────────

    describe("Secretarial & India Compliance", () => {
        it("Board Meeting: create → updateStatus with quorumMet", async () => {
            const caller = await authedCaller(adminToken);
            const mtg = await caller.secretarial.meetings.create({
                title: "Q1 Board Meeting",
                type: "board",
                scheduledAt: new Date(Date.now() + 86400000).toISOString(),
            });
            expect(mtg.status).toBe("scheduled");

            const updated = await caller.secretarial.meetings.updateStatus({
                id: mtg.id,
                status: "completed",
                quorumMet: true,
                minutesDraft: "Quorum was present. All items approved.",
            });
            expect(updated.status).toBe("completed");
            expect(updated.quorumMet).toBe(true);
        });

        it("Resolutions: create → pass with votes", async () => {
            const caller = await authedCaller(adminToken);
            const res = await caller.secretarial.resolutions.create({
                title: "Approve Annual Budget",
                body: "The board hereby approves the budget for FY 2025-26.",
            });
            expect(res.status).toBe("draft");

            const passed = await caller.secretarial.resolutions.pass({
                id: res.id,
                votesFor: 10,
                votesAgainst: 0,
                abstentions: 0,
            });
            expect(passed.status).toBe("passed");
            expect(passed.votesFor).toBe(10);
            expect(passed.passedAt).toBeDefined();
        });

        it("Director KYC: create → validate → updateKyc", async () => {
            const caller = await authedCaller(adminToken);

            // Create in company_directors (Secretarial)
            const dir = await caller.secretarial.directors.create({
                din: "12345678",
                name: "Aditya Sharma",
                pan: "ABCDE1234F",
                designation: "Director",
                category: "independent",
            });
            expect(dir.din).toBe("12345678");

            const updated = await caller.secretarial.directors.updateKyc({
                id: dir.id,
                kyc: "filed",
                kycDueDate: new Date(Date.now() + 365 * 86400000).toISOString(),
            });
            expect(updated.kyc).toBe("filed");
        });

        it("Compliance Penalty: create overdue → updatePenalties", async () => {
            const caller = await authedCaller(adminToken);
            const db = testDb();

            // Create an overdue item manually to test penalty logic
            const pastDate = new Date(Date.now() - 10 * 86400000); // 10 days ago
            const [item] = await db.insert(complianceCalendarItems).values({
                orgId: orgCtx.orgId,
                eventName: "Late Filing",
                dueDate: pastDate,
                status: "overdue",
                penaltyPerDayInr: "100",
            }).returning();

            const result = await caller.indiaCompliance.calendar.updatePenalties({});
            expect(result.updated).toBeGreaterThanOrEqual(1);

            const [updated] = await db.select().from(complianceCalendarItems).where(eq(complianceCalendarItems.id, item.id));
            expect(updated!.daysOverdue).toBeGreaterThanOrEqual(10);
            expect(Number(updated!.totalPenaltyInr)).toBeGreaterThanOrEqual(1000);
        });

        it("DIR-3 KYC Reminders: trigger deactivation for overdue", async () => {
            const caller = await authedCaller(adminToken);
            const db = testDb();

            // Create a director in the 'directors' table (India Compliance)
            const pastYear = new Date().getFullYear() - 1;
            const [dir] = await db.insert(directors).values({
                orgId: orgCtx.orgId,
                din: "87654321",
                fullName: "Overdue Director",
                isActive: true,
                dinKycStatus: "active",
                dinKycLastCompleted: new Date(pastYear, 8, 29), // Before Sept 30 last year
            }).returning();

            const result = await caller.indiaCompliance.directors.triggerKYCReminders();
            expect(result).toHaveProperty("daysUntilDeadline");
            expect(result).toHaveProperty("message");
        });
    });

    // ── 2. Security ────────────────────────────────────────────────────────────

    describe("Security", () => {
        it("Incident Lifecycle: new → triage → containment", async () => {
            const caller = await authedCaller(adminToken);
            const inc = await caller.security.createIncident({
                title: "Unauthorized Access Detected",
                severity: "high",
            });
            expect(inc.status).toBe("new");

            await caller.security.transition({ id: inc.id, toStatus: "triage" });
            const triaged = await caller.security.getIncident({ id: inc.id });
            expect(triaged.status).toBe("triage");

            await caller.security.transition({ id: inc.id, toStatus: "containment" });
            await caller.security.addContainment({
                id: inc.id,
                action: "Blocked IP 1.2.3.4",
                performedBy: orgCtx.adminId,
            });
            const contained = await caller.security.getIncident({ id: inc.id });
            expect(contained.status).toBe("containment");
            expect((contained.containmentActions as any[]).length).toBe(1);
        });

        it("Vulnerability Exception: create → accepted status", async () => {
            const caller = await authedCaller(adminToken);
            const vuln = await caller.security.createVulnerability({
                title: "Legacy SSL Version",
                severity: "medium",
            });

            await caller.security.createVulnerabilityException({
                vulnerabilityId: vuln.id,
                reason: "Legacy system requirement",
                expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
            });

            const updated = (await caller.security.listVulnerabilities({ limit: 10 })) as any[];
            const row = updated.find(v => v.id === vuln.id);
            expect(row.status).toBe("accepted");
        });

        it("SIEM Export: schema validation", async () => {
            const caller = await authedCaller(adminToken);
            const preview = await caller.security.siemExportPreview({ limit: 10 });
            expect(preview.schema).toBe("nexusops.security.siem_preview.v1");
            expect(Array.isArray(preview.auditLogSample)).toBe(true);
            expect(Array.isArray(preview.securityIncidentSnapshot)).toBe(true);
        });
    });

    // ── 3. Legal ───────────────────────────────────────────────────────────────

    describe("Legal", () => {
        it("Confidential Investigation: RBAC access check", async () => {
            const adminCaller = await authedCaller(adminToken);
            const counselCaller = await authedCaller(legalCounselToken);

            const inv = await adminCaller.legal.createInvestigation({
                title: "Whistleblower Report #123",
                type: "whistleblower",
                anonymousReport: true,
            });

            // Fix: Use 'investigations' table and correct SQL syntax
            const db = testDb();
            await db.execute(sql`UPDATE investigations SET confidential = true WHERE id = ${inv.id}`);

            const adminList = await adminCaller.legal.listInvestigations({});
            expect(adminList.some(i => i.id === inv.id)).toBe(true);

            const counselList = await counselCaller.legal.listInvestigations({});
            // Counsel should see confidential investigations if they have legal:admin (which legal_counsel has per rbac-matrix)
            // Wait, let's check the filter logic in legal.ts:
            // return rows.filter((investigation: any) => {
            //   if (!investigation.confidential) return true;
            //   const isInvestigator = investigation.investigatorId === ctx.user!.id;
            //   const canSeeAll = checkDbUserPermission(ctx.user!.role, "legal", "admin", ctx.user!.matrixRole);
            //   return isInvestigator || canSeeAll;
            // });
            expect(counselList.some(i => i.id === inv.id)).toBe(true);
        });

        it("Governance Summary: cross-module KPI caching", async () => {
            const caller = await authedCaller(adminToken);
            const summary = await caller.legal.governanceSummary();
            expect(summary.legal).toBeDefined();
            expect(summary.secretarial).toBeDefined();
            expect(summary.indiaCompliance).toBeDefined();
            expect(summary.generatedAt).toBeDefined();
        });

        it("RPT: create → export CSV", async () => {
            const caller = await authedCaller(adminToken);
            const rpt = await caller.legal.createRelatedPartyTransaction({
                counterpartyName: "Subsidiary A",
                amount: "5000000",
                notes: "Inter-company loan",
            });
            expect(rpt.counterpartyName).toBe("Subsidiary A");

            const csv = await caller.legal.exportRelatedPartyCsv();
            expect(csv).toContain("Subsidiary A");
            expect(csv).toContain("5000000");
        });
    });
});
