/**
 * CSAT loop on ticket resolve (SMB deal-blocker Story 4 / backlog P1-10).
 *
 * Extracted from `routers/tickets.ts` so the resolve-time trigger is a single
 * reusable, testable unit and so per-org `csat_settings` config is enforced in
 * one place. Behaviour is BEST-EFFORT: this never throws to the caller and
 * never rolls back the ticket update that triggered it (mirrors the PIR /
 * embedding post-commit hooks). All failures are logged and swallowed.
 *
 * Config enforced (from `csat_settings`, falling back to schema defaults):
 *   • enabled                — off ⇒ no invite, no notification.
 *   • channel                — in_app | email | both (email suppressed for in_app).
 *   • suppressionWindowHours — don't re-survey the same requester within N hours.
 *   • expiryDays             — invite deeplink validity.
 *
 * Re-survey policy: an invite is skipped if one already exists for THIS ticket
 * (one response per resolution) OR if the requester was surveyed within the
 * suppression window on ANY ticket. A re-opened+re-resolved ticket therefore
 * only re-surveys once the window has elapsed.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gte, desc } from "drizzle-orm";
import type { Db } from "@coheronconnect/db";
import { surveys, surveyInvites, csatSettings, users } from "@coheronconnect/db";
import { sendNotification } from "./notifications";

export interface CsatTriggerTicket {
  id: string;
  number: string;
  title: string;
  requesterId: string | null;
}

export interface CsatTriggerResult {
  triggered: boolean;
  reason?: "disabled" | "no_requester" | "existing_invite" | "suppressed" | "error";
  inviteId?: string;
}

const DEFAULT_SUPPRESSION_HOURS = 24;
const DEFAULT_EXPIRY_DAYS = 14;

/**
 * Fire the CSAT loop for a just-resolved ticket. Never throws.
 */
export async function triggerCsatForResolvedTicket(
  db: Db,
  args: { orgId: string; ticket: CsatTriggerTicket; createdById: string },
): Promise<CsatTriggerResult> {
  const { orgId, ticket, createdById } = args;
  try {
    // 1. Load per-org config (default to schema defaults when unset).
    const [settings] = await db
      .select()
      .from(csatSettings)
      .where(eq(csatSettings.orgId, orgId))
      .limit(1);

    const enabled = settings?.enabled ?? true;
    const channel = settings?.channel ?? "both";
    const suppressionWindowHours = settings?.suppressionWindowHours ?? DEFAULT_SUPPRESSION_HOURS;
    const expiryDays = settings?.expiryDays ?? DEFAULT_EXPIRY_DAYS;

    if (!enabled) return { triggered: false, reason: "disabled" };
    if (!ticket.requesterId) return { triggered: false, reason: "no_requester" };

    // 2. One response per resolution: skip if an invite already exists for this ticket.
    const [existingInvite] = await db
      .select({ id: surveyInvites.id })
      .from(surveyInvites)
      .where(and(eq(surveyInvites.orgId, orgId), eq(surveyInvites.ticketId, ticket.id)))
      .limit(1);
    if (existingInvite) return { triggered: false, reason: "existing_invite" };

    // 3. Suppression window: don't re-survey the same requester within N hours
    //    (across any ticket). 0 hours disables the window.
    if (suppressionWindowHours > 0) {
      const windowStart = new Date(Date.now() - suppressionWindowHours * 60 * 60 * 1000);
      const [recent] = await db
        .select({ id: surveyInvites.id })
        .from(surveyInvites)
        .where(
          and(
            eq(surveyInvites.orgId, orgId),
            eq(surveyInvites.requesterId, ticket.requesterId),
            gte(surveyInvites.createdAt, windowStart),
          ),
        )
        .orderBy(desc(surveyInvites.createdAt))
        .limit(1);
      if (recent) return { triggered: false, reason: "suppressed" };
    }

    // 4. Reuse an active CSAT survey or create the auto one.
    let [csat] = await db
      .select()
      .from(surveys)
      .where(and(eq(surveys.orgId, orgId), eq(surveys.type, "csat"), eq(surveys.status, "active")))
      .limit(1);

    if (!csat) {
      const [created] = await db
        .insert(surveys)
        .values({
          orgId,
          title: "Ticket CSAT (auto)",
          description: "Auto-triggered after ticket resolution.",
          type: "csat",
          status: "active",
          questions: [],
          triggerEvent: "ticket.resolved",
          createdById,
        })
        .returning();
      csat = created;
    }

    // 5. Mint a one-time public token + hashed invite row.
    const token = randomBytes(24).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const [invite] = await db
      .insert(surveyInvites)
      .values({
        orgId,
        surveyId: csat!.id,
        ticketId: ticket.id,
        requesterId: ticket.requesterId,
        tokenHash,
        status: "sent",
        expiresAt,
      })
      .returning({ id: surveyInvites.id });

    // 6. Notify per channel. sendNotification always writes the in-app row;
    //    email is only dispatched when we pass an address (channel email|both).
    let emailTo: string | undefined;
    if (channel === "email" || channel === "both") {
      const [reqUser] = await db
        .select({ email: users.email })
        .from(users)
        .where(and(eq(users.id, ticket.requesterId), eq(users.orgId, orgId)))
        .limit(1);
      emailTo = reqUser?.email ?? undefined;
    }

    await sendNotification(
      {
        orgId,
        userId: ticket.requesterId,
        title: `Rate your ticket experience: ${ticket.number}`,
        body: `How was the support you received for “${ticket.title}”? It takes 5 seconds.`,
        link: `/survey/${token}`,
        type: "info",
        sourceType: "ticket",
        sourceId: ticket.id,
      },
      emailTo,
    );

    return { triggered: true, inviteId: invite?.id };
  } catch (err) {
    console.warn("[csat] trigger failed (non-fatal):", err);
    return { triggered: false, reason: "error" };
  }
}
