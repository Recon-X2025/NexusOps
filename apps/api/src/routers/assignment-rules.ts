import { z } from "zod";
import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import type { InferSelectModel } from "drizzle-orm";
import {
  assignmentRules,
  teams,
  teamMembers,
  users,
  eq,
  and,
  asc,
  inArray,
  count,
} from "@coheronconnect/db";

type AssignmentRuleRow = InferSelectModel<typeof assignmentRules>;

const ENTITY_TYPES = ["ticket", "work_order", "hr_case"] as const;
const ALGORITHMS = ["load_based", "round_robin"] as const;

export const assignmentRulesRouter = router({
  list: permissionProcedure("admin", "read")
    .input(
      z.object({
        entityType: z.enum(ENTITY_TYPES).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const conditions = [eq(assignmentRules.orgId, org!.id)];
      if (input.entityType) {
        conditions.push(eq(assignmentRules.entityType, input.entityType));
      }

      const rules = await db
        .select()
        .from(assignmentRules)
        .where(and(...conditions))
        .orderBy(asc(assignmentRules.entityType), asc(assignmentRules.sortOrder));

      if (rules.length === 0) return [];

      // Enrich with team name
      const teamIds: string[] = Array.from(
        new Set(rules.map((r: AssignmentRuleRow) => String(r.teamId))),
      );
      const teamRows = await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, teamIds));

      const teamMap = new Map(teamRows.map((t: (typeof teamRows)[number]) => [t.id, t.name]));

      return rules.map((r: AssignmentRuleRow) => ({
        ...r,
        teamName: teamMap.get(r.teamId) ?? r.teamId,
      }));
    }),

  create: permissionProcedure("admin", "write")
    .input(
      z.object({
        entityType: z.enum(ENTITY_TYPES),
        matchValue: z.string().nullable().optional(),
        teamId: z.string().uuid(),
        algorithm: z.enum(ALGORITHMS).default("load_based"),
        capacityThreshold: z.number().int().min(1).max(500).default(20),
        isActive: z.boolean().default(true),
        sortOrder: z.number().int().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      // Validate team belongs to org
      const [team] = await db
        .select()
        .from(teams)
        .where(and(eq(teams.id, input.teamId), eq(teams.orgId, org!.id)));

      if (!team) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      }

      const [rule] = await db
        .insert(assignmentRules)
        .values({
          orgId: org!.id,
          entityType: input.entityType,
          matchValue: input.matchValue ?? null,
          teamId: input.teamId,
          algorithm: input.algorithm,
          capacityThreshold: input.capacityThreshold,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
        })
        .returning();

      return rule;
    }),

  update: permissionProcedure("admin", "write")
    .input(
      z.object({
        id: z.string().uuid(),
        teamId: z.string().uuid().optional(),
        algorithm: z.enum(ALGORITHMS).optional(),
        capacityThreshold: z.number().int().min(1).max(500).optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
        matchValue: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const { id, ...updates } = input;

      const [existing] = await db
        .select()
        .from(assignmentRules)
        .where(and(eq(assignmentRules.id, id), eq(assignmentRules.orgId, org!.id)));

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assignment rule not found" });
      }

      if (updates.teamId) {
        const [team] = await db
          .select()
          .from(teams)
          .where(and(eq(teams.id, updates.teamId), eq(teams.orgId, org!.id)));
        if (!team) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
        }
      }

      const [updated] = await db
        .update(assignmentRules)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(assignmentRules.id, id), eq(assignmentRules.orgId, org!.id)))
        .returning();

      return updated;
    }),

  delete: permissionProcedure("admin", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [deleted] = await db
        .delete(assignmentRules)
        .where(and(eq(assignmentRules.id, input.id), eq(assignmentRules.orgId, org!.id)))
        .returning({ id: assignmentRules.id });

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assignment rule not found" });
      }

      return { success: true };
    }),

  // Returns teams with their member count — used by the admin UI dropdown
  teamsWithMembers: permissionProcedure("admin", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;

    const teamRows = await db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.orgId, org!.id))
      .orderBy(asc(teams.name));

    if (teamRows.length === 0) return [];

    const memberCounts = await db
      .select({
        teamId: teamMembers.teamId,
        cnt: count(),
      })
      .from(teamMembers)
      .where(inArray(teamMembers.teamId, teamRows.map((t: (typeof teamRows)[number]) => t.id)))
      .groupBy(teamMembers.teamId);

    const countMap = new Map(memberCounts.map((m: (typeof memberCounts)[number]) => [m.teamId, Number(m.cnt)]));

    return teamRows.map((t: (typeof teamRows)[number]) => ({
      ...t,
      memberCount: countMap.get(t.id) ?? 0,
    }));
  }),

  // Fetch team members (shown in preview panel)
  teamMembers: permissionProcedure("admin", "read")
    .input(z.object({ teamId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const rows = await db
        .select({ userId: teamMembers.userId, name: users.name, email: users.email })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, input.teamId));

      return rows;
    }),
});
