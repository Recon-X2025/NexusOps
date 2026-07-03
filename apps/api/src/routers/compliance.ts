/**
 * Compliance router — DPDP Act 2023 data-protection surface.
 *
 * Gated under the new `compliance` module (owned by the `privacy_officer` DPO
 * role; see packages/types/src/rbac-matrix.ts).
 *   - dsr     (1.1): Data Subject Request lifecycle + statutory response clock.
 *   - consent (1.2): §6 consent ledger (grant / withdraw / renew / expire).
 *   - breach  (1.3): §8(6) personal-data breach register + notification clock.
 */
import { router, permissionProcedure } from "../lib/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  dpdpDataSubjectRequests,
  dpdpDsrEvents,
  dpdpConsentRecords,
  dpdpConsentEvents,
  consentStatusEnum,
  dpdpBreachIncidents,
  dpdpBreachEvents,
  breachSeverityEnum,
  breachStatusEnum,
  privacyBreachNotificationProfiles,
  dsrRequestTypeEnum,
  dsrStatusEnum,
  eq,
  and,
  desc,
  asc,
  sql,
} from "@coheronconnect/db";

// DSR state machine — allowed transitions. Terminal states (closed) accept none.
const DSR_TRANSITIONS: Record<string, string[]> = {
  received: ["verifying", "in_progress", "on_hold", "rejected"],
  verifying: ["in_progress", "on_hold", "rejected"],
  in_progress: ["on_hold", "fulfilled", "rejected"],
  on_hold: ["in_progress", "rejected"],
  fulfilled: ["closed"],
  rejected: ["closed"],
  closed: [],
};

type DsrStatus = (typeof dsrStatusEnum.enumValues)[number];
type BreachStatus = (typeof breachStatusEnum.enumValues)[number];

// Breach state machine — allowed transitions. closed is terminal.
const BREACH_TRANSITIONS: Record<string, string[]> = {
  detected: ["assessing", "notifying", "contained", "closed"],
  assessing: ["notifying", "contained", "closed"],
  notifying: ["notified", "contained"],
  notified: ["contained", "closed"],
  contained: ["closed"],
  closed: [],
};

/** Generates the next per-org, per-year case reference for a given prefix. */
async function nextReference(
  db: any,
  orgId: string,
  table: any,
  refCol: any,
  prefixBase: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${prefixBase}-${year}-`;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(and(eq(table.orgId, orgId), sql`${refCol} LIKE ${prefix + "%"}`));
  const seq = (row?.n ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

/** Generates the next per-org DSR case reference (DSR-YYYY-NNNN). */
async function nextDsrReference(db: any, orgId: string): Promise<string> {
  return nextReference(
    db,
    orgId,
    dpdpDataSubjectRequests,
    dpdpDataSubjectRequests.reference,
    "DSR",
  );
}

export const complianceRouter = router({
  dsr: router({
    // ── List / filter ──────────────────────────────────────────────────────
    list: permissionProcedure("compliance", "read")
      .input(
        z
          .object({
            status: z.enum(dsrStatusEnum.enumValues).optional(),
            requestType: z.enum(dsrRequestTypeEnum.enumValues).optional(),
            overdueOnly: z.boolean().optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(dpdpDataSubjectRequests.orgId, org!.id)];
        if (input?.status) conditions.push(eq(dpdpDataSubjectRequests.status, input.status));
        if (input?.requestType)
          conditions.push(eq(dpdpDataSubjectRequests.requestType, input.requestType));
        if (input?.overdueOnly) {
          conditions.push(sql`${dpdpDataSubjectRequests.closedAt} IS NULL`);
          conditions.push(sql`${dpdpDataSubjectRequests.dueAt} < now()`);
        }
        return db
          .select()
          .from(dpdpDataSubjectRequests)
          .where(and(...conditions))
          .orderBy(asc(dpdpDataSubjectRequests.dueAt));
      }),

    // ── Get one (with event trail) ───────────────────────────────────────────
    get: permissionProcedure("compliance", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [reqRow] = await db
          .select()
          .from(dpdpDataSubjectRequests)
          .where(
            and(
              eq(dpdpDataSubjectRequests.id, input.id),
              eq(dpdpDataSubjectRequests.orgId, org!.id),
            ),
          )
          .limit(1);
        if (!reqRow) throw new TRPCError({ code: "NOT_FOUND", message: "DSR not found" });
        const events = await db
          .select()
          .from(dpdpDsrEvents)
          .where(eq(dpdpDsrEvents.requestId, input.id))
          .orderBy(asc(dpdpDsrEvents.createdAt));
        return { ...reqRow, events };
      }),

    // ── Intake ───────────────────────────────────────────────────────────────
    create: permissionProcedure("compliance", "write")
      .input(
        z.object({
          requestType: z.enum(dsrRequestTypeEnum.enumValues),
          principalName: z.string().min(1).max(200),
          principalEmail: z.string().email().optional(),
          principalPhone: z.string().max(30).optional(),
          details: z.string().max(4000).optional(),
          assignedToUserId: z.string().uuid().optional(),
          linkedPrivacyMatterId: z.string().uuid().optional(),
          responseWindowDays: z.number().int().min(1).max(365).default(30),
          receivedAt: z.string().datetime().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
        const dueAt = new Date(
          receivedAt.getTime() + input.responseWindowDays * 24 * 60 * 60 * 1000,
        );
        const reference = await nextDsrReference(db, org!.id);

        return db.transaction(async (tx) => {
          const [reqRow] = await tx
            .insert(dpdpDataSubjectRequests)
            .values({
              orgId: org!.id,
              reference,
              requestType: input.requestType,
              status: "received",
              principalName: input.principalName,
              principalEmail: input.principalEmail,
              principalPhone: input.principalPhone,
              details: input.details,
              assignedToUserId: input.assignedToUserId,
              linkedPrivacyMatterId: input.linkedPrivacyMatterId,
              responseWindowDays: input.responseWindowDays,
              receivedAt,
              dueAt,
            })
            .returning();
          await tx.insert(dpdpDsrEvents).values({
            orgId: org!.id,
            requestId: reqRow!.id,
            eventType: "created",
            toStatus: "received",
            note: `DSR ${reference} received (${input.requestType})`,
            actorUserId: (user?.id as string) ?? null,
          });
          return reqRow!;
        });
      }),

    // ── Assign / reassign handler ─────────────────────────────────────────────
    assign: permissionProcedure("compliance", "write")
      .input(z.object({ id: z.string().uuid(), assignedToUserId: z.string().uuid().nullable() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(dpdpDataSubjectRequests)
            .set({ assignedToUserId: input.assignedToUserId, updatedAt: new Date() })
            .where(
              and(
                eq(dpdpDataSubjectRequests.id, input.id),
                eq(dpdpDataSubjectRequests.orgId, org!.id),
              ),
            )
            .returning();
          if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "DSR not found" });
          await tx.insert(dpdpDsrEvents).values({
            orgId: org!.id,
            requestId: row.id,
            eventType: "assigned",
            note: input.assignedToUserId ? "Assigned handler" : "Unassigned",
            actorUserId: (user?.id as string) ?? null,
          });
          return row;
        });
      }),

    // ── State machine transition ──────────────────────────────────────────────
    transition: permissionProcedure("compliance", "write")
      .input(
        z.object({
          id: z.string().uuid(),
          toStatus: z.enum(dsrStatusEnum.enumValues),
          note: z.string().max(4000).optional(),
          resolutionNote: z.string().max(4000).optional(),
          rejectionReason: z.string().max(4000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        return db.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(dpdpDataSubjectRequests)
            .where(
              and(
                eq(dpdpDataSubjectRequests.id, input.id),
                eq(dpdpDataSubjectRequests.orgId, org!.id),
              ),
            )
            .limit(1);
          if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "DSR not found" });

          const from = current.status as DsrStatus;
          const to = input.toStatus;
          if (from === to) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `DSR is already ${to}`,
            });
          }
          const allowed = DSR_TRANSITIONS[from] ?? [];
          if (!allowed.includes(to)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Invalid DSR transition ${from} → ${to}`,
            });
          }
          if (to === "rejected" && !input.rejectionReason) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "rejectionReason is required to reject a DSR",
            });
          }

          const patch: Record<string, unknown> = { status: to, updatedAt: new Date() };
          if (to === "closed") patch["closedAt"] = new Date();
          if (input.resolutionNote) patch["resolutionNote"] = input.resolutionNote;
          if (to === "rejected") patch["rejectionReason"] = input.rejectionReason;

          const [row] = await tx
            .update(dpdpDataSubjectRequests)
            .set(patch)
            .where(eq(dpdpDataSubjectRequests.id, input.id))
            .returning();

          await tx.insert(dpdpDsrEvents).values({
            orgId: org!.id,
            requestId: input.id,
            eventType: "status_changed",
            fromStatus: from,
            toStatus: to,
            note: input.note ?? `${from} → ${to}`,
            actorUserId: (user?.id as string) ?? null,
          });
          return row!;
        });
      }),

    // ── Free-form note (no status change) ─────────────────────────────────────
    addNote: permissionProcedure("compliance", "write")
      .input(z.object({ id: z.string().uuid(), note: z.string().min(1).max(4000) }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const [exists] = await db
          .select({ id: dpdpDataSubjectRequests.id })
          .from(dpdpDataSubjectRequests)
          .where(
            and(
              eq(dpdpDataSubjectRequests.id, input.id),
              eq(dpdpDataSubjectRequests.orgId, org!.id),
            ),
          )
          .limit(1);
        if (!exists) throw new TRPCError({ code: "NOT_FOUND", message: "DSR not found" });
        const [ev] = await db
          .insert(dpdpDsrEvents)
          .values({
            orgId: org!.id,
            requestId: input.id,
            eventType: "note",
            note: input.note,
            actorUserId: (user?.id as string) ?? null,
          })
          .returning();
        return ev!;
      }),

    // ── SLA summary (open / overdue / due-soon counts) ────────────────────────
    slaSummary: permissionProcedure("compliance", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;
      const rows = await db
        .select({
          status: dpdpDataSubjectRequests.status,
          dueAt: dpdpDataSubjectRequests.dueAt,
          closedAt: dpdpDataSubjectRequests.closedAt,
        })
        .from(dpdpDataSubjectRequests)
        .where(eq(dpdpDataSubjectRequests.orgId, org!.id));

      const now = Date.now();
      const soonMs = 7 * 24 * 60 * 60 * 1000;
      let open = 0;
      let overdue = 0;
      let dueSoon = 0;
      let closed = 0;
      for (const r of rows) {
        if (r.closedAt || r.status === "closed") {
          closed++;
          continue;
        }
        open++;
        const due = new Date(r.dueAt).getTime();
        if (due < now) overdue++;
        else if (due - now <= soonMs) dueSoon++;
      }
      return { total: rows.length, open, overdue, dueSoon, closed };
    }),
  }),

  // ══ Consent ledger (DPDP §6) ═══════════════════════════════════════════════
  consent: router({
    // ── List / filter current consent state ──────────────────────────────────
    list: permissionProcedure("compliance", "read")
      .input(
        z
          .object({
            principalRef: z.string().optional(),
            status: z.enum(consentStatusEnum.enumValues).optional(),
            purpose: z.string().optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(dpdpConsentRecords.orgId, org!.id)];
        if (input?.principalRef)
          conditions.push(eq(dpdpConsentRecords.principalRef, input.principalRef));
        if (input?.status) conditions.push(eq(dpdpConsentRecords.status, input.status));
        if (input?.purpose) conditions.push(eq(dpdpConsentRecords.purpose, input.purpose));
        return db
          .select()
          .from(dpdpConsentRecords)
          .where(and(...conditions))
          .orderBy(desc(dpdpConsentRecords.updatedAt));
      }),

    // ── Get one (with ledger) ─────────────────────────────────────────────────
    get: permissionProcedure("compliance", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [record] = await db
          .select()
          .from(dpdpConsentRecords)
          .where(and(eq(dpdpConsentRecords.id, input.id), eq(dpdpConsentRecords.orgId, org!.id)))
          .limit(1);
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Consent not found" });
        const events = await db
          .select()
          .from(dpdpConsentEvents)
          .where(eq(dpdpConsentEvents.consentId, input.id))
          .orderBy(asc(dpdpConsentEvents.createdAt));
        return { ...record, events };
      }),

    // ── Grant (or re-grant / renew) consent ───────────────────────────────────
    // Idempotent per (principalRef, purpose): a fresh grant on an existing record
    // renews it (bumps version, records a "renewed" ledger event); a new
    // (principal, purpose) inserts a "granted" event.
    grant: permissionProcedure("compliance", "write")
      .input(
        z.object({
          principalRef: z.string().min(1).max(320),
          principalName: z.string().max(200).optional(),
          purpose: z.string().min(1).max(200),
          lawfulBasis: z.string().max(100).default("consent"),
          processingActivityId: z.string().uuid().optional(),
          consentArtifact: z.string().max(200).optional(),
          channel: z.string().max(60).optional(),
          expiresAt: z.string().datetime().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
        return db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(dpdpConsentRecords)
            .where(
              and(
                eq(dpdpConsentRecords.orgId, org!.id),
                eq(dpdpConsentRecords.principalRef, input.principalRef),
                eq(dpdpConsentRecords.purpose, input.purpose),
              ),
            )
            .limit(1);

          if (existing) {
            const nextVersion = existing.version + 1;
            const [row] = await tx
              .update(dpdpConsentRecords)
              .set({
                status: "granted",
                principalName: input.principalName ?? existing.principalName,
                lawfulBasis: input.lawfulBasis,
                processingActivityId: input.processingActivityId ?? existing.processingActivityId,
                consentArtifact: input.consentArtifact ?? existing.consentArtifact,
                version: nextVersion,
                grantedAt: new Date(),
                expiresAt,
                withdrawnAt: null,
                updatedAt: new Date(),
              })
              .where(eq(dpdpConsentRecords.id, existing.id))
              .returning();
            await tx.insert(dpdpConsentEvents).values({
              orgId: org!.id,
              consentId: existing.id,
              eventType: "renewed",
              fromStatus: existing.status,
              toStatus: "granted",
              version: nextVersion,
              channel: input.channel,
              actorUserId: (user?.id as string) ?? null,
            });
            return row!;
          }

          const [row] = await tx
            .insert(dpdpConsentRecords)
            .values({
              orgId: org!.id,
              principalRef: input.principalRef,
              principalName: input.principalName,
              purpose: input.purpose,
              lawfulBasis: input.lawfulBasis,
              processingActivityId: input.processingActivityId,
              consentArtifact: input.consentArtifact,
              status: "granted",
              version: 1,
              expiresAt,
            })
            .returning();
          await tx.insert(dpdpConsentEvents).values({
            orgId: org!.id,
            consentId: row!.id,
            eventType: "granted",
            toStatus: "granted",
            version: 1,
            channel: input.channel,
            actorUserId: (user?.id as string) ?? null,
          });
          return row!;
        });
      }),

    // ── Withdraw consent (§6(4): as easy to withdraw as to give) ──────────────
    withdraw: permissionProcedure("compliance", "write")
      .input(
        z.object({
          id: z.string().uuid(),
          reason: z.string().max(2000).optional(),
          channel: z.string().max(60).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        return db.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(dpdpConsentRecords)
            .where(
              and(eq(dpdpConsentRecords.id, input.id), eq(dpdpConsentRecords.orgId, org!.id)),
            )
            .limit(1);
          if (!current)
            throw new TRPCError({ code: "NOT_FOUND", message: "Consent not found" });
          if (current.status === "withdrawn") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Consent already withdrawn" });
          }
          const [row] = await tx
            .update(dpdpConsentRecords)
            .set({ status: "withdrawn", withdrawnAt: new Date(), updatedAt: new Date() })
            .where(eq(dpdpConsentRecords.id, input.id))
            .returning();
          await tx.insert(dpdpConsentEvents).values({
            orgId: org!.id,
            consentId: input.id,
            eventType: "withdrawn",
            fromStatus: current.status,
            toStatus: "withdrawn",
            reason: input.reason,
            channel: input.channel,
            actorUserId: (user?.id as string) ?? null,
          });
          return row!;
        });
      }),

    // ── Expire lapsed consents (past expiresAt while still granted) ───────────
    // Idempotent sweep — safe to call from a scheduled worker.
    expireLapsed: permissionProcedure("compliance", "write").mutation(async ({ ctx }) => {
      const { db, org, user } = ctx;
      return db.transaction(async (tx) => {
        const lapsed = await tx
          .select({ id: dpdpConsentRecords.id, status: dpdpConsentRecords.status })
          .from(dpdpConsentRecords)
          .where(
            and(
              eq(dpdpConsentRecords.orgId, org!.id),
              eq(dpdpConsentRecords.status, "granted"),
              sql`${dpdpConsentRecords.expiresAt} IS NOT NULL`,
              sql`${dpdpConsentRecords.expiresAt} < now()`,
            ),
          );
        for (const row of lapsed) {
          await tx
            .update(dpdpConsentRecords)
            .set({ status: "expired", updatedAt: new Date() })
            .where(eq(dpdpConsentRecords.id, row.id));
          await tx.insert(dpdpConsentEvents).values({
            orgId: org!.id,
            consentId: row.id,
            eventType: "expired",
            fromStatus: "granted",
            toStatus: "expired",
            channel: "system",
            actorUserId: (user?.id as string) ?? null,
          });
        }
        return { expired: lapsed.length };
      });
    }),
  }),

  // ══ Breach register (DPDP §8(6)) ═══════════════════════════════════════════
  breach: router({
    // ── List / filter ─────────────────────────────────────────────────────────
    list: permissionProcedure("compliance", "read")
      .input(
        z
          .object({
            status: z.enum(breachStatusEnum.enumValues).optional(),
            severity: z.enum(breachSeverityEnum.enumValues).optional(),
            overdueOnly: z.boolean().optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(dpdpBreachIncidents.orgId, org!.id)];
        if (input?.status) conditions.push(eq(dpdpBreachIncidents.status, input.status));
        if (input?.severity) conditions.push(eq(dpdpBreachIncidents.severity, input.severity));
        if (input?.overdueOnly) {
          // "overdue" = not yet notified and past the notify clock
          conditions.push(sql`${dpdpBreachIncidents.principalsNotifiedAt} IS NULL`);
          conditions.push(sql`${dpdpBreachIncidents.notifyDueAt} < now()`);
          conditions.push(sql`${dpdpBreachIncidents.closedAt} IS NULL`);
        }
        return db
          .select()
          .from(dpdpBreachIncidents)
          .where(and(...conditions))
          .orderBy(asc(dpdpBreachIncidents.notifyDueAt));
      }),

    // ── Get one (with event trail) ───────────────────────────────────────────
    get: permissionProcedure("compliance", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db
          .select()
          .from(dpdpBreachIncidents)
          .where(
            and(eq(dpdpBreachIncidents.id, input.id), eq(dpdpBreachIncidents.orgId, org!.id)),
          )
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Breach not found" });
        const events = await db
          .select()
          .from(dpdpBreachEvents)
          .where(eq(dpdpBreachEvents.breachId, input.id))
          .orderBy(asc(dpdpBreachEvents.createdAt));
        return { ...row, events };
      }),

    // ── Intake — derives the notify clock from the jurisdiction profile ───────
    create: permissionProcedure("compliance", "write")
      .input(
        z.object({
          title: z.string().min(1).max(300),
          description: z.string().max(4000).optional(),
          severity: z.enum(breachSeverityEnum.enumValues).default("medium"),
          jurisdictionCode: z.string().min(2).max(10).default("IN"),
          affectedDataPrincipals: z.number().int().min(0).optional(),
          dataCategories: z.string().max(2000).optional(),
          linkedSecurityIncidentId: z.string().uuid().optional(),
          assignedToUserId: z.string().uuid().optional(),
          occurredAt: z.string().datetime().optional(),
          detectedAt: z.string().datetime().optional(),
          notificationWindowHours: z.number().int().min(1).max(8760).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const detectedAt = input.detectedAt ? new Date(input.detectedAt) : new Date();

        // Resolve the notification window: explicit override → jurisdiction
        // profile → statutory default (72h).
        let windowHours = input.notificationWindowHours;
        if (windowHours == null) {
          const [profile] = await db
            .select({ hours: privacyBreachNotificationProfiles.notificationOffsetHours })
            .from(privacyBreachNotificationProfiles)
            .where(
              and(
                eq(privacyBreachNotificationProfiles.orgId, org!.id),
                eq(privacyBreachNotificationProfiles.jurisdictionCode, input.jurisdictionCode),
              ),
            )
            .limit(1);
          windowHours = profile?.hours ?? 72;
        }
        const notifyDueAt = new Date(detectedAt.getTime() + windowHours * 60 * 60 * 1000);
        const reference = await nextReference(
          db,
          org!.id,
          dpdpBreachIncidents,
          dpdpBreachIncidents.reference,
          "BR",
        );

        return db.transaction(async (tx) => {
          const [row] = await tx
            .insert(dpdpBreachIncidents)
            .values({
              orgId: org!.id,
              reference,
              title: input.title,
              description: input.description,
              severity: input.severity,
              status: "detected",
              jurisdictionCode: input.jurisdictionCode,
              affectedDataPrincipals: input.affectedDataPrincipals,
              dataCategories: input.dataCategories,
              linkedSecurityIncidentId: input.linkedSecurityIncidentId,
              assignedToUserId: input.assignedToUserId,
              occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
              detectedAt,
              notificationWindowHours: windowHours,
              notifyDueAt,
            })
            .returning();
          await tx.insert(dpdpBreachEvents).values({
            orgId: org!.id,
            breachId: row!.id,
            eventType: "created",
            toStatus: "detected",
            note: `Breach ${reference} logged (${input.severity}); notify due within ${windowHours}h`,
            actorUserId: (user?.id as string) ?? null,
          });
          return row!;
        });
      }),

    // ── Assign / reassign investigator ────────────────────────────────────────
    assign: permissionProcedure("compliance", "write")
      .input(z.object({ id: z.string().uuid(), assignedToUserId: z.string().uuid().nullable() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(dpdpBreachIncidents)
            .set({ assignedToUserId: input.assignedToUserId, updatedAt: new Date() })
            .where(
              and(eq(dpdpBreachIncidents.id, input.id), eq(dpdpBreachIncidents.orgId, org!.id)),
            )
            .returning();
          if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Breach not found" });
          await tx.insert(dpdpBreachEvents).values({
            orgId: org!.id,
            breachId: row.id,
            eventType: "assigned",
            note: input.assignedToUserId ? "Assigned investigator" : "Unassigned",
            actorUserId: (user?.id as string) ?? null,
          });
          return row;
        });
      }),

    // ── State machine transition ──────────────────────────────────────────────
    // Stamps the appropriate clock column as the breach moves through the
    // notification workflow (notified → principalsNotifiedAt/boardNotifiedAt,
    // contained → containedAt, closed → closedAt).
    transition: permissionProcedure("compliance", "write")
      .input(
        z.object({
          id: z.string().uuid(),
          toStatus: z.enum(breachStatusEnum.enumValues),
          note: z.string().max(4000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        return db.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(dpdpBreachIncidents)
            .where(
              and(eq(dpdpBreachIncidents.id, input.id), eq(dpdpBreachIncidents.orgId, org!.id)),
            )
            .limit(1);
          if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Breach not found" });

          const from = current.status as BreachStatus;
          const to = input.toStatus;
          if (from === to) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Breach is already ${to}` });
          }
          const allowed = BREACH_TRANSITIONS[from] ?? [];
          if (!allowed.includes(to)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Invalid breach transition ${from} → ${to}`,
            });
          }

          const now = new Date();
          const patch: Record<string, unknown> = { status: to, updatedAt: now };
          if (to === "notified") {
            // both audiences are considered notified when the workflow reaches "notified"
            if (!current.boardNotifiedAt) patch["boardNotifiedAt"] = now;
            if (!current.principalsNotifiedAt) patch["principalsNotifiedAt"] = now;
          }
          if (to === "contained" && !current.containedAt) patch["containedAt"] = now;
          if (to === "closed") patch["closedAt"] = now;

          const [row] = await tx
            .update(dpdpBreachIncidents)
            .set(patch)
            .where(eq(dpdpBreachIncidents.id, input.id))
            .returning();
          await tx.insert(dpdpBreachEvents).values({
            orgId: org!.id,
            breachId: input.id,
            eventType: "status_changed",
            fromStatus: from,
            toStatus: to,
            note: input.note ?? `${from} → ${to}`,
            actorUserId: (user?.id as string) ?? null,
          });
          return row!;
        });
      }),

    // ── Record a notification (Board and/or affected Principals) ──────────────
    notify: permissionProcedure("compliance", "write")
      .input(
        z.object({
          id: z.string().uuid(),
          audience: z.enum(["board", "principals", "both"]),
          note: z.string().max(4000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        return db.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(dpdpBreachIncidents)
            .where(
              and(eq(dpdpBreachIncidents.id, input.id), eq(dpdpBreachIncidents.orgId, org!.id)),
            )
            .limit(1);
          if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Breach not found" });

          const now = new Date();
          const patch: Record<string, unknown> = { updatedAt: now };
          if (input.audience === "board" || input.audience === "both")
            patch["boardNotifiedAt"] = now;
          if (input.audience === "principals" || input.audience === "both")
            patch["principalsNotifiedAt"] = now;

          const [row] = await tx
            .update(dpdpBreachIncidents)
            .set(patch)
            .where(eq(dpdpBreachIncidents.id, input.id))
            .returning();
          await tx.insert(dpdpBreachEvents).values({
            orgId: org!.id,
            breachId: input.id,
            eventType:
              input.audience === "board"
                ? "board_notified"
                : input.audience === "principals"
                  ? "principals_notified"
                  : "notified",
            note: input.note ?? `Notified: ${input.audience}`,
            actorUserId: (user?.id as string) ?? null,
          });
          return row!;
        });
      }),

    // ── Free-form note (no status change) ─────────────────────────────────────
    addNote: permissionProcedure("compliance", "write")
      .input(z.object({ id: z.string().uuid(), note: z.string().min(1).max(4000) }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const [exists] = await db
          .select({ id: dpdpBreachIncidents.id })
          .from(dpdpBreachIncidents)
          .where(
            and(eq(dpdpBreachIncidents.id, input.id), eq(dpdpBreachIncidents.orgId, org!.id)),
          )
          .limit(1);
        if (!exists) throw new TRPCError({ code: "NOT_FOUND", message: "Breach not found" });
        const [ev] = await db
          .insert(dpdpBreachEvents)
          .values({
            orgId: org!.id,
            breachId: input.id,
            eventType: "note",
            note: input.note,
            actorUserId: (user?.id as string) ?? null,
          })
          .returning();
        return ev!;
      }),

    // ── SLA summary (open / overdue / due-soon / notified / closed) ───────────
    slaSummary: permissionProcedure("compliance", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;
      const rows = await db
        .select({
          status: dpdpBreachIncidents.status,
          notifyDueAt: dpdpBreachIncidents.notifyDueAt,
          principalsNotifiedAt: dpdpBreachIncidents.principalsNotifiedAt,
          closedAt: dpdpBreachIncidents.closedAt,
        })
        .from(dpdpBreachIncidents)
        .where(eq(dpdpBreachIncidents.orgId, org!.id));

      const now = Date.now();
      const soonMs = 24 * 60 * 60 * 1000; // breach clocks are tight — "soon" = 24h
      let open = 0;
      let overdue = 0;
      let dueSoon = 0;
      let closed = 0;
      for (const r of rows) {
        if (r.closedAt || r.status === "closed") {
          closed++;
          continue;
        }
        open++;
        // once principals are notified the statutory clock is satisfied
        if (r.principalsNotifiedAt) continue;
        const due = new Date(r.notifyDueAt).getTime();
        if (due < now) overdue++;
        else if (due - now <= soonMs) dueSoon++;
      }
      return { total: rows.length, open, overdue, dueSoon, closed };
    }),
  }),
});
