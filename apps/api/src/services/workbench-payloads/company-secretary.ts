/**
 * Company Secretary workbench payload.
 *
 * Aggregator across:
 *   • secretarialFilings   — statutory filing calendar (with days-to-deadline)
 *   • boardMeetings        — upcoming board / committee meetings
 *   • boardResolutions     — drafts / passed-but-unattached resolutions
 *
 * Primary visual: compliance calendar (month grid with filings + meetings + days-to-deadline).
 */

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  secretarialFilings,
  boardMeetings,
  boardResolutions,
} from "@nexusops/db";
import {
  envelope,
  runPanel,
  type ActionQueueItem,
  type Panel,
  type WorkbenchEnvelope,
} from "./_shared";

export interface FilingRow {
  id: string;
  formNumber: string;
  title: string;
  authority: string;
  category: string;
  status: string;
  dueDate: string;
  daysToDeadline: number;
}

export interface MeetingRow {
  id: string;
  number: string;
  title: string;
  type: string;
  status: string;
  scheduledAt: string;
  venue: string | null;
}

export interface ResolutionRow {
  id: string;
  number: string;
  title: string;
  status: string;
  passedAt: string | null;
}

export interface CompanySecretaryPayload extends WorkbenchEnvelope {
  filings: Panel<FilingRow[]>;
  meetings: Panel<MeetingRow[]>;
  resolutions: Panel<ResolutionRow[]>;
}

export async function buildCompanySecretaryPayload({
  db,
  orgId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  orgId: string;
}): Promise<CompanySecretaryPayload> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const filings = await runPanel<FilingRow[]>("company-secretary.filings", async () => {
    const rows = await db
      .select({
        id: secretarialFilings.id,
        formNumber: secretarialFilings.formNumber,
        title: secretarialFilings.title,
        authority: secretarialFilings.authority,
        category: secretarialFilings.category,
        status: secretarialFilings.status,
        dueDate: secretarialFilings.dueDate,
      })
      .from(secretarialFilings)
      .where(
        and(
          eq(secretarialFilings.orgId, orgId),
          inArray(secretarialFilings.status, ["upcoming", "in_progress", "overdue"]),
          lte(secretarialFilings.dueDate, horizon),
        ),
      )
      .orderBy(asc(secretarialFilings.dueDate))
      .limit(40);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; formNumber: string; title: string;
      authority: string; category: string; status: string; dueDate: Date;
    }): FilingRow => ({
      id: r.id,
      formNumber: r.formNumber,
      title: r.title,
      authority: r.authority,
      category: r.category,
      status: r.status,
      dueDate: r.dueDate.toISOString(),
      daysToDeadline: Math.ceil((r.dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    }));
  });

  const meetings = await runPanel<MeetingRow[]>("company-secretary.meetings", async () => {
    const rows = await db
      .select({
        id: boardMeetings.id,
        number: boardMeetings.number,
        title: boardMeetings.title,
        type: boardMeetings.type,
        status: boardMeetings.status,
        scheduledAt: boardMeetings.scheduledAt,
        venue: boardMeetings.venue,
      })
      .from(boardMeetings)
      .where(
        and(
          eq(boardMeetings.orgId, orgId),
          gte(boardMeetings.scheduledAt, now),
          lte(boardMeetings.scheduledAt, horizon),
        ),
      )
      .orderBy(asc(boardMeetings.scheduledAt))
      .limit(15);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; number: string; title: string; type: string;
      status: string; scheduledAt: Date; venue: string | null;
    }): MeetingRow => ({
      id: r.id,
      number: r.number,
      title: r.title,
      type: r.type,
      status: r.status,
      scheduledAt: r.scheduledAt.toISOString(),
      venue: r.venue,
    }));
  });

  const resolutions = await runPanel<ResolutionRow[]>("company-secretary.resolutions", async () => {
    const rows = await db
      .select({
        id: boardResolutions.id,
        number: boardResolutions.number,
        title: boardResolutions.title,
        status: boardResolutions.status,
        passedAt: boardResolutions.passedAt,
      })
      .from(boardResolutions)
      .where(
        and(
          eq(boardResolutions.orgId, orgId),
          inArray(boardResolutions.status, ["draft", "passed"]),
        ),
      )
      .orderBy(asc(boardResolutions.number))
      .limit(15);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; number: string; title: string;
      status: string; passedAt: Date | null;
    }): ResolutionRow => ({
      id: r.id,
      number: r.number,
      title: r.title,
      status: r.status,
      passedAt: r.passedAt ? r.passedAt.toISOString() : null,
    }));
  });

  const actions: ActionQueueItem[] = [];
  if (filings.state === "ok" && filings.data) {
    const due = filings.data.filter((f) => f.daysToDeadline <= 14).slice(0, 4);
    for (const f of due) {
      actions.push({
        id: `filing:${f.id}`,
        label: `${f.formNumber} due in ${f.daysToDeadline}d`,
        hint: `${f.authority} · ${f.title}`,
        severity: f.daysToDeadline < 0 ? "breach" : f.daysToDeadline <= 3 ? "warn" : "watch",
        href: `/app/secretarial/filings/${f.id}`,
        dueAt: f.dueDate,
      });
    }
  }
  if (meetings.state === "ok" && meetings.data) {
    const drafting = meetings.data.filter((m) => m.status === "scheduled").slice(0, 2);
    for (const m of drafting) {
      actions.push({
        id: `boardpack:${m.id}`,
        label: `Board pack draft — ${m.number}`,
        hint: m.title,
        severity: "watch",
        href: `/app/secretarial/meetings/${m.id}`,
      });
    }
  }

  return {
    ...envelope("company-secretary", actions),
    filings,
    meetings,
    resolutions,
  };
}
