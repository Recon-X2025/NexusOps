/**
 * itom-correlation.ts — ITOM suppression + correlation engine (Sprint 3.4b).
 *
 * Fires the ITOM automation loop that was previously "stored but never
 * evaluated": suppression rules (`itom_suppression_rules`) and correlation
 * policies (`itom_correlation_policies`) hold free-text conditions that this
 * module now parses (via ../lib/itom-condition) and evaluates against events,
 * auto-creating an incident (and populating `itom_events.linked_incident_id`)
 * when a `create_incident` policy matches.
 *
 * Contract: none of these functions throw to their caller. A malformed
 * condition, a missing chain, or a per-event failure is logged and skipped so
 * that ingestion and the periodic sweep can never crash the request.
 */
import type { Db } from "@coheronconnect/db";
import {
  itomEvents,
  itomSuppressionRules,
  itomCorrelationPolicies,
  tickets,
  ticketStatuses,
  ticketPriorities,
  organizations,
  users,
  eq,
  and,
  asc,
  isNull,
  or,
  gt,
} from "@coheronconnect/db";
import { matchesCondition, type EvaluableEvent } from "../lib/itom-condition";
import { getNextSeq } from "../lib/auto-number";
import { ensureDefaultTicketStatusesForOrg } from "../lib/ensure-ticket-workflow";
import { emitDomainEvent } from "./workflow-events";

/** The minimal event shape the correlation engine reads. */
export interface CorrelatableEvent {
  id: string;
  orgId: string;
  node: string;
  metric: string;
  value: string | null;
  threshold: string | null;
  severity: string;
  state: string;
  count: number;
  linkedIncidentId: string | null;
}

function toEvaluable(event: CorrelatableEvent): EvaluableEvent {
  return {
    count: event.count,
    severity: event.severity,
    node: event.node,
    metric: event.metric,
    state: event.state,
    value: event.value,
    threshold: event.threshold,
  };
}

function generateTicketNumber(orgSlug: string, seq: number): string {
  const prefix = orgSlug.toUpperCase().replace(/-/g, "").slice(0, 4);
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

/**
 * Create an incident ticket from a system actor (no interactive user). Reuses
 * the org counter + ticket-number format used by tickets.create, resolves a
 * default "open" status (bootstrapping the workflow if the org has none) and a
 * requester (org admin, else any org user — `tickets.requester_id` is NOT NULL
 * with RESTRICT). Fires a `ticket_created` domain event post-insert so the
 * Sprint 3 automation loop (workflows + webhooks) still sees it.
 *
 * Returns the new ticket id, or null when the org has no user to attribute the
 * incident to (in which case the caller logs and skips).
 */
export async function createIncidentFromSystem(
  db: Db,
  params: {
    orgId: string;
    title: string;
    description?: string;
    isMajorIncident?: boolean;
    deploymentId?: string;
    intakeChannel?: string;
    source?: string;
  },
): Promise<string | null> {
  const { orgId } = params;

  const [orgRow] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!orgRow) return null;

  // Requester: prefer an admin, else the earliest-created user in the org.
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.role, "admin")))
    .orderBy(asc(users.createdAt))
    .limit(1);
  let requesterId = admin?.id ?? null;
  if (!requesterId) {
    const [anyUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.orgId, orgId))
      .orderBy(asc(users.createdAt))
      .limit(1);
    requesterId = anyUser?.id ?? null;
  }
  if (!requesterId) return null; // no user to attribute the incident to

  // Default "open" status (bootstrap if the org was created without seed data).
  let [openStatus] = await db
    .select({ id: ticketStatuses.id })
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.category, "open")))
    .limit(1);
  if (!openStatus) {
    await ensureDefaultTicketStatusesForOrg(db, orgId);
    [openStatus] = await db
      .select({ id: ticketStatuses.id })
      .from(ticketStatuses)
      .where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.category, "open")))
      .limit(1);
  }
  if (!openStatus) return null;

  // Highest-severity priority (lowest sort_order), if the org has any.
  const [priority] = await db
    .select({ id: ticketPriorities.id })
    .from(ticketPriorities)
    .where(eq(ticketPriorities.orgId, orgId))
    .orderBy(asc(ticketPriorities.sortOrder))
    .limit(1);

  const seq = await getNextSeq(db, orgId, "TKT");
  const number = generateTicketNumber(orgRow.slug, seq);

  const [ticket] = await db
    .insert(tickets)
    .values({
      orgId,
      number,
      title: params.title,
      description: params.description ?? null,
      priorityId: priority?.id ?? null,
      statusId: openStatus.id,
      type: "incident",
      requesterId,
      isMajorIncident: params.isMajorIncident ?? false,
      deploymentId: params.deploymentId ?? null,
      intakeChannel: params.intakeChannel ?? "monitoring",
    })
    .returning({ id: tickets.id });

  if (!ticket) return null;

  // Reuse the Sprint 3.1 bus so downstream workflows/webhooks still fire.
  void emitDomainEvent(db, {
    orgId,
    type: "ticket_created",
    payload: { ticketId: ticket.id, source: params.source ?? "itom" },
  });

  return ticket.id;
}

/**
 * Evaluate active suppression rules against an event. On the first matching
 * rule, set the event state to "suppressed" and return true. Rules with a
 * `suppressUntil` in the past are inactive. Never throws.
 */
export async function applySuppression(
  db: Db,
  orgId: string,
  event: CorrelatableEvent,
): Promise<boolean> {
  const rules = await db
    .select({ id: itomSuppressionRules.id, condition: itomSuppressionRules.condition })
    .from(itomSuppressionRules)
    .where(
      and(
        eq(itomSuppressionRules.orgId, orgId),
        eq(itomSuppressionRules.active, true),
        or(
          isNull(itomSuppressionRules.suppressUntil),
          gt(itomSuppressionRules.suppressUntil, new Date()),
        ),
      ),
    );

  const evaluable = toEvaluable(event);
  for (const rule of rules) {
    let matched = false;
    try {
      matched = matchesCondition(rule.condition, evaluable);
    } catch (err) {
      console.warn("[itom] suppression rule eval failed", rule.id, (err as Error).message);
      continue;
    }
    if (matched) {
      await db
        .update(itomEvents)
        .set({ state: "suppressed", updatedAt: new Date() })
        .where(eq(itomEvents.id, event.id));
      return true;
    }
  }
  return false;
}

export interface CorrelationOutcome {
  action: string;
  incidentId?: string;
}

/**
 * Evaluate active correlation policies against an event. On the first matching
 * policy, execute its action:
 *   - "create_incident": auto-create an incident (unless already linked) and set
 *     `linked_incident_id`.
 *   - "suppress": set state to "suppressed".
 * Returns the outcome, or null when no policy matched. Never throws.
 */
export async function applyCorrelation(
  db: Db,
  orgId: string,
  event: CorrelatableEvent,
): Promise<CorrelationOutcome | null> {
  const policies = await db
    .select({
      id: itomCorrelationPolicies.id,
      condition: itomCorrelationPolicies.condition,
      action: itomCorrelationPolicies.action,
    })
    .from(itomCorrelationPolicies)
    .where(and(eq(itomCorrelationPolicies.orgId, orgId), eq(itomCorrelationPolicies.active, true)))
    .orderBy(asc(itomCorrelationPolicies.name));

  const evaluable = toEvaluable(event);
  for (const policy of policies) {
    let matched = false;
    try {
      matched = matchesCondition(policy.condition, evaluable);
    } catch (err) {
      console.warn("[itom] correlation policy eval failed", policy.id, (err as Error).message);
      continue;
    }
    if (!matched) continue;

    const action = policy.action.trim().toLowerCase();
    if (action === "create_incident") {
      if (event.linkedIncidentId) return { action, incidentId: event.linkedIncidentId };
      const incidentId = await createIncidentFromSystem(db, {
        orgId,
        title: `${event.severity.toUpperCase()}: ${event.metric} on ${event.node}`,
        description:
          `Auto-created by ITOM correlation policy "${policy.id}".\n` +
          `Node: ${event.node}\nMetric: ${event.metric}\n` +
          `Value: ${event.value ?? "-"} / Threshold: ${event.threshold ?? "-"}\n` +
          `Occurrences: ${event.count}`,
        isMajorIncident: event.severity === "critical",
      });
      if (incidentId) {
        await db
          .update(itomEvents)
          .set({ linkedIncidentId: incidentId, state: "in_progress", updatedAt: new Date() })
          .where(eq(itomEvents.id, event.id));
        return { action, incidentId };
      }
      return { action };
    }

    if (action === "suppress") {
      await db
        .update(itomEvents)
        .set({ state: "suppressed", updatedAt: new Date() })
        .where(eq(itomEvents.id, event.id));
      return { action };
    }

    console.warn("[itom] unknown correlation action", policy.id, policy.action);
    return { action };
  }
  return null;
}

/**
 * Run suppression then correlation for a single event. Suppression short-circuits
 * correlation. Never throws.
 */
export async function evaluateEvent(
  db: Db,
  orgId: string,
  event: CorrelatableEvent,
): Promise<{ suppressed: boolean; correlation: CorrelationOutcome | null }> {
  try {
    const suppressed = await applySuppression(db, orgId, event);
    if (suppressed) return { suppressed: true, correlation: null };
    const correlation = await applyCorrelation(db, orgId, event);
    return { suppressed: false, correlation };
  } catch (err) {
    console.error("[itom] evaluateEvent failed", event.id, (err as Error).message);
    return { suppressed: false, correlation: null };
  }
}
