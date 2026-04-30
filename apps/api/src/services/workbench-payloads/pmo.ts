/**
 * PMO workbench payload.
 *
 * Aggregator across:
 *   • projects             — portfolio matrix (impact × confidence proxy via budget × health)
 *   • projectMilestones    — milestones at risk (overdue / nearing due)
 *   • projectDependencies  — blocked / blocking edges in the dependency graph
 *
 * Primary visual: 2×2 portfolio matrix (impact × confidence) with health pills.
 */

import { and, asc, eq, inArray, lte } from "drizzle-orm";
import {
  projects,
  projectMilestones,
  projectDependencies,
  users,
} from "@coheronconnect/db";
import {
  envelope,
  runPanel,
  type ActionQueueItem,
  type Panel,
  type WorkbenchEnvelope,
} from "./_shared";

export interface PortfolioPoint {
  id: string;
  number: string;
  name: string;
  health: string;
  status: string;
  budgetTotal: string | null;
  budgetSpent: string | null;
  ownerName: string | null;
  /** 0–1 impact dimension derived from budget. */
  impact: number;
  /** 0–1 confidence dimension derived from health. */
  confidence: number;
}

export interface MilestoneRisk {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  dueDate: string | null;
  status: string;
  daysOverdue: number;
}

export interface DependencyRow {
  id: string;
  fromProjectName: string;
  toProjectName: string;
  dependencyType: string;
}

export interface PmoPayload extends WorkbenchEnvelope {
  portfolio: Panel<PortfolioPoint[]>;
  milestoneRisks: Panel<MilestoneRisk[]>;
  dependencies: Panel<DependencyRow[]>;
}

const ACTIVE_PROJECT_STATUSES = [
  "planning",
  "active",
  "on_hold",
] as const;

function healthToConfidence(health: string): number {
  if (health === "green") return 0.85;
  if (health === "amber") return 0.55;
  if (health === "red") return 0.25;
  return 0.5;
}

export async function buildPmoPayload({
  db,
  orgId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  orgId: string;
}): Promise<PmoPayload> {
  const portfolio = await runPanel<PortfolioPoint[]>("pmo.portfolio", async () => {
    const rows = await db
      .select({
        id: projects.id,
        number: projects.number,
        name: projects.name,
        health: projects.health,
        status: projects.status,
        budgetTotal: projects.budgetTotal,
        budgetSpent: projects.budgetSpent,
        ownerName: users.name,
      })
      .from(projects)
      .leftJoin(users, eq(users.id, projects.ownerId))
      .where(
        and(
          eq(projects.orgId, orgId),
          inArray(projects.status, [...ACTIVE_PROJECT_STATUSES]),
        ),
      )
      .orderBy(asc(projects.name))
      .limit(40);
    if (!rows.length) return null;
    const maxBudget = rows.reduce((m: number, r: { budgetTotal: string | null }) => {
      const b = Number(r.budgetTotal ?? "0");
      return b > m ? b : m;
    }, 1);
    return rows.map((r: {
      id: string; number: string; name: string; health: string; status: string;
      budgetTotal: string | null; budgetSpent: string | null; ownerName: string | null;
    }): PortfolioPoint => {
      const budget = Number(r.budgetTotal ?? "0");
      return {
        id: r.id,
        number: r.number,
        name: r.name,
        health: r.health,
        status: r.status,
        budgetTotal: r.budgetTotal,
        budgetSpent: r.budgetSpent,
        ownerName: r.ownerName,
        impact: maxBudget > 0 ? budget / maxBudget : 0.5,
        confidence: healthToConfidence(r.health),
      };
    });
  });

  const now = new Date();
  const in14d = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const milestoneRisks = await runPanel<MilestoneRisk[]>("pmo.milestoneRisks", async () => {
    const rows = await db
      .select({
        id: projectMilestones.id,
        projectId: projectMilestones.projectId,
        title: projectMilestones.title,
        dueDate: projectMilestones.dueDate,
        status: projectMilestones.status,
        projectName: projects.name,
      })
      .from(projectMilestones)
      .innerJoin(projects, eq(projects.id, projectMilestones.projectId))
      .where(
        and(
          eq(projects.orgId, orgId),
          inArray(projectMilestones.status, ["upcoming", "in_progress"]),
          lte(projectMilestones.dueDate, in14d),
        ),
      )
      .orderBy(asc(projectMilestones.dueDate))
      .limit(20);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; projectId: string; projectName: string;
      title: string; dueDate: Date | null; status: string;
    }): MilestoneRisk => ({
      id: r.id,
      projectId: r.projectId,
      projectName: r.projectName,
      title: r.title,
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      status: r.status,
      daysOverdue: r.dueDate
        ? Math.max(0, Math.floor((now.getTime() - r.dueDate.getTime()) / (24 * 60 * 60 * 1000)))
        : 0,
    }));
  });

  const dependencies = await runPanel<DependencyRow[]>("pmo.dependencies", async () => {
    const fromProjects = { ...projects } as typeof projects;
    const toProjects = { ...projects } as typeof projects;
    void fromProjects; void toProjects;
    const rows = await db
      .select({
        id: projectDependencies.id,
        dependencyType: projectDependencies.dependencyType,
        fromProjectId: projectDependencies.fromProjectId,
        toProjectId: projectDependencies.toProjectId,
      })
      .from(projectDependencies)
      .where(eq(projectDependencies.orgId, orgId))
      .limit(40);
    if (!rows.length) return null;
    const ids = Array.from(new Set(rows.flatMap((r: { fromProjectId: string; toProjectId: string }) => [r.fromProjectId, r.toProjectId])));
    const projRows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.orgId, orgId), inArray(projects.id, ids as string[])));
    const nameById = new Map<string, string>(projRows.map((p: { id: string; name: string }) => [p.id, p.name]));
    return rows.map((r: {
      id: string; dependencyType: string; fromProjectId: string; toProjectId: string;
    }): DependencyRow => ({
      id: r.id,
      fromProjectName: nameById.get(r.fromProjectId) ?? r.fromProjectId,
      toProjectName: nameById.get(r.toProjectId) ?? r.toProjectId,
      dependencyType: r.dependencyType,
    }));
  });

  const actions: ActionQueueItem[] = [];
  if (milestoneRisks.state === "ok" && milestoneRisks.data) {
    const overdue = milestoneRisks.data.filter((m) => m.daysOverdue > 0).slice(0, 3);
    for (const m of overdue) {
      actions.push({
        id: `milestone:${m.id}`,
        label: `${m.projectName} — Milestone overdue ${m.daysOverdue}d`,
        hint: m.title,
        severity: m.daysOverdue > 7 ? "breach" : "warn",
        href: `/app/projects/${m.projectId}`,
      });
    }
  }
  if (portfolio.state === "ok" && portfolio.data) {
    const red = portfolio.data.filter((p) => p.health === "red").slice(0, 2);
    for (const p of red) {
      actions.push({
        id: `red-status:${p.id}`,
        label: `${p.number} — Status report overdue`,
        hint: p.name,
        severity: "breach",
        href: `/app/projects/${p.id}`,
      });
    }
  }

  return {
    ...envelope("pmo", actions),
    portfolio,
    milestoneRisks,
    dependencies,
  };
}
