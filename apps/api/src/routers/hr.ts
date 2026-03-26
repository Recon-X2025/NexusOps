import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  employees,
  hrCases,
  hrCaseTasks,
  leaveRequests,
  leaveBalances,
  onboardingTemplates,
  users,
  eq,
  and,
  desc,
  count,
  sql,
} from "@nexusops/db";
import { CreateLeaveRequestSchema } from "@nexusops/types";

export const hrRouter = router({
  employees: router({
    list: permissionProcedure("hr", "read")
      .input(
        z.object({
          department: z.string().optional(),
          status: z.string().optional(),
          search: z.string().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(employees.orgId, org!.id)];
        if (input.status) conditions.push(eq(employees.status, input.status as any));
        if (input.department) conditions.push(eq(employees.department, input.department));

        return db.select().from(employees).where(and(...conditions));
      }),

    get: permissionProcedure("hr", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [employee] = await db
          .select()
          .from(employees)
          .where(and(eq(employees.id, input.id), eq(employees.orgId, org!.id)));

        if (!employee) throw new TRPCError({ code: "NOT_FOUND" });

        const reportees = await db
          .select()
          .from(employees)
          .where(and(eq(employees.managerId, input.id), eq(employees.orgId, org!.id)));

        return { employee, reportees };
      }),

    create: permissionProcedure("hr", "write")
      .input(
        z.object({
          userId: z.string().uuid(),
          department: z.string().optional(),
          title: z.string().optional(),
          managerId: z.string().uuid().optional(),
          employmentType: z.enum(["full_time", "part_time", "contractor", "intern"]).default("full_time"),
          location: z.string().optional(),
          startDate: z.coerce.date().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        const [countResult] = await db
          .select({ count: count() })
          .from(employees)
          .where(eq(employees.orgId, org!.id));

        const seq = (countResult?.count ?? 0) + 1;
        const employeeId = `EMP-${String(seq).padStart(4, "0")}`;

        const [employee] = await db
          .insert(employees)
          .values({
            orgId: org!.id,
            userId: input.userId,
            employeeId,
            department: input.department,
            title: input.title,
            managerId: input.managerId,
            employmentType: input.employmentType,
            location: input.location,
            startDate: input.startDate,
            status: "active",
          })
          .returning();

        return employee;
      }),
  }),

  cases: router({
    list: permissionProcedure("hr", "read")
      .input(z.object({ caseType: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        // Join through employees to filter by org
        return db
          .select({ hrCase: hrCases, employee: employees })
          .from(hrCases)
          .innerJoin(employees, eq(hrCases.employeeId, employees.id))
          .where(eq(employees.orgId, org!.id))
          .orderBy(desc(hrCases.createdAt));
      }),

    create: permissionProcedure("hr", "write")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          caseType: z.enum(["onboarding", "offboarding", "leave", "policy", "benefits", "workplace", "equipment"]),
          notes: z.string().optional(),
          assigneeId: z.string().uuid().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db } = ctx;

        const [hrCase] = await db.insert(hrCases).values({ orgId: ctx.org!.id, ...input }).returning();
        return hrCase;
      }),

    triggerOnboarding: permissionProcedure("onboarding", "write")
      .input(z.object({ employeeId: z.string().uuid(), templateId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        const [template] = await db
          .select()
          .from(onboardingTemplates)
          .where(and(eq(onboardingTemplates.id, input.templateId), eq(onboardingTemplates.orgId, org!.id)));

        if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

        const [hrCase] = await db
          .insert(hrCases)
          .values({
            orgId: org!.id,
            caseType: "onboarding",
            employeeId: input.employeeId,
            priority: "high",
          })
          .returning();

        const now = new Date();
        const tasks = (template.tasks ?? []).map((task: { title: string; assigneeRole: string; dueDateOffsetDays: number }, i: number) => ({
          caseId: hrCase!.id,
          title: task.title,
          dueDate: new Date(now.getTime() + task.dueDateOffsetDays * 24 * 60 * 60 * 1000),
          sortOrder: i,
          status: "pending",
        }));

        if (tasks.length > 0) {
          await db.insert(hrCaseTasks).values(tasks);
        }

        return hrCase;
      }),
  }),

  leave: router({
    list: permissionProcedure("hr", "read")
      .input(
        z.object({
          employeeId: z.string().uuid().optional(),
          status: z.string().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(leaveRequests.orgId, org!.id)];
        if (input.employeeId) conditions.push(eq(leaveRequests.employeeId, input.employeeId));
        if (input.status) conditions.push(eq(leaveRequests.status, input.status as any));

        return db.select().from(leaveRequests).where(and(...conditions)).orderBy(desc(leaveRequests.createdAt));
      }),

    create: permissionProcedure("hr", "write")
      .input(CreateLeaveRequestSchema)
      .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [employee] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.userId, ctx.user!.id), eq(employees.orgId, org!.id)));

      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found" });

      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const [request] = await db
        .insert(leaveRequests)
        .values({
          orgId: org!.id,
          employeeId: employee.id,
          type: input.type,
          startDate,
          endDate,
          days: String(days),
          reason: input.reason,
          status: "pending",
        })
        .returning();

      // Update pending balance
      await db
        .insert(leaveBalances)
        .values({
          employeeId: employee.id,
          type: input.type,
          year: startDate.getFullYear(),
          totalDays: "0",
          usedDays: "0",
          pendingDays: String(days),
        })
        .onConflictDoUpdate({
          target: [leaveBalances.employeeId, leaveBalances.type, leaveBalances.year],
          set: {
            pendingDays: sql`${leaveBalances.pendingDays} + ${String(days)}`,
          },
        });

      return request;
    }),

    approve: permissionProcedure("hr", "approve")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;

        const [request] = await db
          .select()
          .from(leaveRequests)
          .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.orgId, org!.id)));

        if (!request) throw new TRPCError({ code: "NOT_FOUND" });
        if (request.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Leave request is not pending" });
        }

        const [updated] = await db
          .update(leaveRequests)
          .set({ status: "approved", approvedById: user!.id, approvedAt: new Date() })
          .where(eq(leaveRequests.id, input.id))
          .returning();

        // Update balance: move from pending to used
        await db
          .update(leaveBalances)
          .set({
            usedDays: sql`${leaveBalances.usedDays} + ${request.days}`,
            pendingDays: sql`GREATEST(0, ${leaveBalances.pendingDays} - ${request.days})`,
          })
          .where(
            and(
              eq(leaveBalances.employeeId, request.employeeId),
              eq(leaveBalances.type, request.type),
              eq(leaveBalances.year, request.startDate.getFullYear()),
            ),
          );

        return updated;
      }),

    reject: permissionProcedure("hr", "approve")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        const [request] = await db
          .select()
          .from(leaveRequests)
          .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.orgId, org!.id)));

        if (!request) throw new TRPCError({ code: "NOT_FOUND" });

        const [updated] = await db
          .update(leaveRequests)
          .set({ status: "rejected", updatedAt: new Date() })
          .where(eq(leaveRequests.id, input.id))
          .returning();

        // Clear pending balance
        await db
          .update(leaveBalances)
          .set({
            pendingDays: sql`GREATEST(0, ${leaveBalances.pendingDays} - ${request.days})`,
          })
          .where(
            and(
              eq(leaveBalances.employeeId, request.employeeId),
              eq(leaveBalances.type, request.type),
              eq(leaveBalances.year, request.startDate.getFullYear()),
            ),
          );

        return updated;
      }),
  }),

  onboardingTemplates: router({
    list: permissionProcedure("onboarding", "read").query(async ({ ctx }) => {
      return ctx.db
        .select()
        .from(onboardingTemplates)
        .where(eq(onboardingTemplates.orgId, ctx.org!.id));
    }),

    create: permissionProcedure("onboarding", "write")
      .input(
        z.object({
          name: z.string().min(1),
          department: z.string().optional(),
          tasks: z.array(
            z.object({
              title: z.string(),
              assigneeRole: z.string(),
              dueDateOffsetDays: z.coerce.number().int().nonnegative(),
              description: z.string().optional(),
            }),
          ),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [template] = await ctx.db
          .insert(onboardingTemplates)
          .values({ orgId: ctx.org!.id, ...input })
          .returning();
        return template;
      }),
  }),
});
