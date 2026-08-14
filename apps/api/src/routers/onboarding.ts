import { router, protectedProcedure } from "../lib/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { panColumns, decryptPan } from "../lib/pan";
import {
  users,
  tickets,
  invoices,
  chartOfAccounts,
  organizations,
  employees,
  salaryStructures,
  eq,
  and,
  count,
  inArray,
  sql,
} from "@coheronconnect/db";

import { writeWizardData, DuplicateGstinError } from "../services/orgWizardWrite";
import { checkDbUserPermission } from "../lib/rbac-db";
import { PAYROLL_EMPLOYED_STATUSES } from "../services/payroll-run-aggregates";

export const profileSchema = z.object({
  displayName: z.string().min(1),
  industry: z.string().min(1),
  size: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  website: z.string().url().or(z.string().min(1)),
  supportEmail: z.string().email(),
});

/** The 8 legal entity types (mirrors db `entityTypeEnum`, auth.ts). Drives which registration
 *  identifier the compliance form asks for — see the superRefine below. */
export const entityTypeValues = [
  "private_limited",
  "public_limited",
  "one_person_company",
  "llp",
  "partnership_firm",
  "sole_proprietorship",
  "huf",
  "trust_society_section8",
] as const;

// Entity types that MUST carry a CIN (registered under the Companies Act).
const CIN_REQUIRED_ENTITY_TYPES: readonly string[] = ["private_limited", "public_limited", "one_person_company"];
// `trust_society_section8` is a COMBINED bucket: a Section-8 company HAS a CIN, but a trust/society
// does NOT. The enum cannot tell them apart, so CIN is valid-if-present (not required) for it, and an
// LLPIN never applies. (Flagged in the build report — a finer enum would split Section-8 out.)
const CIN_OPTIONAL_ENTITY_TYPES: readonly string[] = ["trust_society_section8"];

// The raw object (kept separate from the refined schema below) so callers that need `.partial()`
// — e.g. the super-admin partial editor — can still derive from it. `.superRefine` returns a
// ZodEffects, which has no `.partial()`.
export const indiaObjectSchema = z
  .object({
    // GSTIN / CIN / EPF are CONDITIONAL in statute; requiring them server-side would 400 a blank save
    // from the wizard (which already treats them as valid-if-present) — the exclusion the entity-type
    // work exists to remove. Optional here; PAN, TAN and the primary state are what genuinely hold.
    gstin: z.string().length(15).regex(/^[0-9A-Z]{15}$/, "Invalid GSTIN format").optional(),
    pan: z.string().length(10).regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN"),
    cin: z.string().length(21).regex(/^[L|U]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/, "Invalid CIN").optional(),
    /** LLPIN — the LLP registration identifier, 7 alphanumeric chars. A DIFFERENT field from CIN,
     *  not a relabelled one; only an LLP carries it. (Format kept permissive — the LLPIN format has
     *  varied over time and the cited statutory-identifiers research doc is not in the repo.) */
    llpin: z.string().length(7).regex(/^[A-Z0-9]{7}$/, "Invalid LLPIN — 7 alphanumeric characters").optional(),
    /** Legal entity type. Drives CIN-vs-LLPIN-vs-neither (superRefine below); persisted to
     *  organizations.entity_type. Optional for backward-compatible partial saves. */
    entityType: z.enum(entityTypeValues).optional(),
    tan: z.string().length(10).regex(/^[A-Z]{4}[0-9]{5}[A-Z]{1}$/, "Invalid TAN"),
    pf: z.string().min(1).optional(),
    /** ESIC employer establishment code. Optional — not every org is ESI-registered
     *  (registration triggers at 10+ employees). Rendered on the payslip when present. */
    esi: z.string().min(1).optional(),
    /** EPF contribution rate for this establishment (12 default, 10 for small/sick). Applies to
     *  every employee under this registration. */
    pfContributionRate: z.number().min(0).max(12).optional(),
    /** EPFO ground for a reduced (<12%) rate — required when the rate is reduced (enforced in the
     *  write path); this is the value the ECR upload carries. */
    pfReducedRateReason: z
      .enum(["bidi", "brick", "coir", "jute", "guar_gum", "under_20_employees", "sick_establishment"])
      .optional(),
    stateCode: z.string().length(2),
    /** AATO in rupees — drives the GSTR-1 HSN digit rule. Optional at onboarding. */
    annualAggregateTurnover: z.number().nonnegative().optional(),
  });

export const indiaSchema = indiaObjectSchema
  // Registration identifier follows entity type: a company needs a CIN, an LLP needs an LLPIN, and
  // partnership/proprietorship/HUF need neither. Only enforced once an entity type is chosen (so a
  // legacy partial save with no entity type stays valid). Requiring a CIN of everyone excluded every
  // non-company permanently — the whole reason this branch exists.
  .superRefine((data, ctx) => {
    if (!data.entityType) return;
    if (CIN_REQUIRED_ENTITY_TYPES.includes(data.entityType)) {
      if (!data.cin) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cin"], message: "CIN is required for a company" });
      if (data.llpin) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["llpin"], message: "An LLPIN does not apply to a company — it carries a CIN" });
    } else if (data.entityType === "llp") {
      if (!data.llpin) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["llpin"], message: "LLPIN is required for an LLP" });
      if (data.cin) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cin"], message: "A CIN does not apply to an LLP — it carries an LLPIN" });
    } else if (CIN_OPTIONAL_ENTITY_TYPES.includes(data.entityType)) {
      // Section-8 company (CIN) vs trust/society (none) share this bucket — CIN valid-if-present, LLPIN never.
      if (data.llpin) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["llpin"], message: "An LLPIN does not apply to this entity type" });
    } else {
      // partnership_firm / sole_proprietorship / huf — neither identifier.
      if (data.cin) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cin"], message: "A CIN does not apply to this entity type" });
      if (data.llpin) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["llpin"], message: "An LLPIN does not apply to this entity type" });
    }
  });

export const itsmSchema = z.object({
  p1: z.number().int().positive(),
  p2: z.number().int().positive(),
  p3: z.number().int().positive(),
  p4: z.number().int().positive(),
});

export const saveWizardDataInputSchema = z.object({
  profile: profileSchema.optional(),
  india: indiaSchema.optional(),
  itsm: itsmSchema.optional(),
  step: z.number().int().positive().optional(),
});

export type OnboardingItemKey =
  | "invite_team"
  | "chart_of_accounts"
  | "first_ticket"
  | "first_invoice";

export interface OnboardingItem {
  key: OnboardingItemKey;
  title: string;
  description: string;
  href: string;
  done: boolean;
}

/**
 * One reason an org cannot yet run a payroll. `message` names WHAT is missing
 * (and, when it is a per-employee gap, WHICH employees); `href` + `hrefLabel`
 * name WHERE to go and fix it.
 */
export interface PayrollReadinessBlocker {
  code:
    | "no_employees"
    | "no_structures"
    | "employees_missing_structure"
    | "employees_missing_state";
  message: string;
  href: string;
  hrefLabel: string;
}

/** Whether the org can run a payroll, and if not, exactly why (see the run's
 *  own selection in `payroll-run-aggregates` — this mirrors it). */
export interface PayrollReadiness {
  ready: boolean;
  blockers: PayrollReadinessBlocker[];
}

export const onboardingRouter = router({
  /**
   * Derived checklist for the current org. `done` is computed live from row
   * counts — no state is persisted, so it is always accurate and needs no
   * migration. Returns the items plus a rolled-up completion count.
   */
  getChecklist: protectedProcedure.query(async ({ ctx }) => {
    const { db, org } = ctx;
    const orgId = org!.id;

    const [
      [activeUsersRow],
      [coaRow],
      [ticketsRow],
      [invoicesRow],
    ] = await Promise.all([
      db
        .select({ n: count() })
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.status, "active"))),
      db
        .select({ n: count() })
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.orgId, orgId)),
      db
        .select({ n: count() })
        .from(tickets)
        .where(eq(tickets.orgId, orgId)),
      db
        .select({ n: count() })
        .from(invoices)
        .where(eq(invoices.orgId, orgId)),
    ]);

    const activeUsers = activeUsersRow?.n ?? 0;
    const coaCount = coaRow?.n ?? 0;
    const ticketCount = ticketsRow?.n ?? 0;
    const invoiceCount = invoicesRow?.n ?? 0;

    const items: OnboardingItem[] = [
      {
        key: "invite_team",
        title: "Invite a teammate",
        description: "Add at least one more person so it isn't a team of one.",
        href: "/app/admin",
        // The founder is the first active user; anything beyond that means a
        // teammate has been added (or an invite has been accepted).
        done: activeUsers > 1,
      },
      {
        key: "chart_of_accounts",
        title: "Set up your chart of accounts",
        description: "The India chart of accounts that finance and GST posting rely on.",
        href: "/app/onboarding-wizard",
        done: coaCount > 0,
      },
      {
        key: "first_ticket",
        title: "Log your first request",
        description: "Create a ticket to try the service desk end to end.",
        href: "/app/tickets",
        done: ticketCount > 0,
      },
      {
        key: "first_invoice",
        title: "Create your first invoice",
        description: "Raise an invoice to exercise the finance and ledger flow.",
        href: "/app/financial",
        done: invoiceCount > 0,
      },
    ];

    const completed = items.filter((i) => i.done).length;

    // ── Payroll readiness ──────────────────────────────────────────────────
    // A finished setup wizard says "You're all set", but an org with no
    // employees and no salary structures cannot run a single payroll. This
    // signal spells out what still stands between the org and its first run.
    //
    // The conditions are taken from the payroll run's OWN employee selection
    // (services/payroll-run-aggregates.ts) so the readiness signal cannot drift
    // from what a run actually requires:
    //   • the run selects employees whose status is in PAYROLL_EMPLOYED_STATUSES
    //     (active | probation | on_leave); leavers are excluded.
    //   • an employee with no salaryStructureId is dropped from the run (unpaid).
    //   • buildEmployeePayrollInput() throws when an employee has no `state`
    //     (the PT slab cannot be resolved), so a stateless employee is excluded.
    //   • at least one salary structure must exist to assign in the first place.
    // taxRegime is deliberately NOT a blocker: the column is NOT NULL DEFAULT
    // 'new' (schema/hr.ts), so it is never absent — the run always reads a
    // regime. The real risk there is a *silent default*, which no stored flag
    // distinguishes from a deliberate choice; flagging it would be a guess.
    const [structRow] = await db
      .select({ n: count() })
      .from(salaryStructures)
      // No isArchived filter: the run's resolver (salary-structure-resolver.ts)
      // resolves by familyId + effective window and does NOT skip archived rows,
      // so "a structure exists" must mirror that or the signal would diverge.
      .where(eq(salaryStructures.orgId, orgId));
    const structureCount = structRow?.n ?? 0;

    const employed = await db
      .select({
        id: employees.id,
        code: employees.employeeId,
        state: employees.state,
        salaryStructureId: employees.salaryStructureId,
      })
      .from(employees)
      .where(
        and(
          eq(employees.orgId, orgId),
          inArray(employees.status, [...PAYROLL_EMPLOYED_STATUSES]),
        ),
      );

    const missingStructure = employed.filter((e) => !e.salaryStructureId);
    const missingState = employed.filter((e) => !e.state || e.state.trim() === "");

    const MAX_NAMED = 5;
    const nameList = (rows: Array<{ code: string }>): string => {
      const codes = rows.map((r) => r.code);
      return codes.length <= MAX_NAMED
        ? codes.join(", ")
        : `${codes.slice(0, MAX_NAMED).join(", ")}, +${codes.length - MAX_NAMED} more`;
    };

    const blockers: PayrollReadinessBlocker[] = [];
    if (employed.length === 0) {
      blockers.push({
        code: "no_employees",
        message: "No employees exist yet — add your workforce before a payroll can run.",
        href: "/app/hr",
        hrefLabel: "HR → Employees",
      });
    }
    if (structureCount === 0) {
      blockers.push({
        code: "no_structures",
        message:
          "No salary structures exist yet — create at least one before a payroll can run.",
        href: "/app/payroll",
        hrefLabel: "Payroll → Salary structures",
      });
    }
    // Only surface a per-employee structure gap when structures exist to assign;
    // when there are none, the no_structures blocker already says what to do first.
    if (structureCount > 0 && missingStructure.length > 0) {
      blockers.push({
        code: "employees_missing_structure",
        message:
          `${missingStructure.length} employee(s) have no salary structure and would be left ` +
          `unpaid: ${nameList(missingStructure)}. Assign one on each employee's record.`,
        href: "/app/hr",
        hrefLabel: "HR → Employees",
      });
    }
    if (missingState.length > 0) {
      blockers.push({
        code: "employees_missing_state",
        message:
          `${missingState.length} employee(s) have no work state, so professional tax cannot be ` +
          `computed and they would be excluded from payroll: ${nameList(missingState)}. ` +
          `Set each employee's state.`,
        href: "/app/hr",
        hrefLabel: "HR → Employees",
      });
    }

    const payrollReadiness: PayrollReadiness = {
      ready: blockers.length === 0,
      blockers,
    };

    return {
      items,
      completed,
      total: items.length,
      allComplete: completed === items.length,
      payrollReadiness,
    };
  }),

  /**
   * Save wizard step data.
   */
  saveWizardData: protectedProcedure
    .input(saveWizardDataInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const orgId = org!.id;

      // AUTHZ (sweep): writeWizardData writes org-wide statutory identity — GSTIN
      // registry, PF, entity config. Gate on payroll.write, the same money-domain gate
      // as onboarding.updateStatutoryIdentity; requester/member is denied, admin +
      // hr_manager/hr_analyst pass.
      const role = String(user!.role ?? "");
      const matrixRole = user!.matrixRole as string | null | undefined;
      if (!checkDbUserPermission(role, "payroll", "write", matrixRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Permission denied: payroll.write required to write onboarding / statutory config",
        });
      }

      try {
        await writeWizardData(db, orgId, input, {
          type: "tenant_user",
          id: user!.id
        });
        return { success: true };
      } catch (e: any) { // any-ratchet-allow: custom postgres error handling
        if (e instanceof DuplicateGstinError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e.message
          });
        }
        throw e;
      }
    }),

  /**
   * Update the organisation's India statutory identity AFTER onboarding is complete.
   * PARTIAL: only the fields provided are written. This is the post-onboarding editor the
   * wizard cannot offer (the wizard goes read-only once complete, and `saveWizardData` requires
   * the full India schema). All columns already exist (schema/auth.ts) — no migration. The
   * reduced-rate rule mirrors `writeWizardData`: below 12% requires an enumerated EPFO ground.
   */
  updateStatutoryIdentity: protectedProcedure
    .input(
      z.object({
        epfCode: z.string().trim().max(64).optional(),
        esiEstablishmentNumber: z.string().trim().max(32).optional(),
        ptRegistrationNumber: z.string().trim().max(64).optional(),
        pfContributionRate: z.number().min(0).max(12).optional(),
        pfReducedRateReason: z
          .enum(["bidi", "brick", "coir", "jute", "guar_gum", "under_20_employees", "sick_establishment"])
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      // AUTHZ (STATUTORY-IDENTITY-UNGATED): this writes org-level statutory config —
      // EPF code and the PF contribution RATE among them. Without an in-body check any
      // authenticated org member could change the PF rate and silently miscompute every
      // employee's provident fund. Gate on payroll.write (the money domain being
      // protected): requester/member lacks it, admin/owner + hr_manager/hr_analyst have
      // it — same shape as payroll.runs.approve (payroll.ts:731). Org-scoped, no cross-
      // tenant reach; the RLS wall does not stop a same-org member, so this gate is it.
      const role = String(ctx.user!.role ?? "");
      const matrixRole = ctx.user!.matrixRole as string | null | undefined;
      if (!checkDbUserPermission(role, "payroll", "write", matrixRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Permission denied: payroll.write required to change statutory identity / PF configuration",
        });
      }
      const updateFields: Record<string, unknown> = {};
      if (input.epfCode !== undefined) updateFields.epfCode = input.epfCode || null;
      if (input.esiEstablishmentNumber !== undefined)
        updateFields.esiEstablishmentNumber = input.esiEstablishmentNumber || null;
      if (input.ptRegistrationNumber !== undefined)
        updateFields.ptRegistrationNumber = input.ptRegistrationNumber || null;
      if (input.pfContributionRate !== undefined) {
        // A reduced (< 12%) rate MUST carry an enumerated EPFO ground — that ground is what goes
        // on the ECR upload. At 12% the reason is cleared. Same rule as the onboarding wizard.
        if (input.pfContributionRate < 12 && !input.pfReducedRateReason) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "A reduced PF contribution rate (below 12%) requires a reason — one of: Bidi, Brick, " +
              "Coir, Jute, Guar Gum, fewer than 20 employees, or a sick establishment.",
          });
        }
        updateFields.pfContributionRate = String(input.pfContributionRate);
        updateFields.pfReducedRateReason =
          input.pfContributionRate < 12 ? (input.pfReducedRateReason ?? null) : null;
      }
      if (Object.keys(updateFields).length > 0) {
        await db.update(organizations).set(updateFields).where(eq(organizations.id, org!.id));
      }
      return { success: true };
    }),

  /**
   * Complete onboarding wizard.
   */
  completeWizard: protectedProcedure
    .input(z.object({}))
    .mutation(async ({ ctx }) => {
      const { db, org, user } = ctx;
      const orgId = org!.id;
      // AUTHZ (sweep): flips org-wide onboarding-completion state. Gate on
      // onboarding.write — requester/member denied, admin + hr roles pass.
      const role = String(user!.role ?? "");
      const matrixRole = user!.matrixRole as string | null | undefined;
      if (!checkDbUserPermission(role, "onboarding", "write", matrixRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Permission denied: onboarding.write required to complete onboarding",
        });
      }
      await db.update(organizations).set({
        onboardingStep: 7,
        onboardingCompletedAt: new Date(),
        onboardingCompletedBy: user!.id,
        updatedAt: new Date(),
      }).where(eq(organizations.id, orgId));
      return { success: true };
    }),

  /**
   * Retrieve current onboarding wizard state.
   */
  getWizardData: protectedProcedure.query(async ({ ctx }) => {
    const { db, org } = ctx;
    const orgId = org!.id;

    const [orgRow] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!orgRow) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organisation not found",
      });
    }

    const { gstinRegistry, legalEntities } = await import("@coheronconnect/db/schema");
    const [gstinRow] = await db
      .select()
      .from(gstinRegistry)
      .where(eq(gstinRegistry.orgId, orgId))
      .limit(1);

    const [leRow] = await db
      .select()
      .from(legalEntities)
      .where(eq(legalEntities.orgId, orgId))
      .limit(1);

    // Decrypt the stored (envelope) org PAN for display; legacy plaintext rows read through.
    const orgPan = (await decryptPan(orgRow.pan)) ?? "";

    return {
      profile: {
        displayName: orgRow.name,
        industry: orgRow.industry ?? "",
        size: orgRow.companySize ?? "",
        city: orgRow.city ?? "",
        state: orgRow.state ?? "",
        website: orgRow.website ?? "",
        supportEmail: orgRow.supportEmail ?? "",
      },
      india: {
        gstin: gstinRow?.gstin ?? "",
        pan: orgPan,
        cin: leRow?.cin ?? "",
        llpin: leRow?.llpin ?? "",
        entityType: orgRow.entityType ?? "",
        tan: orgRow.tan ?? "",
        pf: orgRow.epfCode ?? "",
        esi: orgRow.esiEstablishmentNumber ?? "",
        // Post-onboarding statutory identity (read by the Organisation Statutory settings screen).
        ptRegistrationNumber: orgRow.ptRegistrationNumber ?? "",
        pfContributionRate:
          orgRow.pfContributionRate != null ? Number(orgRow.pfContributionRate) : 12,
        pfReducedRateReason: orgRow.pfReducedRateReason ?? null,
        stateCode: orgRow.primaryStateCode ?? "",
        annualAggregateTurnover:
          orgRow.annualAggregateTurnover != null ? Number(orgRow.annualAggregateTurnover) : null,
      },
      itsm: {
        p1: orgRow.slaP1Hours ?? 4,
        p2: orgRow.slaP2Hours ?? 8,
        p3: orgRow.slaP3Hours ?? 24,
        p4: orgRow.slaP4Hours ?? 72,
      },
      onboardingStep: orgRow.onboardingStep ?? 1,
      onboardingCompletedAt: orgRow.onboardingCompletedAt,
    };
  }),
});
