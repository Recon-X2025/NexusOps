import { router, permissionProcedure, adminProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { resolveAssignment } from "../services/assignment";
import {
  employees,
  organizations,
  hrCases,
  hrCaseTasks,
  leaveRequests,
  leaveBalances,
  onboardingTemplates,
  users,
  eq,
  and,
  desc,
  asc,
  count,
  sql,
  isNull,
} from "@nexusops/db";
import { CreateLeaveRequestSchema } from "@nexusops/types";

export const hrRouter = router({
  /** Compact counts for platform home (US-HCM-004). */
  platformHomeStrip: permissionProcedure("hr", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const orgId = org!.id;
    const [{ caseCnt }] = await db
      .select({ caseCnt: count() })
      .from(hrCases)
      .where(eq(hrCases.orgId, orgId));
    const [{ totalEmp }] = await db
      .select({ totalEmp: count() })
      .from(employees)
      .where(eq(employees.orgId, orgId));
    const [{ onboardingCases }] = await db
      .select({ onboardingCases: count() })
      .from(hrCases)
      .where(and(eq(hrCases.orgId, orgId), eq(hrCases.caseType, "onboarding")));
    const [{ offboardingCases }] = await db
      .select({ offboardingCases: count() })
      .from(hrCases)
      .where(and(eq(hrCases.orgId, orgId), eq(hrCases.caseType, "offboarding")));
    return {
      hrCases: Number(caseCnt ?? 0),
      totalEmployees: Number(totalEmp ?? 0),
      onboardingCases: Number(onboardingCases ?? 0),
      offboardingCases: Number(offboardingCases ?? 0),
    };
  }),

  peopleWorkplace: router({
    updateIntegrationFlags: adminProcedure
      .input(z.object({
        facilitiesLive: z.boolean().optional(),
        walkupLive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db
          .select({ settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, org!.id));
        const raw = (row?.settings ?? {}) as Record<string, unknown>;
        const prev = (raw.peopleWorkplace as Record<string, unknown> | undefined) ?? {};
        const peopleWorkplace = { ...prev, ...input };
        await db
          .update(organizations)
          .set({ settings: { ...raw, peopleWorkplace } })
          .where(eq(organizations.id, org!.id));
        return {
          facilitiesLive: peopleWorkplace.facilitiesLive !== false,
          walkupLive: peopleWorkplace.walkupLive !== false,
        };
      }),
  }),

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

        const rows = await db
          .select({ emp: employees, userName: users.name, userEmail: users.email })
          .from(employees)
          .innerJoin(users, eq(employees.userId, users.id))
          .where(and(...conditions));

        return rows.map((row: (typeof rows)[number]) => {
          const { emp, userName, userEmail } = row;
          return {
            ...emp,
            name: userName,
            email: userEmail,
            employeeNumber: emp.employeeId,
            jobTitle: emp.title,
          };
        });
      }),

    /** Org users who do not yet have an employee row (for linking a new employee record). */
    listUsersWithoutEmployee: permissionProcedure("hr", "write")
      .query(async ({ ctx }) => {
        const { db, org } = ctx;
        return db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
          })
          .from(users)
          .leftJoin(employees, eq(users.id, employees.userId))
          .where(and(eq(users.orgId, org!.id), isNull(employees.id)))
          .orderBy(asc(users.name));
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
          managerId: z.string().uuid().nullable().optional(),
          employmentType: z.enum(["full_time", "part_time", "contractor", "intern"]).default("full_time"),
          location: z.string().optional(),
          startDate: z.coerce.date().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        const [existing] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.userId, input.userId), eq(employees.orgId, org!.id)))
          .limit(1);
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This user already has an employee record in your organization.",
          });
        }

        const [userInOrg] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, input.userId), eq(users.orgId, org!.id)))
          .limit(1);
        if (!userInOrg) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "User is not in this organization." });
        }

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

    update: permissionProcedure("hr", "write")
      .input(z.object({
        id: z.string().uuid(),
        department: z.string().optional(),
        title: z.string().optional(),
        managerId: z.string().uuid().nullable().optional(),
        location: z.string().optional(),
        employmentType: z.enum(["full_time", "part_time", "contractor", "intern"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...data } = input;
        const [emp] = await db.update(employees)
          .set({ ...data, updatedAt: new Date() } as any)
          .where(and(eq(employees.id, id), eq(employees.orgId, org!.id)))
          .returning();
        if (!emp) throw new TRPCError({ code: "NOT_FOUND" });
        return emp;
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

    get: permissionProcedure("hr", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db
          .select({ hrCase: hrCases, employee: employees })
          .from(hrCases)
          .innerJoin(employees, eq(hrCases.employeeId, employees.id))
          .where(and(eq(hrCases.id, input.id), eq(employees.orgId, org!.id)));

        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        const tasks = await db
          .select()
          .from(hrCaseTasks)
          .where(eq(hrCaseTasks.caseId, input.id))
          .orderBy(hrCaseTasks.sortOrder);

        return { ...row, tasks };
      }),

    completeTask: permissionProcedure("hr", "write")
      .input(z.object({ taskId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        // Verify the task belongs to a case in this org
        const [task] = await db
          .select({ t: hrCaseTasks, c: hrCases })
          .from(hrCaseTasks)
          .innerJoin(hrCases, eq(hrCaseTasks.caseId, hrCases.id))
          .where(and(eq(hrCaseTasks.id, input.taskId), eq(hrCases.orgId, org!.id)));

        if (!task) throw new TRPCError({ code: "NOT_FOUND" });

        const [updated] = await db
          .update(hrCaseTasks)
          .set({ status: "done", completedAt: new Date() })
          .where(eq(hrCaseTasks.id, input.taskId))
          .returning();
        return updated;
      }),

    addNote: permissionProcedure("hr", "write")
      .input(z.object({ caseId: z.string().uuid(), note: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [c] = await db
          .select({ id: hrCases.id })
          .from(hrCases)
          .where(and(eq(hrCases.id, input.caseId), eq(hrCases.orgId, org!.id)));
        if (!c) throw new TRPCError({ code: "NOT_FOUND" });

        const existing = await db.select({ notes: hrCases.notes }).from(hrCases).where(eq(hrCases.id, input.caseId));
        const prev = existing[0]?.notes ?? "";
        const timestamp = new Date().toISOString();
        const appended = prev
          ? `${prev}\n\n[${timestamp}] ${input.note}`
          : `[${timestamp}] ${input.note}`;

        const [updated] = await db
          .update(hrCases)
          .set({ notes: appended, updatedAt: new Date() })
          .where(eq(hrCases.id, input.caseId))
          .returning();
        return updated;
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

        // Auto-assign if no explicit assignee provided
        let resolvedAssigneeId = input.assigneeId;
        if (!resolvedAssigneeId) {
          const assignment = await resolveAssignment(db, ctx.org!.id, {
            entityType: "hr_case",
            matchValue: input.caseType,
          });
          if (assignment) {
            resolvedAssigneeId = assignment.assigneeId ?? undefined;
            if (assignment.parkedAtCapacity) {
              console.info("[assignment] HR case parked at capacity — team queue:", assignment.teamId);
            }
          }
        }

        const [hrCase] = await db
          .insert(hrCases)
          .values({ orgId: ctx.org!.id, ...input, assigneeId: resolvedAssigneeId })
          .returning();
        return hrCase;
      }),

    resolve: permissionProcedure("hr", "write")
      .input(z.object({ id: z.string().uuid(), resolution: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [existing] = await db.select({ notes: hrCases.notes }).from(hrCases)
          .where(and(eq(hrCases.id, input.id), eq(hrCases.orgId, org!.id)));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        const prev = existing.notes ?? "";
        const ts = new Date().toISOString();
        const resolveNote = input.resolution
          ? `${prev ? prev + "\n\n" : ""}[RESOLVED: ${ts}] ${input.resolution}`
          : `${prev ? prev + "\n\n" : ""}[RESOLVED: ${ts}]`;
        const [updated] = await db.update(hrCases)
          .set({ notes: resolveNote, updatedAt: new Date() })
          .where(and(eq(hrCases.id, input.id), eq(hrCases.orgId, org!.id)))
          .returning();
        return updated;
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

    balance: permissionProcedure("hr", "read")
      .input(z.object({ employeeId: z.string().uuid().optional(), year: z.coerce.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const year = input.year ?? new Date().getFullYear();
        let employeeId = input.employeeId;
        if (!employeeId) {
          const [emp] = await db.select().from(employees)
            .where(and(eq(employees.userId, ctx.user!.id), eq(employees.orgId, org!.id)));
          employeeId = emp?.id;
        }
        if (!employeeId) return [];
        return db.select().from(leaveBalances)
          .where(and(eq(leaveBalances.employeeId, employeeId), eq(leaveBalances.year, year)));
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

  payroll: router({
    listPayslips: permissionProcedure("hr", "read")
      .input(
        z.object({
          employeeId: z.string().uuid().optional(),
          year: z.number().int().optional(),
          limit: z.number().int().min(1).max(60).default(12),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { payslips: payslipsTable, desc: descOp, salaryStructures } = await import("@nexusops/db");
        const conditions = [eq(payslipsTable.orgId, org!.id)];
        if (input.employeeId) conditions.push(eq(payslipsTable.employeeId, input.employeeId));
        if (input.year) conditions.push(eq(payslipsTable.year, input.year));
        return db
          .select()
          .from(payslipsTable)
          .where(and(...conditions))
          .orderBy(descOp(payslipsTable.year), descOp(payslipsTable.month))
          .limit(input.limit);
      }),

    computeCurrentSlip: permissionProcedure("hr", "read")
      .input(z.object({ employeeId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const fyMonth = month >= 4 ? month - 3 : month + 9;

        const [emp] = await db
          .select()
          .from(employees)
          .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, org!.id)));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND" });
        if (!emp.salaryStructureId) return null;

        const { salaryStructures } = await import("@nexusops/db");
        const [structure] = await db
          .select()
          .from(salaryStructures)
          .where(eq(salaryStructures.id, emp.salaryStructureId!));
        if (!structure) return null;

        const { computeMonthlySalarySlip, computeTaxOld, computeTaxNew } = await import("../lib/india/payroll-engine.js");
        const slip = computeMonthlySalarySlip({
          ctcAnnual: Number(structure.ctcAnnual),
          basicPercent: Number(structure.basicPercent),
          hraPercentOfBasic: Number(structure.hraPercentOfBasic),
          ltaAnnual: Number(structure.ltaAnnual),
          medicalAllowanceAnnual: Number(structure.medicalAllowanceAnnual),
          conveyanceAllowanceAnnual: Number(structure.conveyanceAllowanceAnnual),
          bonusAnnual: Number(structure.bonusAnnual),
          state: emp.state ?? "Maharashtra",
          isMetroCity: emp.isMetroCity ?? false,
          regime: (emp.taxRegime ?? "new") as "old" | "new",
          currentFYMonth: fyMonth,
          ytdGross: 0,
          ytdTds: 0,
        });

        const taxResult = (emp.taxRegime ?? "new") === "old"
          ? computeTaxOld(slip.grossEarnings * 12, { section80C: slip.pfEmployee * 12, section80D: 0, section24b: 0, section80CCD1B: 0, hraExemption: 0, ltaExemption: 0 })
          : computeTaxNew(slip.grossEarnings * 12, 0);

        return {
          month, year,
          slip,
          taxSummary: {
            regime: emp.taxRegime ?? "new",
            projectedAnnualGross: slip.grossEarnings * 12,
            taxableIncome: taxResult.taxableIncome,
            totalTaxLiability: taxResult.totalTaxLiability,
            rebate87A: taxResult.rebate87A,
            surcharge: taxResult.surcharge,
            cess: taxResult.cess,
            effectiveRate: taxResult.effectiveRate,
            monthlyTds: slip.tds,
          },
          employeeInfo: {
            pan: emp.pan,
            uan: emp.uan,
            taxRegime: emp.taxRegime,
            state: emp.state,
          },
          ctcAnnual: Number(structure.ctcAnnual),
        };
      }),

    computeTax: permissionProcedure("hr", "read")
      .input(
        z.object({
          grossAnnualIncome: z.number().positive(),
          regime: z.enum(["old", "new"]),
          deductions: z
            .object({
              section80C: z.number().min(0).max(150000).default(0),
              section80D: z.number().min(0).max(50000).default(0),
              section24b: z.number().min(0).max(200000).default(0),
              section80CCD1B: z.number().min(0).max(50000).default(0),
              hraExemption: z.number().min(0).default(0),
              ltaExemption: z.number().min(0).default(0),
            })
            .optional(),
          npsEmployer: z.number().min(0).default(0),
        }),
      )
      .query(async ({ input }) => {
        const { computeTaxOld, computeTaxNew } = await import("../lib/india/payroll-engine.js");
        if (input.regime === "old") {
          return computeTaxOld(input.grossAnnualIncome, input.deductions ?? {
            section80C: 0, section80D: 0, section24b: 0, section80CCD1B: 0,
            hraExemption: 0, ltaExemption: 0,
          });
        }
        return computeTaxNew(input.grossAnnualIncome, input.npsEmployer);
      }),

    computeMonthlySlip: permissionProcedure("hr", "read")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          month: z.number().int().min(1).max(12),
          year: z.number().int().min(2020),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [emp] = await db
          .select()
          .from(employees)
          .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, org!.id)));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
        if (!emp.salaryStructureId) throw new TRPCError({ code: "BAD_REQUEST", message: "No salary structure assigned" });

        const { salaryStructures } = await import("@nexusops/db");
        const [structure] = await db
          .select()
          .from(salaryStructures)
          .where(eq(salaryStructures.id, emp.salaryStructureId));
        if (!structure) throw new TRPCError({ code: "NOT_FOUND", message: "Salary structure not found" });

        // Determine FY month (April = 1, March = 12)
        const fyMonth = input.month >= 4 ? input.month - 3 : input.month + 9;

        const { computeMonthlySalarySlip } = await import("../lib/india/payroll-engine.js");
        return computeMonthlySalarySlip({
          ctcAnnual: Number(structure.ctcAnnual),
          basicPercent: Number(structure.basicPercent),
          hraPercentOfBasic: Number(structure.hraPercentOfBasic),
          ltaAnnual: Number(structure.ltaAnnual),
          medicalAllowanceAnnual: Number(structure.medicalAllowanceAnnual),
          conveyanceAllowanceAnnual: Number(structure.conveyanceAllowanceAnnual),
          bonusAnnual: Number(structure.bonusAnnual),
          state: emp.state ?? "Maharashtra",
          isMetroCity: emp.isMetroCity ?? false,
          regime: (emp.taxRegime ?? "new") as "old" | "new",
          currentFYMonth: fyMonth,
          ytdGross: 0,
          ytdTds: 0,
        });
      }),

    runMonthlyPayroll: permissionProcedure("hr", "write")
      .input(
        z.object({
          month: z.number().int().min(1).max(12),
          year: z.number().int().min(2020),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { payrollRuns, salaryStructures, payslips: payslipsTable } = await import("@nexusops/db");
        const { computeMonthlySalarySlip } = await import("../lib/india/payroll-engine.js");

        // Check for duplicate run
        const [existing] = await db
          .select()
          .from(payrollRuns)
          .where(
            and(
              eq(payrollRuns.orgId, org!.id),
              eq(payrollRuns.month, input.month),
              eq(payrollRuns.year, input.year),
            ),
          );
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Payroll run already exists for this period" });

        const allEmployees = await db
          .select()
          .from(employees)
          .where(and(eq(employees.orgId, org!.id), eq(employees.status, "active")));

        const [run] = await db
          .insert(payrollRuns)
          .values({
            orgId: org!.id,
            month: input.month,
            year: input.year,
            status: "draft",
          })
          .returning();

        const fyMonth = input.month >= 4 ? input.month - 3 : input.month + 9;
        const slipInserts = [];
        let totalGross = 0, totalDeductions = 0, totalNet = 0;
        let totalPfEmp = 0, totalPfEr = 0, totalPt = 0, totalTds = 0;

        for (const emp of allEmployees) {
          if (!emp.salaryStructureId) continue;
          const [structure] = await db
            .select()
            .from(salaryStructures)
            .where(eq(salaryStructures.id, emp.salaryStructureId));
          if (!structure) continue;

          const slip = computeMonthlySalarySlip({
            ctcAnnual: Number(structure.ctcAnnual),
            basicPercent: Number(structure.basicPercent),
            hraPercentOfBasic: Number(structure.hraPercentOfBasic),
            ltaAnnual: Number(structure.ltaAnnual),
            medicalAllowanceAnnual: Number(structure.medicalAllowanceAnnual),
            conveyanceAllowanceAnnual: Number(structure.conveyanceAllowanceAnnual),
            bonusAnnual: Number(structure.bonusAnnual),
            state: emp.state ?? "Maharashtra",
            isMetroCity: emp.isMetroCity ?? false,
            regime: (emp.taxRegime ?? "new") as "old" | "new",
            currentFYMonth: fyMonth,
            ytdGross: 0,
            ytdTds: 0,
          });

          totalGross += slip.grossEarnings;
          totalDeductions += slip.totalDeductions;
          totalNet += slip.netPay;
          totalPfEmp += slip.pfEmployee;
          totalPfEr += slip.pfEmployer;
          totalPt += slip.professionalTax;
          totalTds += slip.tds;

          slipInserts.push({
            orgId: org!.id,
            employeeId: emp.id,
            payrollRunId: run!.id,
            month: input.month,
            year: input.year,
            basic: String(slip.basic),
            hra: String(slip.hra),
            specialAllowance: String(slip.specialAllowance),
            lta: String(slip.lta),
            medicalAllowance: String(slip.medicalAllowance),
            conveyanceAllowance: String(slip.conveyanceAllowance),
            bonus: String(slip.bonus),
            grossEarnings: String(slip.grossEarnings),
            pfEmployee: String(slip.pfEmployee),
            pfEmployer: String(slip.pfEmployer),
            professionalTax: String(slip.professionalTax),
            lwf: String(slip.lwf),
            tds: String(slip.tds),
            totalDeductions: String(slip.totalDeductions),
            netPay: String(slip.netPay),
            ytdGross: "0",
            ytdTds: "0",
            taxRegimeUsed: (emp.taxRegime ?? "new") as "old" | "new",
          });
        }

        if (slipInserts.length > 0) {
          await db.insert(payslipsTable).values(slipInserts);
        }

        const [updated] = await db
          .update(payrollRuns)
          .set({
            totalGross: String(totalGross),
            totalDeductions: String(totalDeductions),
            totalNet: String(totalNet),
            totalPfEmployee: String(totalPfEmp),
            totalPfEmployer: String(totalPfEr),
            totalPt: String(totalPt),
            totalTds: String(totalTds),
          })
          .where(eq(payrollRuns.id, run!.id))
          .returning();

        return { run: updated, slipsGenerated: slipInserts.length };
      }),

    generateECR: permissionProcedure("hr", "read")
      .input(z.object({ month: z.number().int().min(1).max(12), year: z.number().int() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { payrollRuns, payslips: payslipsTable } = await import("@nexusops/db");
        const { formatECRFile } = await import("../lib/india/payroll-engine.js");

        const [run] = await db
          .select()
          .from(payrollRuns)
          .where(
            and(
              eq(payrollRuns.orgId, org!.id),
              eq(payrollRuns.month, input.month),
              eq(payrollRuns.year, input.year),
            ),
          );
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll run not found" });

        const slips = await db
          .select()
          .from(payslipsTable)
          .where(eq(payslipsTable.payrollRunId, run.id));

        const ecrLines = await Promise.all(
          (slips as any[]).map(async (slip) => {
            const [emp] = await db
              .select()
              .from(employees)
              .where(eq(employees.id, slip.employeeId));
            const pfWages = Math.min(Number(slip.basic), 15000);
            return {
              uan: emp?.uan ?? "UNKNOWN",
              memberName: emp?.employeeId ?? "EMPLOYEE",
              grossWages: Number(slip.grossEarnings),
              epfWages: pfWages,
              epsWages: pfWages,
              edliWages: pfWages,
              employeeEpf: Number(slip.pfEmployee),
              employerEps: Math.min(Math.round(pfWages * 0.0833), 1250),
              employerEpf: Number(slip.pfEmployer),
              ncp: 0,
              refund: 0,
            };
          }),
        );

        const orgEpfoId = `EPFO_${org!.id.slice(0, 8).toUpperCase()}`;
        return {
          ecrContent: formatECRFile(orgEpfoId, input.month, input.year, ecrLines),
          totalLines: ecrLines.length,
          totalEmployeeContribution: (slips as any[]).reduce((s: number, sl: any) => s + Number(sl.pfEmployee), 0),
          totalEmployerContribution: (slips as any[]).reduce((s: number, sl: any) => s + Number(sl.pfEmployer), 0),
        };
      }),
  }),


  // ── Public Holiday Calendar ─────────────────────────────────────────────
  holidays: router({
    list: permissionProcedure("hr", "read").input(z.object({ year: z.number().int().optional() })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { publicHolidays, gte, lte, and: dbAnd, eq: dbEq, asc: dbAsc } = await import("@nexusops/db");
      const year = input.year ?? new Date().getFullYear();
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31, 23, 59, 59);
      return db.select().from(publicHolidays)
        .where(dbAnd(dbEq(publicHolidays.orgId, org!.id), gte(publicHolidays.date, start), lte(publicHolidays.date, end)))
        .orderBy(dbAsc(publicHolidays.date));
    }),

    create: permissionProcedure("hr", "write").input(z.object({
      name: z.string().min(1),
      date: z.coerce.date(),
      type: z.enum(["national", "restricted", "state", "company"]).default("national"),
      stateCode: z.string().length(2).nullable().optional(),
      year: z.number().int(),
      isOptional: z.boolean().default(false),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { publicHolidays } = await import("@nexusops/db");
      const [h] = await db.insert(publicHolidays).values({ ...input, orgId: org!.id }).returning();
      return h!;
    }),

    delete: permissionProcedure("hr", "write").input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { publicHolidays, eq: dbEq, and: dbAnd } = await import("@nexusops/db");
      await db.delete(publicHolidays).where(dbAnd(dbEq(publicHolidays.id, input.id), dbEq(publicHolidays.orgId, org!.id)));
      return { success: true };
    }),

    seedIndiaHolidays: permissionProcedure("hr", "write").input(z.object({ year: z.number().int() })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { publicHolidays } = await import("@nexusops/db");
      const year = input.year;
      const national = [
        { name: "New Year Day", date: new Date(year, 0, 1) },
        { name: "Republic Day", date: new Date(year, 0, 26) },
        { name: "Holi", date: new Date(year, 2, 14) },
        { name: "Ambedkar Jayanti", date: new Date(year, 3, 14) },
        { name: "Good Friday", date: new Date(year, 3, 18) },
        { name: "Labour Day", date: new Date(year, 4, 1) },
        { name: "Independence Day", date: new Date(year, 7, 15) },
        { name: "Gandhi Jayanti", date: new Date(year, 9, 2) },
        { name: "Diwali", date: new Date(year, 9, 20) },
        { name: "Christmas Day", date: new Date(year, 11, 25) },
        { name: "Eid ul-Fitr", date: new Date(year, 3, 10) },
        { name: "Eid ul-Adha", date: new Date(year, 5, 17) },
      ];
      const rows = national.map(h => ({ ...h, orgId: org!.id, type: "national" as const, year, isOptional: false }));
      await db.insert(publicHolidays).values(rows).onConflictDoNothing();
      return { seeded: rows.length };
    }),
  }),

  // ── Attendance ──────────────────────────────────────────────────────────
  attendance: router({
    list: permissionProcedure("hr", "read").input(z.object({
      employeeId: z.string().uuid().optional(),
      month: z.number().int().min(1).max(12).optional(),
      year: z.number().int().optional(),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { attendanceRecords, employees: emps, gte, lte, and: dbAnd, eq: dbEq, desc: dbDesc } = await import("@nexusops/db");
      const conds: any[] = [dbEq(attendanceRecords.orgId, org!.id)];
      if (input.employeeId) conds.push(dbEq(attendanceRecords.employeeId, input.employeeId));
      if (input.month && input.year) {
        const start = new Date(input.year, input.month - 1, 1);
        const end   = new Date(input.year, input.month, 0, 23, 59, 59);
        conds.push(gte(attendanceRecords.date, start), lte(attendanceRecords.date, end));
      }
      return db.select({ record: attendanceRecords, employee: emps })
        .from(attendanceRecords).leftJoin(emps, dbEq(attendanceRecords.employeeId, emps.id))
        .where(dbAnd(...conds)).orderBy(dbDesc(attendanceRecords.date));
    }),

    clockIn: permissionProcedure("hr", "write").input(z.object({
      employeeId: z.string().uuid(),
      date: z.coerce.date().optional(),
      shiftType: z.enum(["morning", "afternoon", "night", "flexible", "remote"]).default("flexible"),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { attendanceRecords, eq: dbEq, and: dbAnd } = await import("@nexusops/db");
      const date = input.date ?? new Date();
      const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const [rec] = await db.insert(attendanceRecords).values({ orgId: org!.id, employeeId: input.employeeId, date: dateStart, status: "present", shiftType: input.shiftType, checkIn: new Date() }).returning();
      return rec!;
    }),

    clockOut: permissionProcedure("hr", "write").input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { attendanceRecords, eq: dbEq, and: dbAnd } = await import("@nexusops/db");
      const [rec] = await db.select().from(attendanceRecords).where(dbAnd(dbEq(attendanceRecords.id, input.id), dbEq(attendanceRecords.orgId, org!.id))).limit(1);
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      const checkOut = new Date();
      const hoursWorked = rec.checkIn ? ((checkOut.getTime() - new Date(rec.checkIn).getTime()) / 3600000).toFixed(2) : "0";
      const [updated] = await db.update(attendanceRecords).set({ checkOut, hoursWorked, updatedAt: new Date() }).where(dbEq(attendanceRecords.id, input.id)).returning();
      return updated!;
    }),

    bulkMark: permissionProcedure("hr", "write").input(z.object({
      records: z.array(z.object({
        employeeId: z.string().uuid(),
        date: z.coerce.date(),
        status: z.enum(["present", "absent", "half_day", "late", "on_leave", "holiday", "weekend"]),
        shiftType: z.enum(["morning", "afternoon", "night", "flexible", "remote"]).default("flexible"),
      })),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { attendanceRecords } = await import("@nexusops/db");
      const rows = input.records.map(r => ({ ...r, orgId: org!.id, date: new Date(r.date.getFullYear(), r.date.getMonth(), r.date.getDate()) }));
      await db.insert(attendanceRecords).values(rows).onConflictDoNothing();
      return { count: rows.length };
    }),
  }),

  // ── Expense Claims ──────────────────────────────────────────────────────
  expenses: router({
    list: permissionProcedure("hr", "read").input(z.object({
      employeeId: z.string().uuid().optional(),
      status: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { expenseClaims, employees: emps, eq: dbEq, and: dbAnd, desc: dbDesc } = await import("@nexusops/db");
      const conds: any[] = [dbEq(expenseClaims.orgId, org!.id)];
      if (input.employeeId) conds.push(dbEq(expenseClaims.employeeId, input.employeeId));
      if (input.status) conds.push(dbEq(expenseClaims.status, input.status as any));
      return db.select({ claim: expenseClaims, employee: emps })
        .from(expenseClaims).leftJoin(emps, dbEq(expenseClaims.employeeId, emps.id))
        .where(dbAnd(...conds)).orderBy(dbDesc(expenseClaims.createdAt)).limit(input.limit);
    }),

    create: permissionProcedure("hr", "write").input(z.object({
      employeeId: z.string().uuid(),
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(["travel", "accommodation", "food", "fuel", "communication", "office_supplies", "client_entertainment", "training", "medical", "miscellaneous"]).default("miscellaneous"),
      amount: z.number().positive(),
      currency: z.string().default("INR"),
      expenseDate: z.coerce.date(),
      receiptUrl: z.string().url().optional(),
      projectCode: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { expenseClaims, count: dbCount, eq: dbEq } = await import("@nexusops/db");
      const [c] = await db.select({ n: dbCount() }).from(expenseClaims).where(dbEq(expenseClaims.orgId, org!.id));
      const seq = (c?.n ?? 0) + 1;
      const number = "EXP-" + new Date().getFullYear() + "-" + String(seq).padStart(4, "0");
      const [claim] = await db.insert(expenseClaims).values({ ...input, orgId: org!.id, number, amount: String(input.amount), status: "draft" }).returning();
      return claim!;
    }),

    submit: permissionProcedure("hr", "write").input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { expenseClaims, eq: dbEq, and: dbAnd } = await import("@nexusops/db");
      const [c] = await db.update(expenseClaims).set({ status: "submitted", updatedAt: new Date() }).where(dbAnd(dbEq(expenseClaims.id, input.id), dbEq(expenseClaims.orgId, org!.id))).returning();
      return c!;
    }),

    approve: permissionProcedure("hr", "write").input(z.object({
      id: z.string().uuid(),
      approved: z.boolean(),
      rejectionReason: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db, user } = ctx;
      const { expenseClaims, eq: dbEq, and: dbAnd } = await import("@nexusops/db");
      const status = input.approved ? "approved" as const : "rejected" as const;
      const [c] = await db.update(expenseClaims).set({ status, approvedById: input.approved ? user!.id : null, approvedAt: input.approved ? new Date() : null, rejectionReason: input.rejectionReason, updatedAt: new Date() }).where(dbAnd(dbEq(expenseClaims.id, input.id), dbEq(expenseClaims.orgId, org!.id))).returning();
      return c!;
    }),

    markReimbursed: permissionProcedure("hr", "write").input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { expenseClaims, eq: dbEq, and: dbAnd } = await import("@nexusops/db");
      const [c] = await db.update(expenseClaims).set({ status: "reimbursed", reimbursedAt: new Date(), updatedAt: new Date() }).where(dbAnd(dbEq(expenseClaims.id, input.id), dbEq(expenseClaims.orgId, org!.id))).returning();
      return c!;
    }),
  }),

  // ── OKR / Goal Management ───────────────────────────────────────────────
  okr: router({
    listObjectives: permissionProcedure("hr", "read").input(z.object({
      year: z.number().int().optional(),
      cycle: z.enum(["q1", "q2", "q3", "q4", "annual"]).optional(),
    })).query(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { okrObjectives, okrKeyResults, users: usersT, eq: dbEq, and: dbAnd, desc: dbDesc, inArray: dbInArray } = await import("@nexusops/db");
      const conds: any[] = [dbEq(okrObjectives.orgId, org!.id)];
      if (input.year) conds.push(dbEq(okrObjectives.year, input.year));
      if (input.cycle) conds.push(dbEq(okrObjectives.cycle, input.cycle));
      const objectives = await db.select({ objective: okrObjectives, owner: usersT })
        .from(okrObjectives).leftJoin(usersT, dbEq(okrObjectives.ownerId, usersT.id))
        .where(dbAnd(...conds)).orderBy(dbDesc(okrObjectives.createdAt));
      if (objectives.length === 0) return [];
      const ids = objectives.map((o: (typeof objectives)[number]) => o.objective.id);
      const krs = await db.select().from(okrKeyResults).where(dbInArray(okrKeyResults.objectiveId, ids));
      return objectives.map((o: (typeof objectives)[number]) => ({
        ...o,
        keyResults: krs.filter((k: (typeof krs)[number]) => k.objectiveId === o.objective.id),
      }));
    }),

    createObjective: permissionProcedure("hr", "write").input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      ownerId: z.string().uuid(),
      cycle: z.enum(["q1", "q2", "q3", "q4", "annual"]).default("q1"),
      year: z.number().int(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { okrObjectives } = await import("@nexusops/db");
      const [obj] = await db.insert(okrObjectives).values({ ...input, orgId: org!.id, status: "active" }).returning();
      return obj!;
    }),

    createKeyResult: permissionProcedure("hr", "write").input(z.object({
      objectiveId: z.string().uuid(),
      title: z.string().min(1),
      targetValue: z.number().positive().default(100),
      unit: z.string().default("%"),
      dueDate: z.coerce.date().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { org, db } = ctx;
      const { okrKeyResults } = await import("@nexusops/db");
      const [kr] = await db.insert(okrKeyResults).values({ ...input, orgId: org!.id, targetValue: String(input.targetValue), status: "on_track" }).returning();
      return kr!;
    }),

    updateKeyResult: permissionProcedure("hr", "write").input(z.object({
      id: z.string().uuid(),
      currentValue: z.number().min(0),
      status: z.enum(["on_track", "at_risk", "behind", "completed"]).optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const { okrKeyResults, okrObjectives, eq: dbEq } = await import("@nexusops/db");
      const [kr] = await db.update(okrKeyResults).set({ currentValue: String(input.currentValue), status: input.status, notes: input.notes, updatedAt: new Date() }).where(dbEq(okrKeyResults.id, input.id)).returning();
      if (kr) {
        const allKRs = await db.select().from(okrKeyResults).where(dbEq(okrKeyResults.objectiveId, kr.objectiveId));
        const pcts = allKRs.map((k: (typeof allKRs)[number]) => (Number(k.currentValue) / Math.max(Number(k.targetValue), 1)) * 100);
        const avg = pcts.length ? Math.round(pcts.reduce((s: number, p: number) => s + p, 0) / pcts.length) : 0;
        await db.update(okrObjectives).set({ overallProgress: avg, updatedAt: new Date() }).where(dbEq(okrObjectives.id, kr.objectiveId));
      }
      return kr!;
    }),
  }),

  /** Flat alias for `hr.employees.list` — supports an optional `limit` used by OKR, Expenses, and Attendance pages. */
  listEmployees: permissionProcedure("hr", "read")
    .input(
      z.object({
        limit: z.number().int().positive().optional(),
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

      const query = db
        .select({ emp: employees, userName: users.name, userEmail: users.email })
        .from(employees)
        .innerJoin(users, eq(employees.userId, users.id))
        .where(and(...conditions))
        .orderBy(asc(users.name));

      const rows = input.limit ? await query.limit(input.limit) : await query;

      return rows.map((row: (typeof rows)[number]) => {
        const { emp, userName, userEmail } = row;
        return {
          ...emp,
          name: userName,
          email: userEmail,
          employeeNumber: emp.employeeId,
          jobTitle: emp.title,
        };
      });
    }),
});
