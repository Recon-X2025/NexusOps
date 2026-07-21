# `crm.executiveSummary` — response fields

Procedure: **`crm.executiveSummary`** (`apps/api/src/routers/crm.ts`) — **`accounts` / `read`**.

Returned object (JSON-serializable):

| Field | Type | Meaning |
|--------|------|--------|
| `openPipeline` | `{ count: number; value: string }` | Deals not in `closed_won` / `closed_lost`; `value` is decimal string (SQL sum). |
| `closedWon` | `{ count: number; value: string }` | Won deals; `value` sum as string. |
| `newLeads` | `number` | Leads with status `new`. |
| `pipelineByStage` | `{ stage: string; count: number; value: string }[]` | Grouped open pipeline by `crm_deals.stage`. |
| `recentDeals` | `deal[]` | Up to 5 rows, `updatedAt` desc. |
| `leads` | `{ open: number; openStaleOver7Days: number }` | Open = statuses `new` \| `contacted` \| `qualified`; stale = same set with `createdAt` older than 7 days. |

**Consumers:** Customer & Sales hub (`apps/web/src/app/app/customer-sales/page.tsx`); `crm.dashboardMetrics` may delegate to the same snapshot.
