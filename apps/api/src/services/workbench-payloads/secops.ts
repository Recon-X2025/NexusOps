/**
 * SecOps workbench payload.
 *
 * Aggregator across:
 *   • securityIncidents          — chronological alert/incident stream
 *   • vulnerabilities            — top open vulnerabilities feeding the action queue
 *   • derived MITRE chip rollup  — counts by MITRE technique across recent incidents
 *
 * Primary visual: alert triage stream (severity bars + MITRE tactic chips).
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { securityIncidents, vulnerabilities, users } from "@nexusops/db";
import {
  envelope,
  runPanel,
  type ActionQueueItem,
  type Panel,
  type WorkbenchEnvelope,
} from "./_shared";

export interface AlertStreamRow {
  id: string;
  number: string;
  title: string;
  severity: string;
  status: string;
  assigneeName: string | null;
  mitreTechniques: string[];
  attackVector: string | null;
  createdAt: string;
}

export interface VulnRow {
  id: string;
  cveId: string | null;
  title: string;
  severity: string;
  status: string;
  cvssScore: string | null;
  remediationDueAt: string | null;
}

export interface SecOpsPayload extends WorkbenchEnvelope {
  alerts: Panel<AlertStreamRow[]>;
  vulnerabilities: Panel<VulnRow[]>;
  /** Chip rollup: { technique → count } sorted desc. */
  mitreRollup: Panel<{ technique: string; count: number }[]>;
}

const ACTIVE_INCIDENT_STATUSES = [
  "new",
  "triage",
  "containment",
  "eradication",
  "recovery",
] as const;

export async function buildSecOpsPayload({
  db,
  orgId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  orgId: string;
}): Promise<SecOpsPayload> {
  const alerts = await runPanel<AlertStreamRow[]>("secops.alerts", async () => {
    const rows = await db
      .select({
        id: securityIncidents.id,
        number: securityIncidents.number,
        title: securityIncidents.title,
        severity: securityIncidents.severity,
        status: securityIncidents.status,
        assigneeName: users.name,
        mitreTechniques: securityIncidents.mitreTechniques,
        attackVector: securityIncidents.attackVector,
        createdAt: securityIncidents.createdAt,
      })
      .from(securityIncidents)
      .leftJoin(users, eq(users.id, securityIncidents.assigneeId))
      .where(
        and(
          eq(securityIncidents.orgId, orgId),
          inArray(securityIncidents.status, [...ACTIVE_INCIDENT_STATUSES]),
        ),
      )
      .orderBy(desc(securityIncidents.createdAt))
      .limit(40);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; number: string; title: string;
      severity: string; status: string;
      assigneeName: string | null;
      mitreTechniques: string[] | null;
      attackVector: string | null;
      createdAt: Date;
    }): AlertStreamRow => ({
      id: r.id,
      number: r.number,
      title: r.title,
      severity: r.severity,
      status: r.status,
      assigneeName: r.assigneeName,
      mitreTechniques: Array.isArray(r.mitreTechniques) ? r.mitreTechniques : [],
      attackVector: r.attackVector,
      createdAt: r.createdAt.toISOString(),
    }));
  });

  const vulns = await runPanel<VulnRow[]>("secops.vulnerabilities", async () => {
    const rows = await db
      .select({
        id: vulnerabilities.id,
        cveId: vulnerabilities.cveId,
        title: vulnerabilities.title,
        severity: vulnerabilities.severity,
        status: vulnerabilities.status,
        cvssScore: vulnerabilities.cvssScore,
        remediationDueAt: vulnerabilities.remediationDueAt,
      })
      .from(vulnerabilities)
      .where(
        and(
          eq(vulnerabilities.orgId, orgId),
          inArray(vulnerabilities.status, ["open", "in_progress"]),
        ),
      )
      .orderBy(desc(vulnerabilities.cvssScore))
      .limit(15);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; cveId: string | null; title: string;
      severity: string; status: string; cvssScore: string | null;
      remediationDueAt: Date | null;
    }): VulnRow => ({
      id: r.id,
      cveId: r.cveId,
      title: r.title,
      severity: r.severity,
      status: r.status,
      cvssScore: r.cvssScore,
      remediationDueAt: r.remediationDueAt ? r.remediationDueAt.toISOString() : null,
    }));
  });

  const mitreRollup = await runPanel<{ technique: string; count: number }[]>("secops.mitreRollup", async () => {
    if (alerts.state !== "ok" || !alerts.data) return null;
    const counts = new Map<string, number>();
    for (const a of alerts.data) {
      for (const t of a.mitreTechniques) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    if (!counts.size) return null;
    return Array.from(counts.entries())
      .map(([technique, count]) => ({ technique, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  });

  const actions: ActionQueueItem[] = [];
  if (alerts.state === "ok" && alerts.data) {
    const unassigned = alerts.data.filter((a) => !a.assigneeName).slice(0, 3);
    for (const a of unassigned) {
      actions.push({
        id: `incident-unassigned:${a.id}`,
        label: `${a.number} — Unassigned`,
        hint: a.title,
        severity:
          a.severity === "critical" || a.severity === "high" ? "breach" : "warn",
        href: `/app/security/incidents/${a.id}`,
      });
    }
  }
  if (vulns.state === "ok" && vulns.data) {
    const overdue = vulns.data.filter((v) => v.remediationDueAt && v.remediationDueAt < new Date().toISOString()).slice(0, 2);
    for (const v of overdue) {
      actions.push({
        id: `vuln-overdue:${v.id}`,
        label: `${v.cveId ?? v.title} — Remediation overdue`,
        hint: v.title,
        severity: "warn",
        href: `/app/security/vulnerabilities/${v.id}`,
      });
    }
  }

  return {
    ...envelope("secops", actions),
    alerts,
    vulnerabilities: vulns,
    mitreRollup,
  };
}
