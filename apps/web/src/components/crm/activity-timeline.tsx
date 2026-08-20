"use client";

/**
 * CrmActivityTimeline — ONE activity timeline, mounted on all four CRM records.
 *
 * `crm_activities` carries FOUR independent nullable FKs — deal_id, lead_id,
 * contact_id and account_id. They are not polymorphic and not exclusive: an
 * activity carried over by lead conversion legitimately holds several at once,
 * so the same row can appear on the lead, the deal and the account. That is the
 * intended behaviour, not double-counting.
 *
 * Before this, the deal page and the account page each hand-rolled their own
 * query + row mapping + empty message, and Contact and Lead had no timeline at
 * all — `crm_activities.lead_id` had a column, an FK, an index and an aggregate
 * feeding the Leads list, and no screen that showed it. One component now owns
 * the query, the mapping and the empty copy, so the four cannot drift.
 *
 * EXPECT MOST TIMELINES TO BE EMPTY. Measured in Phase 1: 8 of 9 dev accounts
 * and 63 of 81 test accounts have no activity of their own. Empty is the
 * CORRECT state — which is why each empty message names what would populate it
 * rather than implying something failed to load.
 */

import { Activity } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";

/**
 * Exactly one record, named. A union rather than four optional props so a
 * caller cannot pass none (which would list the whole org — the Phase 1 defect)
 * or two (which would silently AND them together).
 */
export type CrmActivityScope =
  | { dealId: string }
  | { accountId: string }
  | { contactId: string }
  | { leadId: string };

/** What would put a row here, per record. Named so an empty panel is legible. */
const EMPTY_COPY: Record<keyof CrmActivityScopeKeys, string> = {
  dealId:
    "No activity has been logged against this deal yet. Calls, emails and meetings appear here once they are logged against the deal, and history carried over from the lead it converted from appears here too.",
  accountId:
    "No activity has been logged against this account yet. Calls, emails and meetings appear here once they are logged against the account, or carried over when a lead converts.",
  contactId:
    "No activity has been logged against this contact yet. Calls, emails and meetings appear here once they are logged against this person.",
  leadId:
    "No activity has been logged against this lead yet. Calls, emails and meetings appear here once they are logged against the lead. Converting the lead does not move them away — they stay on the lead and also appear on the new deal.",
};

type CrmActivityScopeKeys = {
  dealId: string;
  accountId: string;
  contactId: string;
  leadId: string;
};

interface CrmActivityTimelineProps {
  scope: CrmActivityScope;
  /** Section heading. */
  title?: string;
  /** Rendered at the right of the header (e.g. a "+ Log Activity" control). */
  headerAction?: React.ReactNode;
  /** Cap the rows RENDERED. The query is always scoped; this only trims display. */
  max?: number;
  className?: string;
}

export function CrmActivityTimeline({
  scope,
  title = "Activity Timeline",
  headerAction,
  max,
  className,
}: CrmActivityTimelineProps) {
  const scopeKey = Object.keys(scope)[0] as keyof CrmActivityScopeKeys;

  /*
   * The scope object IS the filter. `activities.list` accepts all four keys as
   * of Phase 1 — before that, accountId and contactId were silently stripped by
   * zod and the procedure returned the whole org.
   */
  const q = trpc.crm.activities.list.useQuery({ ...scope, limit: 50 });

  const rows = q.data ?? [];
  const items: TimelineItem[] = (max ? rows.slice(0, max) : rows).map((a: any) => ({
    id: a.id,
    icon: Activity,
    title: a.subject,
    subtitle: a.description ?? "No description provided.",
    timestamp: a.createdAt,
    // ownerId is a uuid with no name join on this procedure; slicing it is a
    // placeholder, not an identifier — say so rather than printing a fake one.
    tags: [a.type, a.outcome].filter(Boolean) as string[],
  }));

  return (
    <Timeline
      className={className}
      items={items}
      isLoading={q.isLoading}
      emptyMessage={EMPTY_COPY[scopeKey]}
      emptyIcon={Activity}
      header={
        <div className="flex items-center justify-between">
          <h3 className="text-caption font-bold text-muted-foreground uppercase tracking-widest">
            {title}
          </h3>
          {headerAction}
        </div>
      }
    />
  );
}
