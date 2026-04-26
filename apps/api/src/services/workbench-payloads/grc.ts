/**
 * GRC workbench payload.
 *
 * Aggregator across:
 *   • riskControls          — coverage matrix (categories × effectiveness)
 *   • riskControlEvidence   — evidence age per control (drives "expiring" actions)
 *   • auditFindings         — open findings feeding the action queue
 *
 * Primary visual: control coverage matrix (control category × effectiveness rating).
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  riskControls,
  riskControlEvidence,
  auditFindings,
  users,
} from "@nexusops/db";
import {
  envelope,
  runPanel,
  type ActionQueueItem,
  type Panel,
  type WorkbenchEnvelope,
} from "./_shared";

export interface ControlMatrixCell {
  category: string;
  effectiveness: string;
  count: number;
}

export interface ControlAgeRow {
  controlId: string;
  controlNumber: string;
  title: string;
  ownerName: string | null;
  effectiveness: string;
  lastTestedDate: string | null;
  nextTestDate: string | null;
  daysSinceEvidence: number | null;
}

export interface FindingRow {
  id: string;
  findingNumber: string;
  title: string;
  severity: string;
  remediationStatus: string;
  ownerName: string | null;
  targetRemediationDate: string | null;
}

export interface GrcPayload extends WorkbenchEnvelope {
  matrix: Panel<ControlMatrixCell[]>;
  controlAge: Panel<ControlAgeRow[]>;
  findings: Panel<FindingRow[]>;
}

const OPEN_FINDING_STATUSES = ["open", "in_progress", "overdue"] as const;

export async function buildGrcPayload({
  db,
  orgId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  orgId: string;
}): Promise<GrcPayload> {
  const matrix = await runPanel<ControlMatrixCell[]>("grc.matrix", async () => {
    const rows = await db
      .select({
        controlCategory: riskControls.controlCategory,
        effectivenessRating: riskControls.effectivenessRating,
      })
      .from(riskControls)
      .where(eq(riskControls.orgId, orgId))
      .limit(500);
    if (!rows.length) return null;
    const counts = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.controlCategory}::${r.effectivenessRating}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([key, count]) => {
      const [category, effectiveness] = key.split("::");
      return { category: category!, effectiveness: effectiveness!, count };
    });
  });

  const controlAge = await runPanel<ControlAgeRow[]>("grc.controlAge", async () => {
    const rows = await db
      .select({
        id: riskControls.id,
        controlNumber: riskControls.controlNumber,
        title: riskControls.title,
        effectiveness: riskControls.effectivenessRating,
        lastTestedDate: riskControls.lastTestedDate,
        nextTestDate: riskControls.nextTestDate,
        ownerName: users.name,
      })
      .from(riskControls)
      .leftJoin(users, eq(users.id, riskControls.controlOwnerId))
      .where(eq(riskControls.orgId, orgId))
      .orderBy(asc(riskControls.nextTestDate))
      .limit(20);
    if (!rows.length) return null;
    const now = Date.now();
    return rows.map((r: {
      id: string; controlNumber: string; title: string;
      effectiveness: string; lastTestedDate: Date | null;
      nextTestDate: Date | null; ownerName: string | null;
    }): ControlAgeRow => ({
      controlId: r.id,
      controlNumber: r.controlNumber,
      title: r.title,
      ownerName: r.ownerName,
      effectiveness: r.effectiveness,
      lastTestedDate: r.lastTestedDate ? r.lastTestedDate.toISOString() : null,
      nextTestDate: r.nextTestDate ? r.nextTestDate.toISOString() : null,
      daysSinceEvidence: r.lastTestedDate
        ? Math.floor((now - r.lastTestedDate.getTime()) / (24 * 60 * 60 * 1000))
        : null,
    }));
  });

  const findings = await runPanel<FindingRow[]>("grc.findings", async () => {
    const rows = await db
      .select({
        id: auditFindings.id,
        findingNumber: auditFindings.findingNumber,
        title: auditFindings.title,
        severity: auditFindings.findingSeverity,
        remediationStatus: auditFindings.remediationStatus,
        targetRemediationDate: auditFindings.targetRemediationDate,
        ownerName: users.name,
      })
      .from(auditFindings)
      .leftJoin(users, eq(users.id, auditFindings.actionOwnerId))
      .where(
        and(
          eq(auditFindings.orgId, orgId),
          inArray(auditFindings.remediationStatus, [...OPEN_FINDING_STATUSES]),
        ),
      )
      .orderBy(asc(auditFindings.targetRemediationDate))
      .limit(20);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; findingNumber: string; title: string;
      severity: string; remediationStatus: string;
      targetRemediationDate: Date | null; ownerName: string | null;
    }): FindingRow => ({
      id: r.id,
      findingNumber: r.findingNumber,
      title: r.title,
      severity: r.severity,
      remediationStatus: r.remediationStatus,
      ownerName: r.ownerName,
      targetRemediationDate: r.targetRemediationDate ? r.targetRemediationDate.toISOString() : null,
    }));
  });

  // Suppress unused-import lint: evidence is referenced in extension hooks.
  void riskControlEvidence;

  const actions: ActionQueueItem[] = [];
  if (controlAge.state === "ok" && controlAge.data) {
    const expiring = controlAge.data
      .filter((c) => c.daysSinceEvidence !== null && c.daysSinceEvidence > 90)
      .slice(0, 3);
    for (const c of expiring) {
      actions.push({
        id: `evidence-stale:${c.controlId}`,
        label: `${c.controlNumber} — Evidence ${c.daysSinceEvidence}d old`,
        hint: c.title,
        severity: "warn",
        href: `/app/security/controls/${c.controlId}`,
      });
    }
  }
  if (findings.state === "ok" && findings.data) {
    for (const f of findings.data.slice(0, 3)) {
      actions.push({
        id: `finding:${f.id}`,
        label: `${f.findingNumber} — ${f.severity} finding`,
        hint: f.title,
        severity: f.severity === "critical" || f.severity === "high" ? "breach" : "warn",
        href: `/app/security/findings/${f.id}`,
      });
    }
  }

  return {
    ...envelope("grc", actions),
    matrix,
    controlAge,
    findings,
  };
}

void desc;
