/**
 * Recruiter workbench payload.
 *
 * Aggregator across:
 *   • candidateApplications  — pipeline funnel by stage
 *   • interviews             — today's / this-week's interview load
 *   • jobOffers              — offers awaiting acceptance / expiring soon
 *
 * Primary visual: pipeline funnel + interview load (today's slots).
 */

import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  candidateApplications,
  candidates,
  interviews,
  jobOffers,
  jobRequisitions,
} from "@coheronconnect/db";
import {
  envelope,
  runPanel,
  type ActionQueueItem,
  type Panel,
  type WorkbenchEnvelope,
} from "./_shared";

export interface FunnelStage {
  stage: string;
  count: number;
}

export interface InterviewSlot {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduledAt: string;
  durationMins: number | null;
  candidateName: string | null;
  jobTitle: string | null;
}

export interface OfferRow {
  id: string;
  status: string;
  title: string;
  candidateName: string | null;
  expiryDate: string | null;
  startDate: string | null;
}

export interface RecruiterPayload extends WorkbenchEnvelope {
  funnel: Panel<FunnelStage[]>;
  interviewsToday: Panel<InterviewSlot[]>;
  offers: Panel<OfferRow[]>;
}

export async function buildRecruiterPayload({
  db,
  orgId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  orgId: string;
}): Promise<RecruiterPayload> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOf2Days = new Date(startOfDay.getTime() + 2 * 24 * 60 * 60 * 1000);

  const funnel = await runPanel<FunnelStage[]>("recruiter.funnel", async () => {
    const rows = await db
      .select({ stage: candidateApplications.stage })
      .from(candidateApplications)
      .where(eq(candidateApplications.orgId, orgId))
      .limit(2000);
    if (!rows.length) return null;
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.stage, (counts.get(r.stage) ?? 0) + 1);
    const order = ["applied", "screening", "phone_screen", "technical", "panel", "hr_round", "offer", "hired"];
    return order
      .map((stage) => ({ stage, count: counts.get(stage) ?? 0 }))
      .filter((s) => s.count > 0);
  });

  const interviewsToday = await runPanel<InterviewSlot[]>("recruiter.interviewsToday", async () => {
    const rows = await db
      .select({
        id: interviews.id,
        title: interviews.title,
        type: interviews.type,
        status: interviews.status,
        scheduledAt: interviews.scheduledAt,
        durationMins: interviews.durationMins,
        candidateFirst: candidates.firstName,
        candidateLast: candidates.lastName,
        jobTitle: jobRequisitions.title,
      })
      .from(interviews)
      .leftJoin(candidateApplications, eq(candidateApplications.id, interviews.applicationId))
      .leftJoin(candidates, eq(candidates.id, candidateApplications.candidateId))
      .leftJoin(jobRequisitions, eq(jobRequisitions.id, candidateApplications.jobId))
      .where(
        and(
          eq(interviews.orgId, orgId),
          gte(interviews.scheduledAt, startOfDay),
          lte(interviews.scheduledAt, endOf2Days),
        ),
      )
      .orderBy(asc(interviews.scheduledAt))
      .limit(15);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; title: string; type: string; status: string;
      scheduledAt: Date; durationMins: number | null;
      candidateFirst: string | null; candidateLast: string | null;
      jobTitle: string | null;
    }): InterviewSlot => ({
      id: r.id,
      title: r.title,
      type: r.type,
      status: r.status,
      scheduledAt: r.scheduledAt.toISOString(),
      durationMins: r.durationMins,
      candidateName: r.candidateFirst ? `${r.candidateFirst} ${r.candidateLast ?? ""}`.trim() : null,
      jobTitle: r.jobTitle,
    }));
  });

  const offers = await runPanel<OfferRow[]>("recruiter.offers", async () => {
    const rows = await db
      .select({
        id: jobOffers.id,
        status: jobOffers.status,
        title: jobOffers.title,
        expiryDate: jobOffers.expiryDate,
        startDate: jobOffers.startDate,
        candidateFirst: candidates.firstName,
        candidateLast: candidates.lastName,
      })
      .from(jobOffers)
      .leftJoin(candidates, eq(candidates.id, jobOffers.candidateId))
      .where(
        and(
          eq(jobOffers.orgId, orgId),
          inArray(jobOffers.status, ["sent", "draft"]),
        ),
      )
      .orderBy(desc(jobOffers.expiryDate))
      .limit(10);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; status: string; title: string;
      expiryDate: Date | null; startDate: Date | null;
      candidateFirst: string | null; candidateLast: string | null;
    }): OfferRow => ({
      id: r.id,
      status: r.status,
      title: r.title,
      candidateName: r.candidateFirst ? `${r.candidateFirst} ${r.candidateLast ?? ""}`.trim() : null,
      expiryDate: r.expiryDate ? r.expiryDate.toISOString() : null,
      startDate: r.startDate ? r.startDate.toISOString() : null,
    }));
  });

  const actions: ActionQueueItem[] = [];
  if (offers.state === "ok" && offers.data) {
    const expiring = offers.data
      .filter((o) => o.expiryDate && new Date(o.expiryDate).getTime() - now.getTime() < 5 * 24 * 60 * 60 * 1000)
      .slice(0, 3);
    for (const o of expiring) {
      actions.push({
        id: `offer-expiring:${o.id}`,
        label: `Offer expiring — ${o.title}`,
        hint: o.candidateName ?? undefined,
        severity: "warn",
        href: `/app/recruitment/offers/${o.id}`,
      });
    }
  }
  if (interviewsToday.state === "ok" && interviewsToday.data) {
    const unscheduled = interviewsToday.data.filter((i) => i.status === "scheduled" && !i.candidateName).slice(0, 2);
    for (const i of unscheduled) {
      actions.push({
        id: `interview-slot:${i.id}`,
        label: `Interview slot to fill — ${i.title}`,
        severity: "watch",
        href: "/app/recruitment/interviews",
      });
    }
  }

  return {
    ...envelope("recruiter", actions),
    funnel,
    interviewsToday,
    offers,
  };
}
