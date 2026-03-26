# NexusOps v2.1.0 → v3.0.0: Complete Gap-Fill Build Plan
## From Frontend Prototype to Production Platform

**Current state:** 28-module frontend with mock data, client-only RBAC, demo role-switcher, no backend.
**Target state:** Full-stack, multi-tenant, self-hosted + Coheron-managed production platform.
**Estimated timeline:** 15–18 weeks with Cursor AI. Every prompt is paste-ready.

---

## Gap Inventory

Before building, here's every gap mapped precisely to the existing codebase:

| Gap | Current State | Required State | Risk |
|---|---|---|---|
| Database | None. All data is `useState` + hardcoded objects | PostgreSQL 16 + Drizzle ORM, 80+ tables | CRITICAL |
| API Layer | None. No server routes | tRPC v11 inside Next.js App Router, 200+ procedures | CRITICAL |
| Authentication | Demo dropdown in `app-header.tsx` swapping mock users | Better Auth: email/password, magic link, Google OAuth, SAML SSO | CRITICAL |
| Multi-tenancy | None. Single implicit context | Row-level `org_id` on every table, tenant provisioning | CRITICAL |
| Server-side RBAC | Client-only `PermissionGate` in `rbac-context.tsx` | tRPC middleware enforcing permissions on every mutation | CRITICAL |
| Workflow Engine | `/app/flows` draws nodes in React Flow. No execution | Temporal.io: durable workflows, 11 node types, triggers, retries | HIGH |
| Search | No search backend | Meilisearch: full-text across all entities | HIGH |
| Real-time | None | SSE/WebSocket for dashboard live updates, notifications | HIGH |
| AI Layer | `virtual-agent-widget.tsx` uses if/else pattern matching | Claude API: classification, NL search, suggestions, conversational KB | HIGH |
| File Storage | None | S3-compatible (MinIO self-hosted, S3 managed) for attachments | MEDIUM |
| Integrations | Admin hub lists tools as static cards | Live: Slack, Email (SMTP+IMAP), Jira, SAP connectors | MEDIUM |
| Webhook System | None | Outgoing webhooks with delivery log, retry, HMAC signing | MEDIUM |
| Notifications | Notification bell is static | Email + in-app + Slack notification pipeline with preferences | MEDIUM |
| Audit Trail | `audit_logs` table designed but not wired | Every mutation writes to audit_logs with actor, diff, IP | MEDIUM |
| Deployment | `npm run dev` only | Docker images, Helm charts, Terraform, CI/CD, license key | MEDIUM |
| Testing | Zero tests | Vitest unit, integration, Playwright E2E, k6 load | MEDIUM |
| Documentation | None | Docs site (Nextra), API reference, self-hosted guides | LOW |
| Monitoring | None | OpenTelemetry traces, Grafana dashboards, health endpoints | LOW |

---

## PHASE 1: Foundation — Database, API, Auth, Multi-tenancy
### Weeks 1–3 · The skeleton everything else attaches to

---

### Prompt 1.1 — tRPC + Drizzle Setup Inside Existing Next.js App

```
I have an existing Next.js 14 App Router project at /apps/web/src with 28 module pages 
under /app/app/*. All data is currently mock (useState + hardcoded objects).

Set up the backend infrastructure INSIDE this existing Next.js app (no separate server):

1. tRPC v11 with Next.js App Router adapter:
   - src/server/trpc.ts — initTRPC with superjson transformer, context with session+db
   - src/server/routers/_app.ts — root appRouter merging all module routers
   - src/app/api/trpc/[trpc]/route.ts — Next.js API route handler
   - src/lib/trpc/react.tsx — TRPCProvider wrapping TanStack Query for client components
   - src/lib/trpc/server.ts — server-side caller for server components

2. Drizzle ORM + PostgreSQL:
   - src/server/db/index.ts — drizzle client using postgres-js driver
   - src/server/db/schema/ — directory for schema files (we'll add tables next)
   - drizzle.config.ts at project root
   - Add drizzle-kit to devDependencies

3. Update existing docker-compose.yml (or create one):
   - PostgreSQL 16 on port 5432
   - Redis 7 on port 6379
   - Meilisearch on port 7700

4. Environment:
   - DATABASE_URL=postgresql://nexusops:nexusops@localhost:5432/nexusops
   - REDIS_URL=redis://localhost:6379
   - MEILISEARCH_URL=http://localhost:7700
   - MEILISEARCH_KEY=nexusops_master_key

5. Update the existing app layout (src/app/app/layout.tsx):
   - Wrap children with TRPCProvider (alongside existing RBACProvider)
   - Keep VirtualAgentWidget and AppSidebar intact

DO NOT modify any existing page.tsx files yet. This is infrastructure only.
Ensure `npm run dev` still works with all existing pages rendering their mock data.
```

### Prompt 1.2 — Master Database Schema (All 28 Modules)

```
Create the complete Drizzle ORM schema for NexusOps covering all 28 modules.
Put each domain in its own file under src/server/db/schema/.

src/server/db/schema/tenants.ts:
- organizations (id uuid PK, name, slug unique, plan enum[free/starter/professional/enterprise],
  settings jsonb, logo_url, primary_color, domain, created_at, updated_at)

src/server/db/schema/auth.ts:
- users (id uuid, org_id FK organizations, email, name, avatar_url, 
  role enum matching existing 22 roles from rbac.ts, 
  status enum[active/invited/disabled], last_login_at, created_at, updated_at)
- sessions (id, user_id FK, token_hash, expires_at, ip_address, user_agent, created_at)
- api_keys (id, org_id, name, key_hash, permissions jsonb, last_used_at, expires_at)
- invitations (id, org_id, email, role, invited_by FK, token_hash, expires_at, accepted_at)

src/server/db/schema/rbac.ts:
- roles (id, org_id, name, description, is_system, is_elevated boolean, created_at)
- permissions (id, module text, action enum[read/write/delete/admin/approve/assign/close])
- role_permissions (role_id, permission_id) 
- user_roles (user_id, role_id)
Mirror the 22 roles and 35 module permissions from the existing src/lib/rbac.ts exactly.

src/server/db/schema/audit.ts:
- audit_logs (id, org_id, user_id, action, resource_type, resource_id, 
  changes jsonb, ip_address, user_agent, created_at)

src/server/db/schema/itsm.ts:
- ticket_categories (id, org_id, name, description, color, icon, parent_id self-ref, sort_order)
- ticket_priorities (id, org_id, name, color, sla_response_minutes, sla_resolve_minutes, sort_order)
- ticket_statuses (id, org_id, name, color, phase enum[open/in_progress/resolved/closed], 
  is_default, sort_order)
- tickets (id, org_id, number text, title, description text, category_id FK, priority_id FK, 
  status_id FK, type enum[incident/request/problem/change], requester_id FK users, 
  assignee_id FK users nullable, team_id FK nullable, due_date, resolved_at, closed_at,
  sla_breached boolean default false, sla_response_deadline timestamptz, sla_resolve_deadline timestamptz,
  tags text[], custom_fields jsonb, created_at, updated_at)
- ticket_comments (id, ticket_id FK, author_id FK users, body text, is_internal boolean,
  attachments jsonb, created_at, updated_at)
- ticket_watchers (ticket_id, user_id, PK composite)
- ticket_relations (id, source_ticket_id FK, target_ticket_id FK, 
  relation_type enum[blocks/blocked_by/duplicate/related])
- escalations (id, org_id, ticket_id FK, level int, escalated_to FK users, 
  reason text, escalated_at, resolved_at)
- sla_policies (id, org_id, name, conditions jsonb, response_minutes int, 
  resolve_minutes int, escalation_rules jsonb, is_active boolean)

src/server/db/schema/changes.ts:
- change_requests (id, org_id, number text, title, description, type enum[normal/standard/emergency/expedited],
  risk enum[low/medium/high/critical], status enum[draft/submitted/cab_review/approved/scheduled/
  implementing/completed/failed/cancelled], requester_id FK, assignee_id FK, 
  cab_decision text, scheduled_start, scheduled_end, actual_start, actual_end,
  rollback_plan text, created_at, updated_at)
- change_approvals (id, change_id FK, approver_id FK, decision enum[pending/approved/rejected],
  comments text, decided_at)

src/server/db/schema/problems.ts:
- problems (id, org_id, number, title, description, status enum[new/investigation/root_cause_identified/
  known_error/resolved/closed], priority_id FK, assignee_id FK, root_cause text, 
  workaround text, created_at, updated_at)
- problem_incident_links (problem_id, ticket_id)
- known_errors (id, org_id, problem_id FK, title, description, workaround, status, created_at)

src/server/db/schema/releases.ts:
- releases (id, org_id, name, version, status enum[planning/build/test/deploy/completed/cancelled],
  planned_date, actual_date, notes text, created_at)
- release_change_links (release_id, change_id)

src/server/db/schema/assets.ts:
- asset_types (id, org_id, name, icon, category enum[hardware/software/cloud/network],
  fields_schema jsonb, created_at)
- assets (id, org_id, asset_tag text unique, name, asset_type_id FK, 
  status enum[in_stock/deployed/maintenance/retired/disposed],
  owner_id FK users nullable, location text, department text,
  purchase_date, purchase_cost decimal(12,2), warranty_expiry date, vendor text,
  serial_number text, custom_fields jsonb, parent_asset_id self-ref nullable,
  created_at, updated_at)
- asset_history (id, asset_id FK, action text, actor_id FK users, details jsonb, created_at)
- ci_items (id, org_id, name, ci_type enum[server/application/database/network_device/service/
  cloud_resource/container/load_balancer], status enum[operational/degraded/down/planned/decommissioned],
  environment enum[production/staging/development/dr], 
  attributes jsonb, owner_id FK, team text, created_at, updated_at)
- ci_relationships (id, source_ci_id FK, target_ci_id FK,
  type enum[depends_on/runs_on/connected_to/member_of/hosts/backed_by])
- software_licenses (id, org_id, name, vendor, license_type enum[per_seat/per_device/site/enterprise/subscription],
  total_seats int, cost_per_unit decimal(10,2), renewal_date, notes text, created_at)
- license_assignments (id, license_id FK, asset_id FK nullable, user_id FK nullable, assigned_at)

src/server/db/schema/hr.ts:
- employees (id, org_id, user_id FK, employee_id text, department text, title text,
  manager_id self-ref nullable, start_date, employment_type enum[full_time/part_time/contractor/intern],
  location text, status enum[active/on_leave/offboarded], custom_fields jsonb, created_at, updated_at)
- hr_cases (id, org_id, case_number text, employee_id FK, 
  case_type enum[onboarding/offboarding/leave_request/policy_question/benefits/payroll/
  employee_relations/equipment_request/lifecycle_event/other],
  status enum[new/in_progress/pending/resolved/closed], assignee_id FK users, 
  priority enum[low/medium/high/critical], title, description text, resolution text,
  due_date, created_at, updated_at, resolved_at)
- hr_case_tasks (id, case_id FK, title, description text, assignee_id FK users,
  status enum[pending/in_progress/completed/skipped], due_date, sort_order int, completed_at)
- onboarding_templates (id, org_id, name, department text nullable,
  tasks jsonb, is_active boolean, created_at)
- leave_requests (id, employee_id FK, leave_type enum[vacation/sick/personal/parental/bereavement/
  compassionate/study/other], start_date, end_date, days_count decimal(4,1),
  status enum[pending/approved/rejected/cancelled], approver_id FK users nullable,
  approved_at, notes text, created_at)
- leave_balances (id, employee_id FK, leave_type text, year int, 
  total_days decimal(5,1), used_days decimal(5,1), pending_days decimal(5,1))
- employee_documents (id, employee_id FK, name, file_url text, category text, uploaded_by FK, created_at)
- payslips (id, employee_id FK, period_month int, period_year int, 
  gross decimal(12,2), deductions jsonb, net decimal(12,2), ytd_gross decimal(12,2),
  ytd_tax decimal(12,2), file_url text, created_at)

src/server/db/schema/security.ts:
- security_incidents (id, org_id, number text, title, description text,
  severity enum[critical/high/medium/low/informational],
  status enum[new/triage/containment/eradication/recovery/closed/false_positive],
  assignee_id FK, reporter_id FK, attack_vector text, 
  mitre_techniques text[], iocs jsonb, containment_actions jsonb,
  created_at, updated_at, resolved_at)
- vulnerabilities (id, org_id, cve_id text, title, description text,
  cvss_score decimal(3,1), severity enum[critical/high/medium/low/none],
  status enum[open/in_progress/remediated/accepted/false_positive],
  affected_assets jsonb, remediation text, assignee_id FK, 
  discovered_at, remediated_at, created_at)

src/server/db/schema/grc.ts:
- risks (id, org_id, number text, title, description text,
  category enum[operational/financial/strategic/compliance/technology/reputational],
  likelihood int CHECK 1-5, impact int CHECK 1-5, risk_score int generated,
  status enum[identified/assessed/mitigating/accepted/closed],
  treatment enum[accept/mitigate/transfer/avoid], owner_id FK users,
  review_date, controls jsonb, created_at, updated_at)
- policies (id, org_id, title, content text, version int, 
  status enum[draft/review/approved/published/retired],
  owner_id FK, review_cycle_months int, last_reviewed, next_review, created_at)
- audit_plans (id, org_id, title, scope text, status enum[planned/in_progress/completed/cancelled],
  auditor_id FK, findings jsonb, start_date, end_date, created_at)
- vendor_risks (id, org_id, vendor_name text, tier enum[critical/high/medium/low],
  risk_score int, questionnaire_status enum[not_sent/pending/completed/expired],
  last_assessed, next_assessment, findings jsonb, created_at)

src/server/db/schema/procurement.ts:
- vendors (id, org_id, name, contact_email, contact_phone, address text,
  payment_terms text, tax_id text, status enum[active/inactive/blocked],
  rating decimal(3,2), category text, notes text, created_at, updated_at)
- purchase_requisitions (id, org_id, pr_number text, requester_id FK, title, justification text,
  total_amount decimal(12,2), currency text default 'USD',
  status enum[draft/pending_approval/approved/rejected/ordered/received/closed],
  priority enum[low/medium/high/urgent], department text, budget_code text,
  approved_by FK nullable, approved_at, created_at, updated_at)
- pr_line_items (id, pr_id FK, description text, quantity int, unit_price decimal(10,2),
  vendor_id FK nullable, asset_type_id FK nullable)
- purchase_orders (id, org_id, po_number text, vendor_id FK, pr_id FK nullable,
  total_amount decimal(12,2), currency text, 
  status enum[draft/sent/acknowledged/partially_received/received/invoiced/paid/cancelled],
  expected_delivery date, shipping_address text, notes text, created_at, updated_at)
- po_line_items (id, po_id FK, description text, quantity int, unit_price decimal(10,2),
  received_quantity int default 0)
- goods_receipts (id, org_id, po_id FK, received_by FK, receipt_date, notes text,
  items jsonb, created_at)
- inventory_items (id, org_id, name, sku text, category text, 
  quantity_on_hand int, reorder_point int, reorder_quantity int,
  location text, unit_cost decimal(10,2), last_counted date, created_at, updated_at)

src/server/db/schema/financial.ts:
- budget_lines (id, org_id, category text, department text, fiscal_year int,
  budgeted decimal(12,2), committed decimal(12,2), actual decimal(12,2),
  forecast decimal(12,2), notes text, created_at, updated_at)
- invoices (id, org_id, invoice_number text, vendor_id FK nullable, customer_id FK nullable,
  po_id FK nullable, direction enum[payable/receivable],
  amount decimal(12,2), tax_amount decimal(12,2), total decimal(12,2),
  status enum[draft/pending/approved/paid/disputed/overdue/void],
  due_date, paid_at, payment_method text, created_at, updated_at)
- chargebacks (id, org_id, department text, service text, amount decimal(12,2),
  period_month int, period_year int, allocation_method text, created_at)

src/server/db/schema/contracts.ts:
- contracts (id, org_id, contract_number text, title, counterparty text,
  type enum[nda/msa/sow/license/customer_agreement/sla_support/colocation],
  status enum[draft/under_review/legal_review/awaiting_signature/active/
  expiring_soon/expired/terminated],
  value decimal(12,2), currency text, start_date, end_date, 
  auto_renew boolean, notice_period_days int, governing_law text,
  internal_owner_id FK, legal_owner_id FK,
  clauses jsonb, amendments jsonb, created_at, updated_at)
- contract_obligations (id, contract_id FK, title, party text, 
  frequency enum[one_time/monthly/quarterly/annually/ongoing],
  status enum[pending/compliant/overdue/completed], due_date, completed_at)

src/server/db/schema/projects.ts:
- projects (id, org_id, name, description text, status enum[planning/active/on_hold/completed/cancelled],
  phase text, health enum[green/amber/red], 
  budget_total decimal(12,2), budget_spent decimal(12,2),
  start_date, end_date, owner_id FK, created_at, updated_at)
- project_milestones (id, project_id FK, title, due_date, status enum[upcoming/in_progress/completed/missed],
  completed_at)
- project_tasks (id, project_id FK, milestone_id FK nullable, title, description text,
  assignee_id FK, status enum[backlog/todo/in_progress/in_review/done],
  priority enum[low/medium/high/critical], story_points int,
  sprint text, due_date, created_at, updated_at)

src/server/db/schema/crm.ts:
- crm_accounts (id, org_id, name, industry text, tier enum[enterprise/mid_market/smb],
  health_score int, annual_revenue decimal(14,2), website text, 
  billing_address text, credit_limit decimal(12,2),
  owner_id FK, created_at, updated_at)
- crm_contacts (id, org_id, account_id FK, first_name, last_name, email, phone text,
  title text, seniority enum[c_level/vp/director/manager/individual_contributor],
  do_not_contact boolean default false, created_at)
- crm_deals (id, org_id, title, account_id FK, contact_id FK nullable,
  stage enum[prospect/qualification/proposal/negotiation/verbal_commit/closed_won/closed_lost],
  value decimal(12,2), probability int, weighted_value decimal(12,2),
  expected_close date, owner_id FK, created_at, updated_at, closed_at)
- crm_leads (id, org_id, first_name, last_name, email, company text,
  source enum[website/referral/event/cold_outreach/partner/advertising/other],
  score int default 0, status enum[new/contacted/qualified/converted/disqualified],
  owner_id FK, converted_deal_id FK nullable, created_at, updated_at)
- crm_activities (id, org_id, type enum[call/email/meeting/demo/follow_up/note],
  subject text, description text, deal_id FK nullable, contact_id FK nullable,
  account_id FK nullable, owner_id FK, outcome text, 
  scheduled_at, completed_at, created_at)
- crm_quotes (id, org_id, deal_id FK, quote_number text, 
  status enum[draft/sent/accepted/rejected/expired],
  valid_until date, items jsonb, subtotal decimal(12,2), 
  discount_pct decimal(5,2), total decimal(12,2), created_at)

src/server/db/schema/csm.ts:
- csm_cases (id, org_id, case_number text, account_id FK crm_accounts, contact_id FK crm_contacts,
  title, description text, type text, priority_id FK ticket_priorities, 
  status enum[new/assigned/in_progress/pending_customer/resolved/closed],
  assignee_id FK, sla_response_deadline, sla_resolve_deadline,
  resolution text, csat_score int, created_at, updated_at, resolved_at)

src/server/db/schema/legal.ts:
- legal_matters (id, org_id, matter_number text, title, description text,
  type enum[litigation/employment/ip/regulatory/ma/data_privacy/corporate/commercial],
  status enum[intake/active/discovery/pre_trial/trial/closed/settled],
  phase text, confidential boolean default false,
  estimated_cost decimal(12,2), actual_cost decimal(12,2),
  assigned_to FK, created_at, updated_at, closed_at)
- legal_requests (id, org_id, requester_id FK, title, description text,
  type text, priority enum[low/medium/high/urgent],
  status enum[new/assigned/in_progress/completed/rejected],
  assigned_to FK, created_at, updated_at)
- investigations (id, org_id, title, type enum[ethics/harassment/fraud/data_breach/whistleblower/discrimination],
  status enum[reported/under_investigation/findings/closed],
  confidential boolean default true, anonymous_report boolean default false,
  investigator_id FK, findings text, created_at, updated_at, closed_at)

src/server/db/schema/facilities.ts:
- buildings (id, org_id, name, address text, floors int, capacity int,
  status enum[active/maintenance/closed], created_at)
- rooms (id, building_id FK, name, floor int, capacity int, 
  equipment text[], bookable boolean default true, created_at)
- room_bookings (id, room_id FK, booked_by FK, title text,
  start_time timestamptz, end_time timestamptz, status enum[confirmed/cancelled], created_at)
- move_requests (id, org_id, requester_id FK, from_location text, to_location text,
  status enum[requested/approved/scheduled/completed/cancelled],
  move_date, approved_by FK nullable, created_at)
- facility_requests (id, org_id, requester_id FK, type enum[maintenance/cleaning/catering/parking/other],
  title, description text, location text, priority enum[low/medium/high/urgent],
  status enum[new/assigned/in_progress/completed], assignee_id FK, created_at, updated_at)

src/server/db/schema/devops.ts:
- pipeline_runs (id, org_id, pipeline_name text, trigger text, branch text,
  status enum[running/success/failed/cancelled], commit_sha text,
  stages jsonb, started_at, completed_at, duration_seconds int)
- deployments (id, org_id, pipeline_run_id FK nullable, environment enum[dev/qa/staging/production],
  version text, status enum[pending/in_progress/success/failed/rolled_back],
  deployed_by FK, change_id FK nullable, started_at, completed_at)

src/server/db/schema/surveys.ts:
- surveys (id, org_id, title, type enum[csat/nps/employee_pulse/post_incident/onboarding/
  exit_interview/training/vendor_review], 
  status enum[draft/active/paused/completed], questions jsonb,
  trigger_event text, created_by FK, created_at, updated_at)
- survey_responses (id, survey_id FK, respondent_id FK users nullable,
  answers jsonb, score decimal(4,2), comments text, submitted_at)

src/server/db/schema/knowledge.ts:
- kb_articles (id, org_id, title, content text, category text, tags text[],
  status enum[draft/published/archived/under_review],
  author_id FK, view_count int default 0, helpful_count int default 0,
  version int default 1, created_at, updated_at)
- kb_feedback (id, article_id FK, user_id FK, helpful boolean, comment text, created_at)

src/server/db/schema/workflows.ts:
- workflows (id, org_id, name, description text,
  trigger_type enum[ticket_created/ticket_updated/ticket_status_changed/
  change_submitted/hr_case_created/pr_submitted/scheduled/manual/webhook],
  trigger_config jsonb, is_active boolean, version int default 1,
  created_by FK, created_at, updated_at)
- workflow_versions (id, workflow_id FK, version int, nodes jsonb, edges jsonb,
  published_at, published_by FK)
- workflow_runs (id, workflow_id FK, version int, trigger_data jsonb,
  status enum[queued/running/completed/failed/cancelled/timed_out],
  started_at, completed_at, error text)
- workflow_step_runs (id, run_id FK, node_id text, node_type text,
  status enum[pending/running/completed/failed/skipped],
  input jsonb, output jsonb, started_at, completed_at, error text, retry_count int default 0)

src/server/db/schema/approvals.ts:
- approval_requests (id, org_id, entity_type text, entity_id uuid, 
  title text, requested_by FK, status enum[pending/approved/rejected/cancelled],
  created_at, decided_at)
- approval_steps (id, request_id FK, approver_id FK, sequence int,
  status enum[pending/approved/rejected/skipped], comments text, decided_at)
- approval_chains (id, org_id, name, entity_type text,
  rules jsonb, created_at)

src/server/db/schema/notifications.ts:
- notifications (id, org_id, user_id FK, title, body text, link text,
  type enum[info/warning/success/error], is_read boolean default false,
  source_type text, source_id uuid, created_at)
- notification_preferences (id, user_id FK, channel enum[email/in_app/slack],
  event_type text, enabled boolean default true)

src/server/db/schema/integrations.ts:
- integrations (id, org_id, provider text, status enum[connected/disconnected/error],
  config_encrypted text, connected_by FK, connected_at, last_sync_at)
- integration_sync_log (id, integration_id FK, direction enum[inbound/outbound],
  entity_type text, records_synced int, errors jsonb, started_at, completed_at)
- webhooks (id, org_id, name, url text, events text[], secret text,
  is_active boolean, created_at)
- webhook_deliveries (id, webhook_id FK, event text, payload jsonb,
  response_status int, response_body text, attempts int default 0,
  next_retry_at, created_at)

src/server/db/schema/walkup.ts:
- walkup_visits (id, org_id, visitor_id FK users, location_id FK buildings nullable,
  issue_category text, queue_position int, status enum[waiting/in_service/completed/no_show],
  agent_id FK nullable, resolution text, csat_score int,
  wait_time_minutes int, service_time_minutes int, created_at, completed_at)
- walkup_appointments (id, org_id, user_id FK, location_id FK, agent_id FK nullable,
  scheduled_at timestamptz, status enum[booked/confirmed/completed/cancelled/no_show],
  issue_category text, notes text, created_at)

src/server/db/schema/apm.ts:
- applications (id, org_id, name, category text, 
  lifecycle enum[evaluating/investing/sustaining/harvesting/retiring/obsolete],
  health_score int, annual_cost decimal(12,2), users_count int,
  cloud_readiness enum[cloud_native/lift_shift/replatform/rearchitect/retire/not_assessed],
  tech_debt_score int, owner_id FK, department text, vendor text,
  created_at, updated_at)

src/server/db/schema/oncall.ts:
- oncall_schedules (id, org_id, name, team text, rotation_type enum[daily/weekly/custom],
  members jsonb, overrides jsonb, escalation_chain jsonb, created_at, updated_at)

src/server/db/schema/catalog.ts:
- catalog_items (id, org_id, name, description text, category text,
  icon text, price decimal(10,2) nullable, approval_required boolean,
  form_fields jsonb, fulfillment_group text, sla_days int,
  status enum[active/inactive/retired], sort_order int, created_at)
- catalog_requests (id, org_id, item_id FK, requester_id FK,
  form_data jsonb, status enum[submitted/pending_approval/approved/fulfilling/completed/rejected/cancelled],
  fulfiller_id FK nullable, approval_id FK nullable, created_at, updated_at)

src/server/db/schema/ai.ts:
- ai_usage_log (id, org_id, feature text, model text, tokens_in int, tokens_out int,
  latency_ms int, input_hash text, created_at)
- embeddings (id, org_id, entity_type text, entity_id uuid, 
  embedding vector(1536), content_hash text, created_at)

REQUIREMENTS:
- Every table has org_id FK (except organizations itself) — this is the multi-tenancy key
- UUIDs for all PKs using crypto.randomUUID() default via Drizzle
- created_at default now(), updated_at where applicable
- Proper indexes: (org_id) on every table, (org_id, number) on numbered entities,
  (org_id, status) for filterable tables, (org_id, created_at) for time-sorted
- Export all tables and enums from a barrel file: src/server/db/schema/index.ts
- pgEnum for every enum type
- Create src/server/db/seed.ts that populates ONE demo organization "Coheron Demo" with:
  - 1 admin user, 2 agents, 1 HR manager, 1 procurement analyst, 1 employee
  - 20 tickets across priorities, 5 change requests, 3 problems
  - 10 assets, 5 CI items with relationships, 3 licenses
  - 5 HR cases, 3 employees, leave balances
  - 3 vendors, 2 PRs, 1 PO
  - 5 contracts, 3 CRM accounts, 5 deals, 10 activities
  - 5 KB articles, 2 surveys
  Enough to make every module page render real data.
- Use decimal(12,2) for all money fields, not float
- Enable pgvector extension for the embeddings table
```

### Prompt 1.3 — Authentication System

```
Replace the demo role-switcher in NexusOps with real authentication using Better Auth.

1. Install and configure Better Auth (src/server/auth.ts):
   - Email/password with email verification
   - Magic link (passwordless)
   - Google OAuth
   - SAML SSO via Better Auth's enterprise SSO plugin
   - Organization plugin for multi-tenancy
   - Two-factor authentication plugin
   - Session management backed by our PostgreSQL (sessions table from schema)

2. Auth API routes:
   - src/app/api/auth/[...all]/route.ts — Better Auth handler

3. Auth pages (replace or add alongside existing):
   - src/app/(auth)/login/page.tsx — email+password, magic link tab, Google OAuth button,
     SSO domain detection (type email → detect corporate domain → redirect to SAML)
   - src/app/(auth)/signup/page.tsx — name, email, password, org name (creates org)
   - src/app/(auth)/invite/[token]/page.tsx — accept invitation
   - src/app/(auth)/forgot-password/page.tsx
   Use shadcn/ui components matching existing design system. Reference globals.css tokens.

4. Session middleware:
   - src/middleware.ts — Next.js middleware protecting all /app/* routes.
     If no valid session, redirect to /login. 
     Attach user + org to request context.

5. Update tRPC context (src/server/trpc.ts):
   - createTRPCContext reads session from cookies/headers
   - Every procedure has access to ctx.user, ctx.org, ctx.session
   - Create protectedProcedure that requires valid session
   - Create adminProcedure that requires admin role
   - Create permissionProcedure(module, action) factory that checks RBAC

6. Connect to existing RBAC:
   - Keep src/lib/rbac.ts and rbac-context.tsx but make them read from session
   - RBACProvider in layout.tsx now hydrates from server session instead of mock user
   - Remove the demo role-switcher from app-header.tsx in production mode 
     (keep it behind NEXT_PUBLIC_DEMO_MODE=true flag)

7. Invite flow:
   - Admin → /app/admin → User Management → Invite button
   - POST creates invitation record + sends email with link
   - Invited user clicks link → signup page pre-filled with email → joins org

8. API key auth:
   - Alternative auth for programmatic access
   - Bearer token in Authorization header
   - Hash stored in api_keys table
   - Separate middleware path in tRPC for API key sessions

DO NOT break existing page rendering. Pages should work for authenticated users
exactly as they do now, but pulling data from session instead of mock context.
```

### Prompt 1.4 — Server-Side RBAC Enforcement

```
The existing client-side RBAC in src/lib/rbac.ts defines 22 roles, 35 modules, 
and 7 actions. The PermissionGate component gates UI. But there is NO server-side 
enforcement — any API call bypasses it.

Fix this:

1. Create src/server/rbac.ts:
   - Import the permission matrix from the existing rbac.ts (or migrate it to DB)
   - Export: checkPermission(userRoles: string[], module: string, action: string): boolean
   - Export: requirePermission(module, action) — tRPC middleware that throws TRPCError 
     FORBIDDEN if user lacks permission
   - Export: requireAnyRole(...roles) — tRPC middleware for role-based checks
   - Export: requireAdmin() — shorthand for admin role check

2. Create the permissioned procedure factory in src/server/trpc.ts:
   - permissionProcedure(module, action) returns a procedure with the check baked in
   - Example usage:
     tickets: {
       list: protectedProcedure.query(...),  // any authenticated user
       create: permissionProcedure('incidents', 'write').mutation(...),
       delete: permissionProcedure('incidents', 'delete').mutation(...),
       adminConfig: permissionProcedure('incidents', 'admin').mutation(...),
     }

3. Apply to EVERY router that will be created:
   - Document the convention: every mutation MUST use permissionProcedure
   - Queries default to protectedProcedure (read access checked per module if needed)
   - Delete operations always require 'delete' permission
   - Admin/config operations require 'admin' permission

4. Audit log middleware:
   - Create a tRPC middleware that runs AFTER mutations
   - Automatically writes to audit_logs table: who, what action, which resource, what changed
   - Include IP address from request headers
   - Attach to all mutation procedures

5. Org-scoping middleware:
   - Every query/mutation automatically filters by ctx.org.id
   - No procedure can EVER return data from a different org
   - Create a reusable helper: withOrgScope(query, orgId) that adds WHERE org_id = $1
   - This is the multi-tenancy enforcement layer

Make sure the existing PermissionGate on the frontend and the new server-side checks
use the SAME permission matrix. The source of truth should be one shared definition.
```

### PHASE 1 — Test Suite

```
Write the Phase 1 test suite using Vitest + Playwright:

SCHEMA TESTS (src/server/db/__tests__/):
- All Drizzle schemas compile without error
- drizzle-kit generate produces valid SQL migration files
- Seed script runs against clean DB and creates all expected records
- Every table has org_id column (except organizations)
- Every enum type resolves correctly
- Indexes exist on (org_id) for all tables

AUTH TESTS (src/server/__tests__/auth.test.ts):
- POST /api/auth/signup — creates org + user, returns session cookie
- POST /api/auth/signin/email — valid creds → session; invalid → 401
- POST /api/auth/signin/email — rate limited after 10 failures (429)
- GET /api/auth/session — returns user with org and roles
- Session cookie is HttpOnly, Secure, SameSite=Lax
- Expired session → 401 on protected routes
- API key auth: valid Bearer token → access granted
- API key auth: invalid token → 401
- API key is hashed in DB (verify by reading raw row)

RBAC TESTS (src/server/__tests__/rbac.test.ts):
- Admin user can access admin endpoints
- Agent user cannot access admin endpoints (403)
- Requester cannot create change requests (403)
- permissionProcedure('incidents', 'write') allows itil role
- permissionProcedure('incidents', 'write') blocks requester role
- permissionProcedure('financial', 'admin') allows finance_manager
- permissionProcedure('financial', 'admin') blocks itil role
- Every mutation writes to audit_logs (verify entry exists after mutation)

MULTI-TENANCY TESTS (src/server/__tests__/tenancy.test.ts):
- Create ticket in Org A → not visible when queried as Org B user
- User in Org A cannot update ticket in Org B (403 or empty result)
- Seed two orgs → each has independent ticket numbering
- API key scoped to Org A cannot access Org B data

E2E TESTS (Playwright):
- /login renders, submit valid creds → redirect to /app/dashboard
- /login invalid creds → error message
- /app/dashboard without session → redirect to /login
- /signup → creates org → redirect to /app/dashboard
- Invite flow: admin creates invite → open link → signup → see org data

GATE: ALL pass → proceed to Phase 2. Run: pnpm test:phase1 && pnpm test:e2e:auth
```

---

## PHASE 2: Wire All 28 Modules to Backend
### Weeks 4–8 · Replace every useState with a tRPC call

This is the largest phase. Each module gets a tRPC router, and its page.tsx is refactored
to fetch from the API instead of mock data.

**Strategy:** Work module-by-module in priority order. For each module:
1. Create `src/server/routers/{module}.ts` with all CRUD procedures
2. Refactor `page.tsx` to use tRPC hooks (keep the existing JSX/UI, just swap data source)
3. Write tests for that module's API

---

### Prompt 2.1 — ITSM Router (Tickets, Escalations, On-Call)

```
Create src/server/routers/tickets.ts — the ITSM tRPC router for NexusOps.
This wires the existing /app/tickets, /app/escalations, and /app/on-call pages.

ROUTES:
tickets.list — input: { status?, priority?, assignee?, category?, type?, search?, 
  cursor?, limit? }. Returns paginated tickets with status counts for sidebar badges.
  Uses cursor-based pagination. Full-text search via PostgreSQL tsvector on title+description.
  Always filtered by ctx.org.id.

tickets.get — input: { id }. Returns full ticket + comments + watchers + relations + activity log.

tickets.create — input: Zod schema matching ticket fields.
  Auto-generates org-scoped number: "INC-" + sequential per org.
  Calculates SLA deadlines from priority's sla_response_minutes/sla_resolve_minutes.
  Creates audit log entry. Emits webhook event 'ticket.created'.
  Uses permissionProcedure('incidents', 'write').

tickets.update — input: { id, ...partial fields }.
  Creates audit log with diff (old vs new values).
  Recalculates SLA if priority or status changed.
  If status → resolved: set resolved_at. If status → closed: set closed_at.
  Emits 'ticket.updated'. permissionProcedure('incidents', 'write').

tickets.addComment — input: { ticketId, body, isInternal }.
  Internal comments only visible to users with incidents.write permission.
  permissionProcedure('incidents', 'write').

tickets.assign — input: { ticketId, assigneeId, note? }.
  Creates audit entry + optional comment. permissionProcedure('incidents', 'assign').

tickets.bulkUpdate — input: { ids[], changes }.
  Batch update status/priority/assignee. One audit entry per ticket.
  permissionProcedure('incidents', 'write').

tickets.getStatusCounts — returns { open: N, in_progress: N, resolved: N, closed: N }

escalations.list — tickets where sla_breached = true OR approaching breach (<30 min remaining)
escalations.escalate — input: { ticketId, level, escalateTo, reason }

oncall.getSchedules — list on-call schedules for org
oncall.getCurrentOnCall — who's currently on call per schedule
oncall.createOverride — temporary on-call override

Then refactor src/app/app/tickets/page.tsx:
- Replace the hardcoded mock data arrays with: const { data } = trpc.tickets.list.useQuery(filters)
- Keep ALL existing JSX, table columns, status badges, priority bars intact
- The filter sidebar now calls setFilters() which updates the query params
- "New Ticket" button navigates to /app/tickets/new which calls tickets.create on submit
- Ticket detail page calls tickets.get and tickets.addComment
- Bulk actions call tickets.bulkUpdate
- Escalations page calls escalations.list

Do NOT redesign the UI. The UI is already built. This is a data source swap.
```

### Prompt 2.2 — Change, Problem, Release Routers

```
Create routers for the change, problem, and release management modules:

src/server/routers/changes.ts:
- changes.list — filterable by type/status/risk, paginated
- changes.get — full change request + approvals + linked releases
- changes.create — auto-number "CHG-XXXX", permissionProcedure('changes', 'write')
- changes.update — with audit log
- changes.submitForApproval — moves to cab_review, creates approval_requests
- changes.approve / changes.reject — CAB voting, permissionProcedure('changes', 'approve')
- changes.getCalendar — returns scheduled changes for calendar view

src/server/routers/problems.ts:
- problems.list, .get, .create, .update — standard CRUD
- problems.linkIncident — link a ticket to a problem
- problems.addKnownError — create known error from problem
- knownErrors.list — known error database

src/server/routers/releases.ts:
- releases.list, .get, .create, .update
- releases.linkChange — associate changes with a release
- releases.deploy — move through environments

Wire these to /app/changes, /app/problems, /app/releases pages respectively.
Same approach: swap mock data for tRPC hooks, keep existing UI intact.
```

### Prompt 2.3 — Assets, CMDB, HAM, SAM Routers

```
Create routers for asset management modules:

src/server/routers/assets.ts:
- assets.list — filterable by type/status/owner/location, searchable
- assets.get — full asset + history + related CIs + licenses
- assets.create — auto-tag "AST-XXXX" per org
- assets.update, .assign, .retire, .dispose — with history entries
- assets.bulkImport — accept array of asset objects (for CSV upload)
- assetTypes.list, .create — manage custom asset types with field schemas

src/server/routers/cmdb.ts:
- cmdb.listCIs — filterable by type/status/environment
- cmdb.getCI — with relationships
- cmdb.createCI, .updateCI
- cmdb.addRelationship, .removeRelationship
- cmdb.getTopology — returns nodes+edges for D3 graph (all CIs in org with relationships)
- cmdb.impactAnalysis — given CI id, recursive traversal of depends_on/runs_on 
  to return full upstream/downstream dependency tree

src/server/routers/licenses.ts:
- licenses.list — with computed utilization (assigned_count / total_seats)
- licenses.get, .create, .update
- licenses.assign — to user or asset; check seat availability
- licenses.revoke
- licenses.expiringWithin — input: { days }

Wire to /app/cmdb, /app/ham, /app/sam pages.
For CMDB topology graph, the existing page likely has a placeholder visualization —
feed it real data from cmdb.getTopology.
```

### Prompt 2.4 — HR, Employee Portal Routers

```
Create routers for HR service delivery and employee self-service:

src/server/routers/hr.ts:
- hr.cases.list, .get, .create, .update — standard case CRUD
- hr.cases.addTask — add task to case
- hr.cases.completeTask — mark task done; if all done, auto-resolve case
- hr.onboarding.createFromTemplate — input: { employeeId, templateId }
  Creates HR case + generates tasks from template with calculated due dates
- hr.employees.list, .get, .create, .update
- hr.employees.getOrgChart — returns tree from manager_id relationships
- hr.leave.request — creates leave request, routes to manager approval
- hr.leave.approve, .reject — permissionProcedure('hr', 'approve')
- hr.leave.getBalances — for specific employee
- hr.documents.list, .upload, .delete

src/server/routers/employeePortal.ts:
- portal.myDashboard — returns: open cases count, pending leave, recent payslips, 
  assigned assets, action items
- portal.myPayslips — paginated, expand to see breakdown
- portal.myLeave — balances + request history
- portal.myBenefits — benefits package (from employee record or org settings)
- portal.myPerformance — goals and ratings (from HR case or dedicated table)
- portal.myProfile — personal info, update phone/address
- portal.myAssets — assets assigned to current user
- portal.requestLeave — shortcut to hr.leave.request scoped to current user
- portal.submitRequest — creates ticket or HR case from portal

Wire to /app/hr, /app/hr/[id], /app/employee-portal pages.
Employee portal should ONLY return data for the currently authenticated user.
No employee can see another employee's payslips or leave.
```

### Prompt 2.5 — Security, GRC Routers

```
src/server/routers/security.ts:
- securityIncidents.list, .get, .create, .update
- securityIncidents.addIOC — add indicator of compromise
- securityIncidents.addContainment — record containment action
- securityIncidents.transition — enforce state machine:
  new → triage → containment → eradication → recovery → closed
  Cannot skip states. permissionProcedure('security_incidents', 'write')
- vulnerabilities.list, .get, .create, .update
- vulnerabilities.remediate — mark as remediated with notes

src/server/routers/grc.ts:
- risks.list, .get, .create, .update
- risks.calculateScore — likelihood × impact = risk_score
- policies.list, .get, .create, .update, .publish
- audits.list, .get, .create, .update
- audits.addFinding — add finding to audit
- vendorRisk.list, .get, .create, .update
- vendorRisk.sendQuestionnaire, .recordResponse

Wire to /app/security, /app/security/[id], /app/grc, /app/grc/[id].
```

### Prompt 2.6 — Procurement, Financial, Contracts Routers

```
src/server/routers/procurement.ts:
- pr.list, .get, .create, .update
- pr.submit — moves to pending_approval, creates approval request via approval chain:
  <$1K auto-approve, $1-10K dept head, >$10K VP+finance sequential
- po.list, .get, .create (from approved PR), .update, .send
- po.receive — partial or full goods receipt, creates goods_receipt record
  If linked to asset_type: auto-create assets for received items
- inventory.list, .get, .update
- inventory.checkReorderAlerts — items below reorder_point

src/server/routers/financial.ts:
- budget.list, .get, .create, .update — budget lines by category/dept/year
- budget.getVariance — computed: budgeted - actual for each line
- invoices.list, .get, .create, .update
- invoices.threeWayMatch — input: { invoiceId } 
  Compares invoice amount vs PO amount vs goods receipt quantities.
  Returns: { matched: boolean, variances: [...] }
- invoices.approve, .markPaid
- chargebacks.list, .get, .create
- ap.aging — group payable invoices by aging buckets (0-30, 31-60, 61-90, 90+)
- ar.aging — group receivable invoices by customer with credit utilization

src/server/routers/contracts.ts:
- contracts.list, .get, .create, .update
- contracts.createFromWizard — input matches the 5-step wizard data structure
  Creates contract + obligations + initial approval chain
- contracts.transition — enforce state machine
- contracts.getExpiringWithin — input: { days }
- obligations.list — cross-contract, filterable by status/party
- obligations.markComplete

Wire to /app/procurement, /app/financial, /app/contracts pages.
```

### Prompt 2.7 — CRM, CSM, Projects, Legal, DevOps, APM, Remaining Modules

```
Create remaining routers. These follow the same CRUD pattern. For each:
standard list (paginated, filterable, org-scoped), get, create, update, plus 
module-specific operations.

src/server/routers/crm.ts:
- accounts, contacts, deals, leads, activities, quotes — full CRUD
- deals.movePipeline — move deal between stages
- leads.convert — create deal from lead
- leads.updateScore — AI scoring integration point
- crm.dashboardMetrics — pipeline value, at-risk deals, activities today
- crm.salesAnalytics — funnel data, revenue by stage/source, leaderboard

src/server/routers/csm.ts:
- csmCases CRUD + SLA tracking, account linkage

src/server/routers/projects.ts:
- projects CRUD + milestones CRUD + tasks CRUD
- projects.getAgileBoard — tasks grouped by status for kanban
- projects.getDashboardMetrics — portfolio health, budget summary

src/server/routers/legal.ts:
- matters, legalRequests, investigations — full CRUD
- matters.addCost — track legal costs
- investigations must enforce confidential flag (only assigned investigator + admin can see)

src/server/routers/devops.ts:
- pipelineRuns, deployments — CRUD + list
- devops.doraMetrics — calculate from pipeline/deployment data
- devops.getAgileBoard — sprint tasks by status

src/server/routers/apm.ts:
- applications CRUD, lifecycle management
- apm.getPortfolioView — grouped by lifecycle stage

src/server/routers/facilities.ts:
- buildings, rooms, bookings, moveRequests, facilityRequests — CRUD
- rooms.checkAvailability — input: { roomId, start, end }
- bookings.create — check availability first

src/server/routers/walkup.ts:
- visits CRUD, appointments CRUD
- walkup.joinQueue — add to live queue with position
- walkup.callNext — agent calls next in queue
- walkup.complete — mark visit done with resolution + CSAT

src/server/routers/surveys.ts:
- surveys CRUD, survey builder save
- surveys.submit — record survey_response
- surveys.getResults — aggregate scores and responses for a survey

src/server/routers/knowledge.ts:
- articles CRUD, search (Meilisearch integration)
- articles.recordView, .recordFeedback

src/server/routers/catalog.ts:
- catalogItems CRUD
- catalogRequests.submit — create request, trigger approval if required
- catalogRequests.fulfill — fulfiller marks done

src/server/routers/vendors.ts:
- vendors CRUD (may already be in procurement — deduplicate)

src/server/routers/admin.ts:
- users.list, .get, .create, .update, .disable, .resetPassword
  All require permissionProcedure('admin_console', 'admin')
- roles.list, .get — read the RBAC matrix
- slaDefinitions.list, .get, .create, .update
- businessRules.list, .create, .update
- systemProperties.list, .get, .set
- notificationRules.list, .create, .update
- scheduledJobs.list, .get, .update
- auditLog.list — paginated audit log viewer
- integrationHub.list, .getStatus

src/server/routers/reports.ts:
- reports.executiveOverview — platform-wide KPIs
- reports.slaDashboard — SLA by module/priority/team
- reports.workloadAnalysis — agent workload, queue depth
- reports.trendAnalysis — MoM trends

src/server/routers/approvals.ts:
- approvals.myPending — items requiring current user's approval
- approvals.mySubmitted — items I've requested approval for
- approvals.decide — approve or reject with comments
- approvals.history — past decisions

THEN: Register ALL routers in src/server/routers/_app.ts and ensure they compile.
Every router file follows the pattern of the tickets router from Prompt 2.1.
```

### PHASE 2 — Test Suite

```
Write tests for every router created in Phase 2. Group by module.
Each test file: src/server/routers/__tests__/{module}.test.ts

ITSM:
- Create ticket → auto-number INC-0001, INC-0002 sequential
- Create with Critical priority → SLA deadlines set
- Update status→resolved → resolved_at set
- Internal comment not returned for requester-role user
- Bulk update 5 tickets → all updated + 5 audit entries
- Full-text search "server outage" matches correct tickets
- Org-scoped: two orgs both get INC-0001
- 50 concurrent creates → no duplicate numbers (pg advisory lock)
- Escalation list returns SLA-breached tickets

CHANGES:
- Create → auto-number CHG-0001
- Submit for approval → creates approval_request
- CAB approve → status moves to approved
- Emergency change → skip CAB (different flow)
- Calendar returns only scheduled changes in date range

ASSETS:
- Create → auto-tag AST-0001
- Assign → history entry + owner updated
- Retire → cannot reassign without reactivating
- CMDB impact analysis: App→DB→Server → Server impact returns App+DB
- Circular dependency rejected
- License: 10 seats, assign 10, 11th fails

HR:
- Onboarding from template → case + tasks created with due dates
- All tasks completed → case auto-resolves
- Leave approved → balance decremented
- Leave rejected → balance unchanged
- Employee portal only returns current user's data (not another employee's)

PROCUREMENT:
- PR $500 → auto-approved
- PR $5000 → routed to dept head approval
- PR $50000 → sequential VP then finance
- PO receive → assets auto-created
- 3-way match: correct → matched; mismatch → flagged

CRM:
- Deal pipeline move → stage updated + audit
- Lead convert → deal created, lead marked converted
- Quote total calculated from line items

SECURITY:
- State machine: new→triage OK, new→recovery REJECTED (can't skip)
- Only security_analyst or security_admin can write security incidents

CONTRACTS:
- Wizard create → contract + obligations created
- State transitions enforced

APPROVALS:
- Multi-step approval: step 1 approve → step 2 unlocks
- Step 1 reject → entire request rejected
- Only assigned approver can decide

CROSS-MODULE:
- All mutations write audit_logs (spot-check 5 random routers)
- All queries filter by org_id (verify with two-org test)
- All mutations check permissions (verify 403 for unauthorized role)

GATE: pnpm test:phase2 — all pass before Phase 3.
```

---

## PHASE 3: Workflow Engine + Approvals + Notifications
### Weeks 9–11 · Make the Flow Designer actually execute

---

### Prompt 3.1 — Temporal.io Workflow Engine

```
Make the existing /app/flows Flow Designer page execute real workflows:

1. Temporal.io Setup:
   - Add @temporalio/client, @temporalio/worker, @temporalio/workflow, @temporalio/activity
   - Add temporal server to docker-compose.yml (temporalio/auto-setup image)
   - src/server/temporal/client.ts — Temporal client connecting to localhost:7233
   - src/server/temporal/worker.ts — Temporal worker registration (run as separate process)

2. Workflow Definition (src/server/temporal/workflows/):
   - orchestrate-workflow.ts — THE main workflow function.
     Input: { workflowId, versionId, triggerData }
     Reads nodes+edges from workflow_versions table.
     Traverses the graph, executing each node as an activity:
     
   Node types (matching existing Flow Designer node palette):
   a) TRIGGER — entry point, provides initial data
   b) CONDITION — evaluate expression against entity data, choose branch
   c) ACTION_ASSIGN — assign entity to user/team/round-robin
   d) ACTION_UPDATE — update entity fields
   e) ACTION_NOTIFY — send notification (email/in-app/Slack)
   f) ACTION_WEBHOOK — HTTP POST to configured URL
   g) ACTION_WAIT — Temporal timer (sleep for duration or signal)
   h) ACTION_APPROVAL — create approval_request, wait for signal (approved/rejected)
   i) ACTION_CREATE — create new ticket/asset/HR case
   j) PARALLEL_GATEWAY — Promise.all on fork branches
   k) AI_CLASSIFY — call Claude API, return classification

3. Activities (src/server/temporal/activities/):
   - assign.ts, update.ts, notify.ts, webhook.ts, approve.ts, create.ts, classify.ts
   - Each activity: reads config from node, executes against DB, returns output
   - All activities have retry policy: 3 attempts, exponential backoff

4. Triggers (src/server/temporal/triggers.ts):
   - After ticket.create mutation: check active workflows with trigger_type=ticket_created,
     evaluate trigger_config conditions, start Temporal workflow for matches
   - Same for: ticket_updated, ticket_status_changed, change_submitted, 
     hr_case_created, pr_submitted
   - For scheduled triggers: Temporal cron workflow
   - For webhook triggers: POST endpoint that starts workflow

5. Workflow Run Recording:
   - On workflow start: insert workflow_runs (status=running)
   - On each step: insert workflow_step_runs with input/output
   - On completion: update workflow_runs (status=completed)
   - On failure: update with error, step_runs marks failed step

6. tRPC additions:
   - workflows.publish now saves version AND registers Temporal schedule if trigger=scheduled
   - workflows.test — starts workflow with dryRun=true flag (activities log but don't execute)
   - workflowRuns.cancel — sends cancel signal to Temporal

7. Wire to existing /app/flows page:
   - The React Flow canvas already saves nodes/edges — now save via workflows.update
   - Publish button calls workflows.publish
   - Test button calls workflows.test and displays results in the step viewer
   - Runs tab calls workflowRuns.list and workflowRuns.get for detail view
```

### Prompt 3.2 — Notification System

```
Build the notification pipeline:

1. Notification Service (src/server/services/notifications.ts):
   - send(userId, { title, body, link, type, sourceType, sourceId }) 
   - Checks user's notification_preferences for each channel
   - Channels: in-app (DB insert), email (SMTP), Slack (webhook)
   - In-app: insert into notifications table
   - Email: use Nodemailer with configurable SMTP
   - Slack: if Slack integration connected, POST to user's Slack DM

2. Notification Router (src/server/routers/notifications.ts):
   - notifications.list — unread + recent, paginated
   - notifications.markRead — single or bulk
   - notifications.markAllRead
   - notifications.getUnreadCount — for bell badge
   - notifications.preferences.get, .update — per-event channel toggles

3. Real-time delivery:
   - SSE endpoint: src/app/api/notifications/stream/route.ts
   - Client subscribes on app load, receives new notifications as they arrive
   - Update AppHeader notification bell to show live unread count
   - Desktop notification permission + browser Notification API for P1/P2 tickets

4. Notification triggers (integrated with workflow engine):
   - ACTION_NOTIFY workflow node uses this service
   - Default system notifications (no workflow needed):
     * Ticket assigned to me → notify
     * Ticket I'm watching updated → notify
     * Approval required → notify
     * SLA about to breach (15 min before) → notify
     * Leave request decision → notify employee
```

### PHASE 3 — Test Suite

```
WORKFLOW ENGINE:
- Simple workflow: ticket_created + priority=critical → assign on-call → notify
  Create critical ticket → verify: assigned correctly, notification sent
  Create low ticket → verify: workflow did NOT trigger
- Parallel: fork "notify manager" AND "update status" → both execute
- Approval: create → wait signal → send approved signal → workflow proceeds
- Wait: workflow pauses for 5s → resumes → completes (use short duration for test)
- AI classify: mock Claude response → classification applied
- Webhook: mock HTTP endpoint → receives POST with correct payload
- Dry-run: no side effects (no DB writes, no notifications)
- Failed activity: retried 3x → step marked failed → run marked failed
- Version isolation: edit active workflow → in-flight uses old version
- Cancel: running workflow → cancel signal → status=cancelled

NOTIFICATIONS:
- Ticket assigned → in-app notification created for assignee
- User with email channel enabled → email sent (mock SMTP)
- User with email disabled → no email sent
- SSE stream: create notification → arrives on stream within 2s
- markAllRead → all unread set to read
- getUnreadCount returns correct count

APPROVALS:
- Multi-step: step 1 approve → step 2 becomes pending
- Step 1 reject → all subsequent steps skipped, request rejected
- Only designated approver can approve (other user gets 403)
- Approval via workflow: ACTION_APPROVAL creates request, 
  approval decision sends Temporal signal, workflow resumes

GATE: pnpm test:phase3
```

---

## PHASE 4: AI Layer + Search + Virtual Agent
### Weeks 12–13

---

### Prompt 4.1 — AI Features + Meilisearch

```
1. Meilisearch Integration (src/server/services/search.ts):
   - On entity create/update: index to Meilisearch
   - Indexes: tickets, assets, ci_items, kb_articles, employees, 
     contracts, crm_accounts, crm_deals
   - Each index: id, org_id, title/name, description/content, type, status, created_at
   - Search API: search.global({ query, orgId, entityTypes?, limit? })
   - Scoped by org_id (Meilisearch filterable attribute)
   - Wire to the global search bar in app-header.tsx

2. AI Services (src/server/services/ai/):
   - classification.ts: classifyTicket(title, description) → { category, priority, assignee, confidence }
     Uses Claude claude-sonnet-4-20250514, JSON output mode. Admin-editable prompt in DB.
   - nlSearch.ts: parseNaturalLanguageQuery(query) → structured filter object
     "critical tickets assigned to John last week" → { priority: 'critical', assignee: 'john', dateRange: 'last_week' }
   - suggestions.ts: getSuggestions(ticketId) → { similarTickets, kbArticles, suggestedSteps }
     Uses pgvector embeddings for similarity search
   - embeddings.ts: generateEmbedding(text) → vector
     Store in embeddings table. Generate on ticket create/resolve, KB article publish.
   - conversational.ts: answerFromKB(question, orgId) → { answer, citations, confidence }
     Searches KB via embeddings, synthesizes answer with Claude

3. AI Router (src/server/routers/ai.ts):
   - ai.classifyTicket — called on ticket create form (returns suggestion)
   - ai.naturalLanguageSearch — called from global search (Cmd+K)
   - ai.getSuggestions — called on ticket detail page sidebar
   - ai.askKnowledgeBase — called from portal KB search
   - ai.getUsageStats — for admin AI settings page
   All feature-flagged per org. Rate-limited.

4. Virtual Agent Upgrade (src/components/layout/virtual-agent-widget.tsx):
   - Replace the if/else pattern matching with Claude API streaming
   - System prompt: "You are NexusOps assistant. You can help create tickets,
     look up information, check SLA status, and answer from the knowledge base."
   - Tool use: search_tickets, create_ticket, check_sla, search_kb
   - Stream responses using ReadableStream
   - Keep existing UI (chat bubble, typing indicator, suggestion chips)
   - Fallback: if ANTHROPIC_API_KEY not set, use the existing pattern-match logic

5. AI Workflow Node:
   - The AI_CLASSIFY activity in Temporal calls classification.ts
   - Example: route ticket to correct team based on AI analysis
```

### PHASE 4 — Test Suite

```
SEARCH:
- Index 100 tickets → search "server outage" → relevant results returned
- Search scoped by org_id (Org B results not returned for Org A query)
- Global search returns mixed results (tickets + KB + assets)

AI:
- Classification: "email server is down" → IT category, High priority (mock Claude)
- Confidence 0.9 → auto-applied; 0.6 → suggested only
- NL search "critical tickets last week" → correct structured query
- Suggestions: 5 similar resolved tickets → similarity list returned
- Conversational KB: question with matching article → answer with citation
- AI unavailable (timeout) → graceful fallback, no error to user
- Usage log captures tokens + latency per call
- Rate limit: 11th call in 1 hour → 429 (for free tier)

VIRTUAL AGENT:
- "create a P2 incident about VPN" → ticket created via tool_use
- "how do I reset my password" → searches KB → returns answer
- Unknown query → graceful "I'm not sure" response

GATE: pnpm test:phase4
```

---

## PHASE 5: Integrations + Webhooks
### Week 14

---

### Prompt 5.1 — Integration Layer

```
Build the integration framework and connectors:

src/server/services/integrations/:
- base.ts — IntegrationProvider abstract class
- slack.ts — OAuth2 flow, send message to channel/DM, slash command handler,
  interactive approve/reject buttons
- email.ts — Nodemailer SMTP send. IMAP polling for inbound email-to-ticket.
- jira.ts — OAuth2/API token, bidirectional sync: NexusOps ticket ↔ Jira issue,
  configurable field mapping + status mapping
- sap.ts — REST adapter for SAP B1/S4HANA, sync vendors + POs + invoices

src/server/services/webhooks.ts:
- deliverWebhook(orgId, event, payload) — find matching webhooks, POST with HMAC-SHA256
- Retry: 3 attempts, exponential backoff (5s, 30s, 300s)
- Record every attempt in webhook_deliveries
- Integrate with BullMQ: webhook delivery is a background job

src/server/routers/integrations.ts:
- integrations.list — connected integrations for org
- integrations.connect — initiate OAuth or save API key (encrypted)
- integrations.disconnect
- integrations.testConnection
- integrations.syncNow — trigger manual sync

src/server/routers/webhooks.ts:
- webhooks.list, .create, .update, .delete
- webhooks.test — send test payload to URL
- webhooks.deliveries — delivery log for a webhook

Wire to existing /app/admin Integration Hub tab and webhook settings.
Credential encryption: AES-256-GCM with ENCRYPTION_KEY from env.
```

---

## PHASE 6: Deployment Infrastructure
### Weeks 15–16

---

### Prompt 6.1 — Docker + Helm + Terraform

```
Create production deployment infrastructure for NexusOps:

1. Docker (deploy/docker/):
   - Dockerfile.web — multi-stage: deps → build → runner (non-root, <300MB)
   - Dockerfile.worker — Temporal worker process
   - Dockerfile.migrator — runs drizzle-kit migrate then exits
   - docker-compose.prod.yml:
     nexusops-web (port 3000), nexusops-worker, nexusops-migrator (run_once),
     postgres, redis, meilisearch, temporal, minio
     Traefik reverse proxy with auto-SSL
   - .env.production.example with all variables documented

2. Helm Chart (deploy/helm/nexusops/):
   - Chart.yaml, values.yaml
   - templates/: deployment-web, deployment-worker, service, ingress, 
     configmap, secret, hpa, pvc
   - External DB support: values.yaml can point to RDS/Cloud SQL
   - values-production.yaml: HA settings (2+ replicas, resource limits)

3. Terraform (deploy/terraform/):
   - modules/aws/: ECS Fargate or EKS, RDS PostgreSQL, ElastiCache, S3, CloudFront, ALB
   - modules/gcp/: Cloud Run or GKE, Cloud SQL, Memorystore, Cloud Storage, Cloud CDN
   - Variables: region, instance_size, db_size, domain
   - Outputs: app_url, db_host, redis_host

4. CLI (scripts/nexusops-cli.sh):
   - nexusops migrate — run drizzle-kit migrate
   - nexusops seed — seed demo data
   - nexusops create-admin — interactive admin creation
   - nexusops backup — pg_dump + config export
   - nexusops restore — from backup file
   - nexusops health — check DB, Redis, Meilisearch, Temporal connectivity

5. CI/CD (GitHub Actions):
   - .github/workflows/ci.yml: lint → type-check → test → build
   - .github/workflows/deploy.yml: build images → push to registry → deploy
   - .github/workflows/release.yml: tag → build → push versioned images

6. Health Endpoints:
   - GET /api/health → { status: "ok" }
   - GET /api/health/detailed → { db, redis, meilisearch, temporal, storage }

7. License System:
   - src/server/services/license.ts
   - On startup: validate LICENSE_KEY (decode JWT with Coheron public key)
   - Contains: org_name, plan, max_users, expires_at, features[]
   - If expired: warning banner for 14 days, then read-only mode
   - If no key: community edition (5 users, tickets+dashboard only)
```

### PHASE 6 — Test Suite

```
DOCKER:
- docker compose up from clean state → all services healthy <3 min
- nexusops migrate → schema created
- nexusops create-admin → user can log in via browser
- nexusops health → all checks pass
- App serves pages correctly at http://localhost:3000

HELM:
- helm template generates valid YAML (helm lint)
- Install on minikube → all pods running within 5 min
- Ingress accessible, returns login page

HEALTH:
- /api/health returns 200 with correct structure
- Kill Redis → /api/health/detailed shows redis: "error"

LICENSE:
- Valid key → app runs normally
- Expired key → warning banner shown, app still works for 14 days
- No key → community mode (5 users, limited modules)

GATE: pnpm test:phase6 + manual smoke test
```

---

## PHASE 7: Hardening, Testing, Documentation
### Weeks 17–18

---

### Prompt 7.1 — Security + Performance + Docs

```
Production hardening:

SECURITY:
- CSP, HSTS, X-Frame-Options, X-Content-Type-Options headers (next.config.js)
- DOMPurify on all rich text inputs (ticket description, KB articles, comments)
- File upload: type whitelist (pdf/png/jpg/doc/xlsx/csv), max 25MB, store in S3
- CORS: only allow configured origins
- Rate limiting: 100/min for authenticated, 10/min for auth endpoints
- All secrets via env vars only
- npm audit fix

PERFORMANCE:
- EXPLAIN ANALYZE on all list queries — add missing indexes
- Connection pooling via postgres-js built-in pooling (pool: 20)
- Redis cache: dashboard metrics (5-min TTL), search results (1-min TTL)
- Next.js: static generation for docs pages, ISR for portal
- Compress responses (gzip via Next.js built-in)
- Bundle analysis: verify no huge imports

OBSERVABILITY:
- OpenTelemetry: instrument tRPC procedures with spans
- Structured JSON logging (pino) with correlation IDs
- Error tracking: capture unhandled errors with context
- Dashboard: /api/metrics endpoint for Prometheus scraping

DOCUMENTATION (docs/ directory or apps/docs with Nextra):
- Getting Started: quickstart, first ticket, invite team
- Admin Guide: organizations, RBAC, workflows, templates, integrations, AI, settings
- Module Guides: one page per module (28 pages)
- API Reference: auto-generated from tRPC (using trpc-openapi or similar)
- Self-Hosted: Docker quickstart, Kubernetes, configuration, upgrading, backup
- Coheron-Managed: onboarding, SLA, security, compliance

IN-APP:
- Onboarding checklist for new admin (dismissable):
  [ ] Invite your team
  [ ] Configure ticket categories and priorities
  [ ] Set up SLA policies
  [ ] Create your first workflow
  [ ] Customize the portal branding
  [ ] Connect Slack or email integration
```

### PHASE 7 — Final Test Suite

```
SECURITY:
- OWASP ZAP scan: 0 high/critical
- npm audit: 0 high/critical
- CSP header present on all responses
- File upload: .exe rejected, .pdf accepted, >25MB rejected
- SQL injection in search field → sanitized (parameterized query)

PERFORMANCE:
- Ticket list (50K records): API <300ms, page interactive <1.5s
- Dashboard load: <2s
- Workflow execution (10 nodes): <5s
- Lighthouse: Performance >85, Accessibility >90

LOAD (k6):
- 500 concurrent users browsing: p99 <2s, 0% error
- 100 concurrent ticket creates: all succeed, no number conflicts
- 50 concurrent workflow triggers: all execute

ACCESSIBILITY:
- axe-core: 0 critical/serious violations on portal pages
- Full portal tab-through without mouse
- Color contrast passes WCAG AA

E2E FULL REGRESSION (Playwright):
- Signup → create org → login → create ticket → view in list → add comment → resolve
- Submit purchase request → approve → convert to PO → receive → assets created
- Create onboarding template → add employee → onboarding case with tasks → complete all
- CRM: create account → create deal → move through pipeline → close won
- Portal: submit request → view in my requests → add reply → cancel
- Workflow: create → add nodes → connect → publish → create trigger ticket → verify execution
- Admin: invite user → user signs up → sees correct RBAC permissions

DOCUMENTATION:
- All doc page links resolve (no 404)
- Docker quickstart on fresh Ubuntu 24.04 VM → working app in <10 min
- API playground: execute /tickets.list → valid response

FINAL GATE: pnpm test:all && pnpm test:e2e:all && pnpm test:load
ALL PASS → PRODUCTION READY (v3.0.0)
```

---

## Execution Summary

| Phase | Weeks | What Ships | Cursor Prompts | Tests |
|---|---|---|---|---|
| 1. Foundation | 3 | DB (80+ tables), tRPC, Auth, Multi-tenancy, RBAC | 4 | ~45 |
| 2. Module Wiring | 5 | All 28 modules on real data | 7 | ~80 |
| 3. Workflows + Notifications | 3 | Temporal engine, approval system, notification pipeline | 2 | ~30 |
| 4. AI + Search | 2 | Claude AI, Meilisearch, upgraded virtual agent | 1 | ~20 |
| 5. Integrations | 1 | Slack, Email, Jira, SAP, webhooks | 1 | ~15 |
| 6. Deployment | 2 | Docker, Helm, Terraform, CLI, CI/CD, license | 1 | ~12 |
| 7. Hardening | 2 | Security, performance, docs, final regression | 1 | ~35 |
| **Total** | **~18** | **v3.0.0 production release** | **17** | **~237** |

---

## What NOT to Build (Deliberate Omissions)

These are post-launch, post-revenue expansion items:

- Industry verticals (Healthcare, Telecom, Financial Services, Retail)
- Innovation Management module
- ESG Management module  
- OT/SCADA Management
- Mobile native apps (responsive web is sufficient for launch)
- Custom report builder (pre-built reports are enough for v3)
- Marketplace / plugin system (build after you have 50+ customers)
- AI fine-tuning (Claude out-of-box is sufficient for v3)

---

*NexusOps v2.1.0 → v3.0.0 · Built by Coheron · 18 weeks from prototype to production.*
