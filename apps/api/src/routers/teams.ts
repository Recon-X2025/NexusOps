import { router, adminProcedure } from "../lib/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  teams,
  teamMembers,
  users,
  eq,
  and,
  desc,
  sql,
  count,
} from "@coheronconnect/db";

export const teamsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const { db, org } = ctx;
    
    // Get teams with member counts
    const rows = await db
      .select({
        id: teams.id,
        name: teams.name,
        description: teams.description,
        isArchived: teams.isArchived,
        createdAt: teams.createdAt,
        memberCount: sql<number>`(SELECT count(*)::int FROM team_members WHERE team_id = ${teams.id})`,
      })
      .from(teams)
      .where(eq(teams.orgId, org!.id))
      .orderBy(desc(teams.createdAt));
      
    return rows;
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      
      const [newTeam] = await db
        .insert(teams)
        .values({
          orgId: org!.id,
          name: input.name,
          description: input.description,
        })
        .returning();
        
      return newTeam;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        isArchived: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...patch } = input;
      
      const [updatedTeam] = await db
        .update(teams)
        .set({ ...patch })
        .where(and(eq(teams.id, id), eq(teams.orgId, org!.id)))
        .returning();
        
      if (!updatedTeam) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      }
      
      return updatedTeam;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      
      const [deletedTeam] = await db
        .delete(teams)
        .where(and(eq(teams.id, input.id), eq(teams.orgId, org!.id)))
        .returning();
        
      if (!deletedTeam) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      }
      
      return { success: true };
    }),

  // ── Member Management ──────────────────────────────────────────────────
  
  listMembers: adminProcedure
    .input(z.object({ teamId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      
      const members = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, input.teamId))
        .orderBy(users.name);
        
      return members;
    }),

  addMember: adminProcedure
    .input(
      z.object({
        teamId: z.string().uuid(),
        userId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      
      await db
        .insert(teamMembers)
        .values({
          teamId: input.teamId,
          userId: input.userId,
        })
        .onConflictDoNothing();
        
      return { success: true };
    }),

  removeMember: adminProcedure
    .input(
      z.object({
        teamId: z.string().uuid(),
        userId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      
      await db
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, input.teamId),
            eq(teamMembers.userId, input.userId)
          )
        );
        
      return { success: true };
    }),
});
