import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { resolveAssignment } from "../services/assignment";
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
  asc,
  count,
  sql,
  isNull,
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

        const rows = await db
          .select({ emp: employees, userName: users.name, userEmail: users.email })
          .from(employees)
          .innerJoin(users, eq(employees.userId, users.id))
          .where(and(...conditions));

        return rows.map(({ emp, userName, userEmail }) => ({
          ...emp,
          name: userName,
          email: userEmail,
          employeeNumber: emp.employeeId,
          jobTitle: emp.title,
        }));
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
});
