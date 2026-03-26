# NexusOps — API Specification

**Version:** 1.0  
**Date:** March 2026  
**Organisation:** Coheron  
**Base URL:** `https://<host>/trpc`  
**Protocol:** tRPC 11 over HTTP (JSON batch)  
**Authentication:** Bearer token in `Authorization` header

---

## Table of Contents

1. [Overview](#1-overview)
2. [Transport & Conventions](#2-transport--conventions)
3. [Authentication](#3-authentication)
4. [Procedure Access Levels](#4-procedure-access-levels)
5. [Error Codes](#5-error-codes)
6. [Routers](#6-routers)
   - [auth](#61-auth)
   - [admin](#62-admin)
   - [tickets](#63-tickets)
   - [changes](#64-changes)
   - [workOrders](#65-workorders)
   - [assets](#66-assets)
   - [workflows](#67-workflows)
   - [hr](#68-hr)
   - [procurement](#69-procurement)
   - [dashboard](#610-dashboard)
   - [security](#611-security)
   - [grc](#612-grc)
   - [financial](#613-financial)
   - [contracts](#614-contracts)
   - [projects](#615-projects)
   - [crm](#616-crm)
   - [legal](#617-legal)
   - [devops](#618-devops)
   - [surveys](#619-surveys)
   - [knowledge](#620-knowledge)
   - [notifications](#621-notifications)
   - [catalog](#622-catalog)
   - [csm](#623-csm)
   - [apm](#624-apm)
   - [oncall](#625-oncall)
   - [events](#626-events)
   - [facilities](#627-facilities)
   - [walkup](#628-walkup)
   - [vendors](#629-vendors)
   - [approvals](#630-approvals)
   - [reports](#631-reports)
   - [search](#632-search)
   - [ai](#633-ai)

---

## 1. Overview

The NexusOps API is a **tRPC 11** API served by a **Fastify 5** server. All application logic is exposed through strongly-typed tRPC procedures — there are no traditional REST endpoints for domain operations.

### Transport

- **Queries** are sent as `GET /trpc/<router>.<procedure>?input=<JSON-encoded>`
- **Mutations** are sent as `POST /trpc/<router>.<procedure>` with a JSON body `{ "0": { "json": <input> } }`
- Multiple procedures can be **batched** into a single request: `POST /trpc/<p1>,<p2>?batch=1`

### Type Safety

The entire API is defined by the `AppRouter` type exported from `@nexusops/api`. The web client imports this type directly, giving end-to-end compile-time type checking with no code generation step.

---

## 2. Transport & Conventions

### Request Format

```
POST /trpc/tickets.create
Content-Type: application/json
Authorization: Bearer <session_token>

{
  "0": {
    "json": {
      "title": "Printer not working",
      "priorityId": "...",
      "type": "incident"
    }
  }
}
```

### Response Format (success)

```json
[
  {
    "result": {
      "data": {
        "json": { "id": "uuid", "title": "Printer not working", "...": "..." }
      }
    }
  }
]
```

### Response Format (error)

```json
[
  {
    "error": {
      "json": {
        "message": "UNAUTHORIZED",
        "code": -32001,
        "data": { "code": "UNAUTHORIZED", "httpStatus": 401, "path": "tickets.create" }
      }
    }
  }
]
```

### Pagination

Procedures that return lists follow one of two patterns:

**Cursor-based** (preferred for large datasets):
```json
{ "items": [...], "nextCursor": "uuid-or-null" }
```

**Offset-based**:
```json
{ "items": [...], "hasMore": true }
```

---

## 3. Authentication

All protected procedures require a session token passed as a Bearer token:

```
Authorization: Bearer <token>
```

Tokens are obtained via `auth.login` or `auth.signup` and stored client-side in `localStorage`. They are opaque random strings (`nanoid`). The server stores a SHA-256 hash of the token — the plaintext is never persisted.

### Session Lifecycle

| Event | Procedure | Effect |
|-------|-----------|--------|
| Sign up | `auth.signup` | Creates org + user + session |
| Sign in | `auth.login` | Creates session, returns token |
| Sign out | `auth.logout` | Deletes session from DB + Redis |
| Token check | `auth.me` | Validates token, returns user + org |
| Revoke other | `auth.revokeSession` | Deletes a specific other session |

---

## 4. Procedure Access Levels

Every procedure is protected by one of four access levels:

| Level | Label | Description |
|-------|-------|-------------|
| **public** | `PUBLIC` | No authentication required |
| **protected** | `AUTH` | Valid session required; any authenticated user in any org |
| **permission** | `PERM(module, action)` | Auth + RBAC check: user must have `action` on `module` |
| **admin** | `ADMIN` | Auth + DB role must be `owner` or `admin` |

### Available Actions

`read` · `write` · `delete` · `admin` · `approve` · `assign` · `close`

### Available Modules (abbreviated)

`incidents` · `changes` · `problems` · `work_orders` · `cmdb` · `ham` · `sam` · `security` · `vulnerabilities` · `grc` · `secretarial` · `hr` · `onboarding` · `facilities` · `financial` · `procurement` · `purchase_orders` · `budget` · `chargebacks` · `contracts` · `legal` · `projects` · `analytics` · `reports` · `csm` · `accounts` · `catalog` · `knowledge` · `devops` · `flows` · `approvals` · `users` · `audit_log` · `events`

---

## 5. Error Codes

tRPC maps errors to standard JSON-RPC codes with additional HTTP status context:

| tRPC Code | HTTP Status | Meaning |
|-----------|-------------|---------|
| `UNAUTHORIZED` | 401 | No or invalid session |
| `FORBIDDEN` | 403 | Authenticated but lacks required RBAC permission |
| `NOT_FOUND` | 404 | Requested resource does not exist in this org |
| `BAD_REQUEST` | 400 | Input validation failed (Zod) |
| `CONFLICT` | 409 | Optimistic concurrency conflict (version mismatch) |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `TIMEOUT` | 408 | Query exceeded 8s hard timeout |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled server error |

---

## 6. Routers

---

### 6.1 `auth`

Authentication, session management, and user provisioning.

---

#### `auth.signup`
**Type:** Mutation · **Access:** `PUBLIC`

Creates a new organisation and owner user, and returns a session.

**Input:**

| Field | Type | Rules |
|-------|------|-------|
| `name` | string | 2–100 chars |
| `email` | string | Valid email |
| `password` | string | ≥8 chars, must contain uppercase letter and digit |
| `orgName` | string | 2–100 chars |

**Returns:** `{ user, org, sessionId }`

---

#### `auth.login`
**Type:** Mutation · **Access:** `PUBLIC`

Authenticates an existing user and returns a session token.

**Input:**

| Field | Type | Rules |
|-------|------|-------|
| `email` | string | Valid email |
| `password` | string | Non-empty |

**Returns:** `{ user, org, sessionId }`

---

#### `auth.logout`
**Type:** Mutation · **Access:** `AUTH`

Revokes the current session. Deletes from DB and Redis cache.

**Input:** None  
**Returns:** `{ success: true }`

---

#### `auth.me`
**Type:** Query · **Access:** `AUTH`

Returns the authenticated user and their organisation. Used on every page load to hydrate the RBAC context.

**Input:** None  
**Returns:** `{ user, org }`

---

#### `auth.requestPasswordReset`
**Type:** Mutation · **Access:** `PUBLIC`

Generates a password reset token and logs the reset URL (enumeration-safe — always succeeds).

**Input:**

| Field | Type |
|-------|------|
| `email` | string (email) |

**Returns:** `{ success: true }`

---

#### `auth.resetPassword`
**Type:** Mutation · **Access:** `PUBLIC`

Validates a reset token and updates the user's password. Invalidates all existing sessions.

**Input:**

| Field | Type | Rules |
|-------|------|-------|
| `token` | string | Valid reset token |
| `password` | string | ≥8 chars, uppercase + digit |

**Returns:** `{ success: true }`

---

#### `auth.inviteUser`
**Type:** Mutation · **Access:** `PERM(users, write)`

Creates an invitation for a new user to join the organisation.

**Input:**

| Field | Type | Rules |
|-------|------|-------|
| `email` | string | Valid email |
| `role` | enum | `owner` \| `admin` \| `member` \| `viewer` |
| `name` | string? | Optional display name |

**Returns:** `{ invite, inviteUrl }`

---

#### `auth.acceptInvite`
**Type:** Mutation · **Access:** `PUBLIC`

Accepts an invitation, creates the user account, and returns a session.

**Input:**

| Field | Type | Rules |
|-------|------|-------|
| `token` | string | Valid invite token |
| `name` | string | 2–100 chars |
| `password` | string | ≥8 chars, uppercase + digit |

**Returns:** `{ user, sessionId }`

---

#### `auth.listUsers`
**Type:** Query · **Access:** `PERM(users, read)`

Returns all users in the current organisation.

**Input:** None  
**Returns:** `User[]` (sorted by name, no password hash)

---

#### `auth.updateUserRole`
**Type:** Mutation · **Access:** `PERM(users, write)`

Updates a user's DB role and/or RBAC matrix role within the same organisation.

**Input:**

| Field | Type | Rules |
|-------|------|-------|
| `userId` | string (uuid) | Must be in same org |
| `role` | enum? | `owner` \| `admin` \| `member` \| `viewer` |
| `matrixRole` | string \| null | Any `SystemRole` value |

**Returns:** Updated user (sanitized)

---

#### `auth.listMySessions`
**Type:** Query · **Access:** `AUTH`

Lists all active sessions for the current user, flagging the current one.

**Input:** None  
**Returns:** `Session[]` with `isCurrent: boolean`

---

#### `auth.revokeSession`
**Type:** Mutation · **Access:** `AUTH`

Revokes a specific session owned by the current user.

**Input:**

| Field | Type |
|-------|------|
| `sessionId` | string |

**Returns:** `{ success: true }`

---

### 6.2 `admin`

Organisation administration. All procedures require `ADMIN` access.

---

#### `admin.auditLog.list`
**Type:** Query · **Access:** `ADMIN`

Paginated audit log with optional filtering.

**Input:**

| Field | Type | Default |
|-------|------|---------|
| `page` | int ≥1 | `1` |
| `limit` | int 1–100 | `50` |
| `dateFrom` | string? | — |
| `dateTo` | string? | — |
| `userId` | uuid? | — |
| `action` | string? | — |
| `resourceType` | string? | — |

**Returns:** `{ items, total, page, pages }`

---

#### `admin.users.list`
**Type:** Query · **Access:** `ADMIN`

Lists all users in the organisation with management fields.

**Input:** None  
**Returns:** `{ id, email, name, role, matrixRole, status, lastLoginAt, createdAt }[]`

---

#### `admin.users.update`
**Type:** Mutation · **Access:** `ADMIN`

Updates a user's role, matrix role, or account status.

**Input:**

| Field | Type |
|-------|------|
| `userId` | uuid |
| `role` | enum? |
| `matrixRole` | string? |
| `status` | `active` \| `invited` \| `disabled`? |

**Returns:** Updated user fields

---

#### `admin.slaDefinitions.list`
**Type:** Query · **Access:** `ADMIN`

Lists SLA policy definitions. *(Currently returns empty stub — backend wiring pending.)*

---

#### `admin.slaDefinitions.upsert`
**Type:** Mutation · **Access:** `ADMIN`

Creates or updates an SLA definition.

**Input:**

| Field | Type |
|-------|------|
| `id` | uuid? |
| `name` | string |
| `priority` | string |
| `responseMinutes` | number |
| `resolveMinutes` | number |

---

#### `admin.systemProperties.list`
**Type:** Query · **Access:** `ADMIN`

Returns system configuration key/value pairs.

---

#### `admin.systemProperties.update`
**Type:** Mutation · **Access:** `ADMIN`

Updates a system configuration property.

**Input:** `{ key: string, value: string }`

---

#### `admin.notificationRules.list`
**Type:** Query · **Access:** `ADMIN`

Lists notification rules. *(Stub — returns empty array.)*

---

#### `admin.scheduledJobs.list`
**Type:** Query · **Access:** `ADMIN`

Lists scheduled background jobs. *(Stub.)*

---

### 6.3 `tickets`

Incident and service request management (ITSM Service Desk).

---

#### `tickets.list`
**Type:** Query · **Access:** `PERM(incidents, read)`

Paginated, filterable list of tickets in the organisation.

**Input:**

| Field | Type | Default |
|-------|------|---------|
| `statusId` | uuid? | — |
| `statusCategory` | string? | — |
| `priorityId` | uuid? | — |
| `categoryId` | uuid? | — |
| `assigneeId` | uuid? | — |
| `type` | string? | — |
| `search` | string? | — |
| `tags` | string[]? | — |
| `slaBreached` | boolean? | — |
| `cursor` | uuid? | — |
| `limit` | int 1–100 | `25` |
| `orderBy` | string? | `createdAt` |
| `order` | `asc` \| `desc`? | `desc` |

**Returns:** `{ items: Ticket[], nextCursor: string | null }`

---

#### `tickets.get`
**Type:** Query · **Access:** `PERM(incidents, read)`

Fetches a single ticket with its comments and activity log.

**Input:** `{ id: uuid }`  
**Returns:** `{ ticket, comments, activityLog }`

> Internal comments are hidden unless the caller has `incidents.assign` permission.

---

#### `tickets.create`
**Type:** Mutation · **Access:** `PERM(incidents, write)`

Creates a new ticket with automatic number assignment and SLA calculation.

**Input:**

| Field | Type | Default |
|-------|------|---------|
| `title` | string | required |
| `description` | string? | — |
| `categoryId` | uuid? | — |
| `priorityId` | uuid? | — |
| `type` | `incident` \| `request` \| `problem` \| `change` | `request` |
| `assigneeId` | uuid? | — |
| `teamId` | uuid? | — |
| `dueDate` | datetime? | — |
| `tags` | string[]? | `[]` |
| `customFields` | object? | `{}` |
| `idempotencyKey` | string? | — |

**Returns:** Created `Ticket`

---

#### `tickets.update`
**Type:** Mutation · **Access:** `PERM(incidents, write)`

Updates a ticket's fields. Uses optimistic concurrency via version check.

**Input:** `{ id: uuid, data: Partial<TicketFields> }`  
**Returns:** Updated `Ticket`

---

#### `tickets.addComment`
**Type:** Mutation · **Access:** `PERM(incidents, write)`

Adds a comment to a ticket.

**Input:**

| Field | Type | Default |
|-------|------|---------|
| `ticketId` | uuid | required |
| `body` | string | required |
| `isInternal` | boolean | `false` |

**Returns:** Created `Comment`

---

#### `tickets.assign`
**Type:** Mutation · **Access:** `PERM(incidents, assign)`

Assigns or unassigns a ticket to an agent.

**Input:** `{ id: uuid, assigneeId: uuid | null }`  
**Returns:** Updated `Ticket` + activity log entry

---

#### `tickets.bulkUpdate`
**Type:** Mutation · **Access:** `PERM(incidents, write)`

Updates up to 100 tickets at once.

**Input:**

| Field | Type |
|-------|------|
| `ids` | uuid[] (1–100) |
| `data.statusId` | uuid? |
| `data.assigneeId` | uuid? |
| `data.priorityId` | uuid? |

**Returns:** `{ updatedCount: number }`

---

#### `tickets.statusCounts`
**Type:** Query · **Access:** `PERM(incidents, read)`

Returns ticket counts grouped by status for the organisation.

**Input:** None  
**Returns:** `Record<statusId, count>`

---

### 6.4 `changes`

Change request, problem, and release management.

---

#### `changes.list`
**Type:** Query · **Access:** `PERM(changes, read)`

**Input:** `{ status?, type?, risk?, limit? (1–200, default 50), cursor? }`  
**Returns:** `{ items: ChangeRequest[], nextCursor }`

---

#### `changes.get`
**Type:** Query · **Access:** `PERM(changes, read)`

**Input:** `{ id: uuid }`  
**Returns:** `{ ...change, approvals: Approval[] }`

---

#### `changes.create`
**Type:** Mutation · **Access:** `PERM(changes, write)`

**Input:**

| Field | Type | Default |
|-------|------|---------|
| `title` | string | required |
| `description` | string? | — |
| `type` | `normal` \| `standard` \| `emergency` | `normal` |
| `risk` | `low` \| `medium` \| `high` \| `critical` | `medium` |
| `scheduledStart` | datetime? | — |
| `scheduledEnd` | datetime? | — |
| `rollbackPlan` | string? | — |
| `implementationPlan` | string? | — |
| `testPlan` | string? | — |

**Returns:** Created `ChangeRequest`

---

#### `changes.update`
**Type:** Mutation · **Access:** `PERM(changes, write)`

**Input:** `{ id, title?, description?, status?, risk?, scheduledStart?, scheduledEnd?, rollbackPlan?, cabDecision? }`  
**Returns:** Updated `ChangeRequest`

---

#### `changes.submitForApproval`
**Type:** Mutation · **Access:** `PERM(changes, write)`

Transitions a change from `draft` to `cab_review`.

**Input:** `{ id: uuid }`  
**Returns:** Updated `ChangeRequest`

---

#### `changes.approve`
**Type:** Mutation · **Access:** `PERM(changes, approve)`

Records an approval decision and transitions the change to `approved`.

**Input:** `{ changeId: uuid, comments?: string }`  
**Returns:** `Approval` record

---

#### `changes.reject`
**Type:** Mutation · **Access:** `PERM(changes, approve)`

Records a rejection and cancels the change request.

**Input:** `{ changeId: uuid, comments: string }`  
**Returns:** `Approval` record

---

#### `changes.statusCounts`
**Type:** Query · **Access:** `PERM(changes, read)`

**Returns:** `Record<status, count>`

---

#### `changes.listProblems`
**Type:** Query · **Access:** `PERM(problems, read)`

**Input:** `{ status?: string, limit?: number (default 50) }`  
**Returns:** `Problem[]`

---

#### `changes.createProblem`
**Type:** Mutation · **Access:** `PERM(problems, write)`

**Input:** `{ title: string, description?: string, priority?: string (default "medium") }`  
**Returns:** `Problem`

---

#### `changes.updateProblem`
**Type:** Mutation · **Access:** `PERM(problems, write)`

**Input:** `{ id: uuid, status?, rootCause?, workaround?, resolution? }`  
**Returns:** Updated `Problem`

---

#### `changes.listReleases`
**Type:** Query · **Access:** `PERM(changes, read)`

**Input:** `{ status?: string, limit?: number }`  
**Returns:** `Release[]`

---

#### `changes.createRelease`
**Type:** Mutation · **Access:** `PERM(changes, write)`

**Input:** `{ name: string, version: string, plannedDate?: string, notes?: string }`  
**Returns:** `Release` with `createdBy`

---

### 6.5 `workOrders`

Field service work order management.

---

#### `workOrders.list`
**Type:** Query · **Access:** `PERM(work_orders, read)`

**Input:**

| Field | Type | Default |
|-------|------|---------|
| `search` | string? | — |
| `state` | enum? | — |
| `priority` | string? | — |
| `type` | string? | — |
| `slaBreached` | boolean? | — |
| `limit` | int 1–200 | `50` |
| `offset` | int | `0` |

**Returns:** `{ items: WorkOrder[], hasMore: boolean }`

---

#### `workOrders.get`
**Type:** Query · **Access:** `PERM(work_orders, read)`

**Input:** `{ id: uuid }`  
**Returns:** `{ workOrder, tasks: Task[], activityLogs: ActivityLog[] }` or `null`

---

#### `workOrders.create`
**Type:** Mutation · **Access:** `PERM(work_orders, write)`

**Input:**

| Field | Type | Default |
|-------|------|---------|
| `shortDescription` | string (3–500) | required |
| `description` | string? | — |
| `type` | enum | `corrective` |
| `priority` | enum | `4_low` |
| `location` | string? | — |
| `category` | string? | — |
| `subcategory` | string? | — |
| `cmdbCi` | string? | — |
| `assignedToId` | uuid? | — |
| `scheduledStart` | datetime? | — |
| `scheduledEnd` | datetime? | — |
| `estimatedHours` | number? | — |

**Returns:** Created `WorkOrder`

---

#### `workOrders.updateState`
**Type:** Mutation · **Access:** `PERM(work_orders, write)`

Transitions a work order through its state machine.

**Input:** `{ id: uuid, state: StateEnum, note?: string }`  
**Returns:** Updated `WorkOrder` + activity entry

---

#### `workOrders.updateTask`
**Type:** Mutation · **Access:** `PERM(work_orders, write)`

Updates a task within a work order.

**Input:** `{ id: uuid, state?, actualHours?, workNotes?, assignedToId? }`  
**Returns:** Updated `Task`

---

#### `workOrders.addNote`
**Type:** Mutation · **Access:** `PERM(work_orders, write)`

Adds a work note to a work order.

**Input:** `{ workOrderId: uuid, note: string, isInternal?: boolean (default false) }`  
**Returns:** `ActivityLog`

---

#### `workOrders.metrics`
**Type:** Query · **Access:** `PERM(work_orders, read)`

**Returns:** `{ total: number, open: number, critical: number, breached: number }`

---

### 6.6 `assets`

Asset management, CMDB, hardware assets (HAM), and software asset management (SAM).

---

#### `assets.list`
**Type:** Query · **Access:** `PERM(cmdb, read)`

**Input:** `{ typeId?, status?, ownerId?, limit? (1–100, default 25), cursor? }`  
**Returns:** `{ items: Asset[], nextCursor }`

---

#### `assets.get`
**Type:** Query · **Access:** `PERM(cmdb, read)`

**Input:** `{ id: uuid }`  
**Returns:** `{ asset, history: AssetHistory[] }`

---

#### `assets.create`
**Type:** Mutation · **Access:** `PERM(cmdb, write)`

**Input:**

| Field | Type | Default |
|-------|------|---------|
| `name` | string | required |
| `typeId` | uuid | required |
| `status` | enum | `in_stock` |
| `ownerId` | uuid? | — |
| `location` | string? | — |
| `purchaseDate` | string? | — |
| `purchaseCost` | number? | — |
| `warrantyExpiry` | string? | — |
| `vendor` | string? | — |
| `customFields` | object? | — |
| `parentAssetId` | uuid? | — |

**Returns:** Created `Asset`

---

#### `assets.assign`
**Type:** Mutation · **Access:** `PERM(cmdb, write)`

Assigns or unassigns an asset to a user. Blocks retired/disposed assets.

**Input:** `{ id: uuid, ownerId: uuid | null }`  
**Returns:** Updated `Asset` + `AssetHistory`

---

#### `assets.retire`
**Type:** Mutation · **Access:** `PERM(cmdb, write)`

Marks an asset as retired.

**Input:** `{ id: uuid, reason?: string }`  
**Returns:** Updated `Asset`

---

#### `assets.listTypes`
**Type:** Query · **Access:** `PERM(cmdb, read)`

**Returns:** `AssetType[]` for the organisation

---

#### `assets.cmdb.list`
**Type:** Query · **Access:** `PERM(cmdb, read)`

**Returns:** All `CiItem[]` for the organisation

---

#### `assets.cmdb.getTopology`
**Type:** Query · **Access:** `PERM(cmdb, read)`

Returns a graph of CI items and their relationships for topology visualisation.

**Returns:** `{ nodes: CiItem[], edges: CiRelationship[] }`

---

#### `assets.cmdb.impactAnalysis`
**Type:** Query · **Access:** `PERM(cmdb, read)`

Performs a graph walk to find upstream and downstream CIs affected by a given CI.

**Input:** `{ ciId: uuid }`  
**Returns:** `{ upstream: uuid[], downstream: uuid[] }`

---

#### `assets.licenses.list`
**Type:** Query · **Access:** `PERM(sam, read)`

**Returns:** `SoftwareLicense[]` with `usedSeats` and `utilizationPct`

---

#### `assets.licenses.assign`
**Type:** Mutation · **Access:** `PERM(sam, write)`

Assigns a license seat to an asset or user. Enforces seat cap.

**Input:** `{ licenseId: uuid, assetId?: uuid, userId?: uuid }`  
**Returns:** `LicenseAssignment`

---

#### `assets.licenses.revoke`
**Type:** Mutation · **Access:** `PERM(sam, write)`

Revokes a license assignment.

**Input:** `{ assignmentId: uuid }`  
**Returns:** Updated `LicenseAssignment` (with `revokedAt`)

---

#### `assets.ham.list`
**Type:** Query · **Access:** `PERM(ham, read)`

**Input:** `{ status?, limit?, cursor? }`  
**Returns:** `{ items: Asset[], nextCursor }`

---

#### `assets.ham.assign`
**Type:** Mutation · **Access:** `PERM(ham, write)`

**Input:** `{ assetId: uuid, userId?: uuid, location?: string }`  
**Returns:** `Asset` + optional `AssetHistory`

---

#### `assets.ham.retire`
**Type:** Mutation · **Access:** `PERM(ham, write)`

**Input:** `{ assetId: uuid, reason?: string }`  
**Returns:** `Asset` + `AssetHistory`

---

#### `assets.sam.licenses.list`
**Type:** Query · **Access:** `PERM(sam, read)`

**Input:** `{ limit?: number }`  
**Returns:** Licenses with assigned seat counts and utilization

---

#### `assets.sam.licenses.assign`
**Type:** Mutation · **Access:** `PERM(sam, write)`

**Input:** `{ licenseId: uuid, userId: uuid }`  
**Returns:** `LicenseAssignment`

---

### 6.7 `workflows`

Visual workflow automation builder.

---

#### `workflows.list`
**Type:** Query · **Access:** `PERM(flows, read)`

**Returns:** `Workflow[]` for the organisation

---

#### `workflows.get`
**Type:** Query · **Access:** `PERM(flows, read)`

**Input:** `{ id: uuid }`  
**Returns:** `{ workflow, currentVersion: WorkflowVersion, versions: WorkflowVersion[] }`

---

#### `workflows.create`
**Type:** Mutation · **Access:** `PERM(flows, write)`

Creates a workflow with an initial empty version 1.

**Input:**

| Field | Type | Default |
|-------|------|---------|
| `name` | string | required |
| `description` | string? | — |
| `triggerType` | enum | required |
| `triggerConfig` | object | `{}` |

**Returns:** `Workflow`

---

#### `workflows.save`
**Type:** Mutation · **Access:** `PERM(flows, write)`

Saves a new version of a workflow's graph.

**Input:**

| Field | Type |
|-------|------|
| `id` | uuid |
| `nodes` | `{ id, type, position: {x,y}, data }[]` |
| `edges` | `{ id, source, target, sourceHandle?, targetHandle?, label? }[]` |

**Returns:** New `WorkflowVersion`

---

#### `workflows.publish`
**Type:** Mutation · **Access:** `PERM(flows, write)`

Activates a workflow for execution.

**Input:** `{ id: uuid }`  
**Returns:** Updated `Workflow`

---

#### `workflows.toggle`
**Type:** Mutation · **Access:** `PERM(flows, write)`

Enables or disables a workflow.

**Input:** `{ id: uuid, isActive: boolean }`  
**Returns:** Updated `Workflow`

---

#### `workflows.test`
**Type:** Mutation · **Access:** `PERM(flows, write)`

Performs a dry-run of a workflow with test trigger data.

**Input:** `{ id: uuid, triggerData: object }`  
**Returns:** `{ dryRun: true, nodes, edges, triggerData, result }`

---

#### `workflows.runs.list`
**Type:** Query · **Access:** `PERM(flows, read)`

**Input:** `{ workflowId: uuid, limit?: number (default 20) }`  
**Returns:** `WorkflowRun[]`

---

#### `workflows.runs.get`
**Type:** Query · **Access:** `PERM(flows, read)`

**Input:** `{ id: uuid }`  
**Returns:** `{ run: WorkflowRun, steps: WorkflowStepRun[] }`

---

### 6.8 `hr`

Human resources: employees, cases, leave management, and onboarding.

---

#### `hr.employees.list`
**Type:** Query · **Access:** `PERM(hr, read)`

**Input:** `{ department?, status?, limit? }`  
**Returns:** `Employee[]`

---

#### `hr.employees.get`
**Type:** Query · **Access:** `PERM(hr, read)`

**Input:** `{ id: uuid }`  
**Returns:** `Employee`

---

#### `hr.employees.create`
**Type:** Mutation · **Access:** `PERM(hr, write)`

**Input:**

| Field | Type |
|-------|------|
| `userId` | uuid |
| `department` | string |
| `title` | string |
| `managerId` | uuid? |
| `employmentType` | enum (default `full_time`) |
| `location` | string? |
| `startDate` | string? |

**Returns:** `Employee`

---

#### `hr.cases.list`
**Type:** Query · **Access:** `PERM(hr, read)`

**Returns:** `HrCase[]`

---

#### `hr.cases.create`
**Type:** Mutation · **Access:** `PERM(hr, write)`

**Input:** `{ employeeId: uuid, caseType: HrCaseTypeEnum, notes?: string, assigneeId?: uuid }`  
**Returns:** `HrCase`

---

#### `hr.cases.triggerOnboarding`
**Type:** Mutation · **Access:** `PERM(onboarding, write)`

Starts an onboarding workflow for an employee based on a template.

**Input:** `{ employeeId: uuid, templateId: uuid }`  
**Returns:** `HrCase` with expanded tasks

---

#### `hr.leave.list`
**Type:** Query · **Access:** `PERM(hr, read)`

**Input:** `{ employeeId?: uuid, status?: string }`  
**Returns:** `LeaveRequest[]`

---

#### `hr.leave.create`
**Type:** Mutation · **Access:** `PERM(hr, write)`

**Input:**

| Field | Type |
|-------|------|
| `type` | `annual` \| `sick` \| `parental` \| `unpaid` \| `other` |
| `startDate` | string |
| `endDate` | string |
| `reason` | string? |

**Returns:** `LeaveRequest`

---

#### `hr.leave.approve`
**Type:** Mutation · **Access:** `PERM(hr, approve)`

**Input:** `{ id: uuid }`  
**Returns:** Updated `LeaveRequest`

---

#### `hr.leave.reject`
**Type:** Mutation · **Access:** `PERM(hr, approve)`

**Input:** `{ id: uuid }`  
**Returns:** Updated `LeaveRequest`

---

#### `hr.onboardingTemplates.list`
**Type:** Query · **Access:** `PERM(onboarding, read)`

**Returns:** `OnboardingTemplate[]`

---

#### `hr.onboardingTemplates.create`
**Type:** Mutation · **Access:** `PERM(onboarding, write)`

**Input:** `{ name: string, department?: string, tasks: Task[] }`  
**Returns:** `OnboardingTemplate`

---

### 6.9 `procurement`

Purchase requests, purchase orders, invoices, and vendor management.

---

#### `procurement.vendors.list`
**Type:** Query · **Access:** `PERM(vendors, read)`

**Returns:** `Vendor[]`

---

#### `procurement.vendors.create`
**Type:** Mutation · **Access:** `PERM(vendors, write)`

**Input:** `{ name: string, contactEmail?, phone?, address?, paymentTerms? }`  
**Returns:** `Vendor`

---

#### `procurement.purchaseRequests.list`
**Type:** Query · **Access:** `PERM(procurement, read)`

**Input:** `{ status?: string }`  
**Returns:** `PurchaseRequest[]`

---

#### `procurement.purchaseRequests.create`
**Type:** Mutation · **Access:** `PERM(procurement, write)`

**Input:** As per `CreatePurchaseRequestSchema` (title, items[], justification, etc.)  
**Returns:** `PurchaseRequest`

---

#### `procurement.purchaseRequests.approve`
**Type:** Mutation · **Access:** `PERM(approvals, approve)`

**Input:** `{ id: uuid }`  
**Returns:** Approved `PurchaseRequest`

---

#### `procurement.purchaseRequests.reject`
**Type:** Mutation · **Access:** `PERM(procurement, approve)`

**Input:** `{ id: uuid, reason?: string }`  
**Returns:** Rejected `PurchaseRequest`

---

#### `procurement.purchaseOrders.list`
**Type:** Query · **Access:** `PERM(purchase_orders, read)`

**Returns:** `PurchaseOrder[]`

---

#### `procurement.purchaseOrders.createFromPR`
**Type:** Mutation · **Access:** `PERM(purchase_orders, write)`

Creates a PO from an approved purchase request.

**Input:** `{ prId: uuid, vendorId: uuid, expectedDelivery?: string }`  
**Returns:** `PurchaseOrder`

---

#### `procurement.purchaseOrders.receive`
**Type:** Mutation · **Access:** `PERM(purchase_orders, write)`

Records receipt of goods against a PO line item.

**Input:** `{ id: uuid, lineItems: { id: uuid, receivedQty: number }[] }`  
**Returns:** Updated `PurchaseOrder`

---

#### `procurement.invoices.list`
**Type:** Query · **Access:** `PERM(financial, read)`

**Input:** `{ direction?: "payable" | "receivable", status?: string, limit?, cursor? }`  
**Returns:** `{ items: Invoice[], nextCursor }`

---

#### `procurement.invoices.matchToOrder`
**Type:** Query · **Access:** `PERM(financial, read)`

Compares an invoice total against its matched PO for discrepancy detection.

**Input:** `{ invoiceId: uuid, poId: uuid }`  
**Returns:** Comparison result with variance

---

#### `procurement.dashboard`
**Type:** Query · **Access:** `PERM(procurement, read)`

**Returns:** `{ pendingPRCount: number, totalPOSpend: number }`

---

### 6.10 `dashboard`

Cross-module operational metrics dashboard.

---

#### `dashboard.getMetrics`
**Type:** Query · **Access:** `PERM(reports, read)`

Returns key operational metrics. Cached in Redis for 5 minutes.

**Returns:** `{ openTickets, resolvedToday, pendingApprovals, slaBreach, openWorkOrders, ... }`

---

#### `dashboard.getTimeSeries`
**Type:** Query · **Access:** `PERM(reports, read)`

Returns daily ticket creation and resolution counts over a date range.

**Input:** `{ days: number (7–365, default 30), teamId?: uuid, categoryId?: uuid }`  
**Returns:** `{ date: string, created: number, resolved: number }[]`

---

#### `dashboard.getTopCategories`
**Type:** Query · **Access:** `PERM(reports, read)`

Returns the top 10 ticket categories by volume.

**Returns:** `{ category: string, count: number }[]`

---

### 6.11 `security`

Security incident and vulnerability management.

---

#### `security.listIncidents`
**Type:** Query · **Access:** `PERM(security, read)`

**Input:** `{ severity?, status?, limit? (1–200, default 50), cursor? }`  
**Returns:** `{ items: SecurityIncident[], nextCursor }`

---

#### `security.getIncident`
**Type:** Query · **Access:** `PERM(security, read)`

**Input:** `{ id: uuid }`  
**Returns:** `SecurityIncident`

---

#### `security.createIncident`
**Type:** Mutation · **Access:** `PERM(security, write)`

**Input:**

| Field | Type | Default |
|-------|------|---------|
| `title` | string | required |
| `description` | string? | — |
| `severity` | enum | `medium` |
| `attackVector` | string? | — |
| `affectedSystems` | string[] | `[]` |

**Returns:** `SecurityIncident` (with auto `SEC-XXXXX` number)

---

#### `security.transition`
**Type:** Mutation · **Access:** `PERM(security, write)`

Transitions an incident through its lifecycle state machine. Sets `resolvedAt` on closure.

**Input:** `{ id: uuid, toStatus: string }`  
**Returns:** Updated `SecurityIncident`

---

#### `security.addContainment`
**Type:** Mutation · **Access:** `PERM(security, write)`

Appends a containment action to an incident's actions JSON array.

**Input:** `{ id: uuid, action: string, performedBy: string }`  
**Returns:** Updated `SecurityIncident`

---

#### `security.listVulnerabilities`
**Type:** Query · **Access:** `PERM(vulnerabilities, read)`

**Returns:** `Vulnerability[]`

---

#### `security.createVulnerability`
**Type:** Mutation · **Access:** `PERM(vulnerabilities, write)`

**Input:** `{ title, cveId?, description?, severity, cvssScore?, affectedAssets?, remediation? }`  
**Returns:** `Vulnerability`

---

#### `security.remediateVulnerability`
**Type:** Mutation · **Access:** `PERM(vulnerabilities, write)`

Marks a vulnerability as remediated.

**Input:** `{ id: uuid, notes?: string }`  
**Returns:** Updated `Vulnerability`

---

#### `security.statusCounts`
**Type:** Query · **Access:** `PERM(security, read)`

**Returns:** Counts grouped by severity

---

#### `security.openIncidentCount`
**Type:** Query · **Access:** `PERM(security, read)`

**Returns:** `{ count: number }` — open security incidents (used for sidebar badge)

---

### 6.12 `grc`

Governance, Risk & Compliance.

---

#### `grc.listRisks`
**Type:** Query · **Access:** `PERM(grc, read)`

**Returns:** `Risk[]`

---

#### `grc.getRisk`
**Type:** Query · **Access:** `PERM(grc, read)`

**Input:** `{ id: uuid }`  
**Returns:** `Risk`

---

#### `grc.createRisk`
**Type:** Mutation · **Access:** `PERM(grc, write)`

**Input:** `{ title, description?, likelihood, impact, category?, owner?, dueDate? }`  
**Returns:** `Risk`

---

#### `grc.updateRisk`
**Type:** Mutation · **Access:** `PERM(grc, write)`

**Input:** `{ id, status?, mitigationPlan?, residualLikelihood?, residualImpact? }`  
**Returns:** Updated `Risk`

---

#### `grc.listPolicies`
**Type:** Query · **Access:** `PERM(grc, read)`

**Returns:** `Policy[]`

---

#### `grc.createPolicy`
**Type:** Mutation · **Access:** `PERM(grc, write)`

**Input:** `{ title, content, category?, version? }`  
**Returns:** `Policy`

---

#### `grc.publishPolicy`
**Type:** Mutation · **Access:** `PERM(grc, write)`

**Input:** `{ id: uuid }`  
**Returns:** Updated `Policy` (status → `active`)

---

#### `grc.listAudits`
**Type:** Query · **Access:** `PERM(grc, read)`

**Returns:** `AuditPlan[]`

---

#### `grc.createAudit`
**Type:** Mutation · **Access:** `PERM(grc, write)`

**Input:** `{ name, scope?, auditor?, scheduledDate?, auditType? }`  
**Returns:** `AuditPlan`

---

#### `grc.listVendorRisks`
**Type:** Query · **Access:** `PERM(grc, read)`

**Returns:** `VendorRisk[]`

---

#### `grc.createVendorRisk`
**Type:** Mutation · **Access:** `PERM(grc, write)`

**Input:** `{ vendorId, riskType, severity, description? }`  
**Returns:** `VendorRisk`

---

#### `grc.updateVendorRisk`
**Type:** Mutation · **Access:** `PERM(grc, write)`

**Input:** `{ id, status?, mitigationNote? }`  
**Returns:** Updated `VendorRisk`

---

#### `grc.riskMatrix`
**Type:** Query · **Access:** `PERM(grc, read)`

Returns risks grouped by status and risk score for heat-map visualisation.

**Returns:** `{ open: Risk[], mitigated: Risk[], accepted: Risk[] }`

---

### 6.13 `financial`

Budget management, invoicing, and chargebacks.

---

#### `financial.listBudget`
**Type:** Query · **Access:** `PERM(budget, read)`

**Input:** `{ fiscalYear: string, department?: string }`  
**Returns:** `BudgetLine[]`

---

#### `financial.createBudgetLine`
**Type:** Mutation · **Access:** `PERM(budget, write)`

**Input:** `{ fiscalYear, department, category, allocatedAmount, notes? }`  
**Returns:** `BudgetLine`

---

#### `financial.updateBudgetLine`
**Type:** Mutation · **Access:** `PERM(budget, write)`

**Input:** `{ id, allocatedAmount?, notes? }`  
**Returns:** Updated `BudgetLine`

---

#### `financial.getBudgetVariance`
**Type:** Query · **Access:** `PERM(budget, read)`

Computes budget vs. actual spend variance per department.

**Input:** `{ fiscalYear: string }`  
**Returns:** `{ department, allocated, spent, variance, variancePct }[]`

---

#### `financial.listInvoices`
**Type:** Query · **Access:** `PERM(financial, read)`

**Input:** `{ direction?: "payable"|"receivable", status?, limit?, cursor? }`  
**Returns:** `{ items: Invoice[], nextCursor }`

---

#### `financial.approveInvoice`
**Type:** Mutation · **Access:** `PERM(financial, write)`

**Input:** `{ id: uuid }`  
**Returns:** Updated `Invoice`

---

#### `financial.markPaid`
**Type:** Mutation · **Access:** `PERM(financial, write)`

**Input:** `{ id: uuid }`  
**Returns:** Updated `Invoice` (with `paidAt`)

---

#### `financial.apAging`
**Type:** Query · **Access:** `PERM(financial, read)`

Returns accounts-payable aging buckets (0–30, 31–60, 61–90, 90+ days).

**Returns:** Aging summary by bucket

---

#### `financial.listChargebacks`
**Type:** Query · **Access:** `PERM(chargebacks, read)`

**Returns:** `Chargeback[]`

---

#### `financial.createChargeback`
**Type:** Mutation · **Access:** `PERM(chargebacks, write)`

**Input:** `{ department, amount, description, period, category? }`  
**Returns:** `Chargeback`

---

### 6.14 `contracts`

Contract lifecycle management.

---

#### `contracts.list`
**Type:** Query · **Access:** `PERM(contracts, read)`

**Returns:** `Contract[]`

---

#### `contracts.get`
**Type:** Query · **Access:** `PERM(contracts, read)`

**Input:** `{ id: uuid }`  
**Returns:** `{ ...contract, obligations: ContractObligation[] }`

---

#### `contracts.create`
**Type:** Mutation · **Access:** `PERM(contracts, write)`

**Input:** `{ title, counterparty, type, value?, startDate?, endDate?, autoRenew? }`  
**Returns:** `Contract`

---

#### `contracts.createFromWizard`
**Type:** Mutation · **Access:** `PERM(contracts, write)`

Creates a contract with clauses and obligations in one step.

**Input:** `{ title, counterparty, type, clauses: string[], obligations: { description, dueDate? }[], submitForReview?: boolean }`  
**Returns:** `Contract` with obligations

---

#### `contracts.transition`
**Type:** Mutation · **Access:** `PERM(contracts, write)`

Transitions a contract through its lifecycle state machine.

**Input:** `{ id: uuid, toStatus: string }`  
**Returns:** Updated `Contract`

---

#### `contracts.expiringWithin`
**Type:** Query · **Access:** `PERM(contracts, read)`

Returns contracts expiring within a specified number of days.

**Input:** `{ days?: number (default 30) }`  
**Returns:** `Contract[]`

---

#### `contracts.listObligations`
**Type:** Query · **Access:** `PERM(contracts, read)`

**Input:** `{ status?: string }`  
**Returns:** `ContractObligation[]`

---

#### `contracts.completeObligation`
**Type:** Mutation · **Access:** `PERM(contracts, write)`

**Input:** `{ id: uuid }`  
**Returns:** Updated `ContractObligation` (with `completedAt`)

---

### 6.15 `projects`

Project portfolio management.

---

#### `projects.list`
**Type:** Query · **Access:** `PERM(projects, read)`

**Returns:** `Project[]`

---

#### `projects.get`
**Type:** Query · **Access:** `PERM(projects, read)`

**Input:** `{ id: uuid }`  
**Returns:** `{ project, milestones: Milestone[], tasks: ProjectTask[] }`

---

#### `projects.create`
**Type:** Mutation · **Access:** `PERM(projects, write)`

**Input:** `{ name, description?, status?, health?, startDate?, endDate?, ownerId?, budget? }`  
**Returns:** `Project`

---

#### `projects.update`
**Type:** Mutation · **Access:** `PERM(projects, write)`

**Input:** `{ id, name?, description?, status?, health?, progress?, budget? }`  
**Returns:** Updated `Project`

---

#### `projects.createMilestone`
**Type:** Mutation · **Access:** `PERM(projects, write)`

**Input:** `{ projectId, name, dueDate?, description? }`  
**Returns:** `ProjectMilestone`

---

#### `projects.updateMilestone`
**Type:** Mutation · **Access:** `PERM(projects, write)`

**Input:** `{ id, name?, dueDate?, completedAt? }`  
**Returns:** Updated `ProjectMilestone`

---

#### `projects.createTask`
**Type:** Mutation · **Access:** `PERM(projects, write)`

**Input:** `{ projectId, title, status?, assigneeId?, dueDate?, priority? }`  
**Returns:** `ProjectTask`

---

#### `projects.updateTask`
**Type:** Mutation · **Access:** `PERM(projects, write)`

**Input:** `{ id, status?, assigneeId?, dueDate? }`  
**Returns:** Updated `ProjectTask`

---

#### `projects.getAgileBoard`
**Type:** Query · **Access:** `PERM(projects, read)`

Returns tasks grouped by status column for a Kanban board view.

**Input:** `{ projectId: uuid }`  
**Returns:** `Record<status, ProjectTask[]>`

---

#### `projects.portfolioHealth`
**Type:** Query · **Access:** `PERM(projects, read)`

Returns health distribution across active projects.

**Returns:** `{ healthy, at_risk, off_track, on_hold }` counts

---

### 6.16 `crm`

Customer Relationship Management.

---

#### `crm.listAccounts`
**Type:** Query · **Access:** `PERM(accounts, read)`

**Returns:** `CrmAccount[]`

---

#### `crm.createAccount`
**Type:** Mutation · **Access:** `PERM(accounts, write)`

**Input:** `{ name, industry?, website?, revenue?, employeeCount?, ownerId? }`  
**Returns:** `CrmAccount`

---

#### `crm.updateAccount`
**Type:** Mutation · **Access:** `PERM(accounts, write)`

**Input:** `{ id, name?, stage?, revenue?, ownerId? }`  
**Returns:** Updated `CrmAccount`

---

#### `crm.listContacts`
**Type:** Query · **Access:** `PERM(accounts, read)`

**Returns:** `CrmContact[]`

---

#### `crm.createContact`
**Type:** Mutation · **Access:** `PERM(accounts, write)`

**Input:** `{ accountId, name, email?, phone?, title?, isPrimary? }`  
**Returns:** `CrmContact`

---

#### `crm.listDeals`
**Type:** Query · **Access:** `PERM(accounts, read)`

**Returns:** `CrmDeal[]`

---

#### `crm.createDeal`
**Type:** Mutation · **Access:** `PERM(accounts, write)`

**Input:** `{ accountId, name, value?, stage?, closeDate?, ownerId? }`  
**Returns:** `CrmDeal`

---

#### `crm.movePipeline`
**Type:** Mutation · **Access:** `PERM(accounts, write)`

Moves a deal to a different pipeline stage.

**Input:** `{ id: uuid, stage: string }`  
**Returns:** Updated `CrmDeal`

---

#### `crm.listLeads`
**Type:** Query · **Access:** `PERM(accounts, read)`

**Returns:** `CrmLead[]`

---

#### `crm.createLead`
**Type:** Mutation · **Access:** `PERM(accounts, write)`

**Input:** `{ name, email?, company?, source?, assigneeId? }`  
**Returns:** `CrmLead`

---

#### `crm.convertLead`
**Type:** Mutation · **Access:** `PERM(accounts, write)`

Converts a lead to a contact and optionally creates an account and deal.

**Input:** `{ id: uuid, createAccount?: boolean, createDeal?: boolean }`  
**Returns:** `{ contact, account?, deal? }`

---

#### `crm.listActivities`
**Type:** Query · **Access:** `PERM(accounts, read)`

**Returns:** `CrmActivity[]`

---

#### `crm.createActivity`
**Type:** Mutation · **Access:** `PERM(accounts, write)`

**Input:** `{ type, subject, relatedId?, relatedType?, notes?, scheduledAt?, completedAt? }`  
**Returns:** `CrmActivity`

---

#### `crm.listQuotes`
**Type:** Query · **Access:** `PERM(accounts, read)`

**Returns:** `CrmQuote[]`

---

#### `crm.createQuote`
**Type:** Mutation · **Access:** `PERM(accounts, write)`

**Input:** `{ dealId, lineItems: { description, qty, unitPrice }[], validUntil? }`  
**Returns:** `CrmQuote`

---

#### `crm.dashboardMetrics`
**Type:** Query · **Access:** `PERM(accounts, read)`

**Returns:** Pipeline stage sums, total deal value, win rate

---

### 6.17 `legal`

Legal matter, request, and investigation management.

---

#### `legal.listMatters`
**Type:** Query · **Access:** `PERM(grc, read)`

**Returns:** `LegalMatter[]`

---

#### `legal.getMatter`
**Type:** Query · **Access:** `PERM(grc, read)`

**Input:** `{ id: uuid }`  
**Returns:** `LegalMatter`

---

#### `legal.createMatter`
**Type:** Mutation · **Access:** `PERM(grc, write)`

**Input:** `{ title, type, description?, assigneeId?, clientName?, priority?, dueDate? }`  
**Returns:** `LegalMatter`

---

#### `legal.updateMatter`
**Type:** Mutation · **Access:** `PERM(grc, write)`

**Input:** `{ id, status?, assigneeId?, notes? }`  
**Returns:** Updated `LegalMatter`

---

#### `legal.listRequests`
**Type:** Query · **Access:** `PERM(grc, read)`

**Returns:** `LegalRequest[]`

---

#### `legal.createRequest`
**Type:** Mutation · **Access:** `PERM(grc, write)`

**Input:** `{ subject, requestType, description?, requestorId?, priority? }`  
**Returns:** `LegalRequest`

---

#### `legal.updateRequest`
**Type:** Mutation · **Access:** `PERM(grc, write)`

**Input:** `{ id, status?, assigneeId?, response? }`  
**Returns:** Updated `LegalRequest`

---

#### `legal.listInvestigations`
**Type:** Query · **Access:** `PERM(grc, read)`

Returns investigations. Confidential investigations are only visible to the assigned investigator or users with `grc.admin` permission.

**Returns:** `Investigation[]`

---

#### `legal.createInvestigation`
**Type:** Mutation · **Access:** `PERM(grc, write)`

**Input:** `{ title, type, description?, investigatorId?, isConfidential? }`  
**Returns:** `Investigation`

---

#### `legal.closeInvestigation`
**Type:** Mutation · **Access:** `PERM(grc, write)`

**Input:** `{ id: uuid, findings: string, resolution: string }`  
**Returns:** Closed `Investigation`

---

### 6.18 `devops`

CI/CD pipeline and deployment tracking.

---

#### `devops.listPipelines`
**Type:** Query · **Access:** `PERM(projects, read)`

**Returns:** `PipelineRun[]`

---

#### `devops.createPipelineRun`
**Type:** Mutation · **Access:** `PERM(projects, write)`

**Input:** `{ name, branch, commitSha?, triggeredBy?, environment? }`  
**Returns:** `PipelineRun`

---

#### `devops.completePipeline`
**Type:** Mutation · **Access:** `PERM(projects, write)`

**Input:** `{ id: uuid, status: "success"|"failed"|"cancelled", durationSeconds? }`  
**Returns:** Updated `PipelineRun`

---

#### `devops.listDeployments`
**Type:** Query · **Access:** `PERM(projects, read)`

**Returns:** `Deployment[]`

---

#### `devops.createDeployment`
**Type:** Mutation · **Access:** `PERM(projects, write)`

**Input:** `{ service, environment, version, deployedBy? }`  
**Returns:** `Deployment`

---

#### `devops.completeDeployment`
**Type:** Mutation · **Access:** `PERM(projects, write)`

**Input:** `{ id: uuid, status: "success"|"failed"|"rolled_back", durationSeconds? }`  
**Returns:** Updated `Deployment`

---

#### `devops.doraMetrics`
**Type:** Query · **Access:** `PERM(projects, read)`

Returns DORA (DevOps Research and Assessment) metrics over the last 30 days: deployment frequency, lead time, change failure rate, and MTTR.

**Returns:** `{ deploymentFrequency, leadTimeHours, changeFailureRate, mttrHours }`

---

### 6.19 `surveys`

Survey creation, distribution, and response collection.

---

#### `surveys.list`
**Type:** Query · **Access:** `PERM(analytics, read)`

**Returns:** `Survey[]`

---

#### `surveys.get`
**Type:** Query · **Access:** `PERM(analytics, read)`

**Input:** `{ id: uuid }`  
**Returns:** `Survey` with questions

---

#### `surveys.create`
**Type:** Mutation · **Access:** `PERM(analytics, write)`

**Input:** `{ title, description?, questions: { text, type, options? }[] }`  
**Returns:** `Survey`

---

#### `surveys.activate`
**Type:** Mutation · **Access:** `PERM(analytics, write)`

**Input:** `{ id: uuid }`  
**Returns:** Updated `Survey` (status → `active`)

---

#### `surveys.submit`
**Type:** Mutation · **Access:** `AUTH`

Submits a survey response (available to any authenticated user).

**Input:** `{ surveyId: uuid, answers: Record<questionId, any> }`  
**Returns:** `SurveyResponse`

---

#### `surveys.getResults`
**Type:** Query · **Access:** `PERM(analytics, read)`

Returns aggregated results and raw responses for a survey.

**Input:** `{ id: uuid }`  
**Returns:** `{ summary, responses: SurveyResponse[] }`

---

### 6.20 `knowledge`

Knowledge base article management.

---

#### `knowledge.list`
**Type:** Query · **Access:** `PERM(knowledge, read)`

**Returns:** `KbArticle[]`

---

#### `knowledge.get`
**Type:** Query · **Access:** `PERM(knowledge, read)`

Fetches an article and increments its view count.

**Input:** `{ id: uuid }`  
**Returns:** `KbArticle`

---

#### `knowledge.create`
**Type:** Mutation · **Access:** `PERM(knowledge, write)`

**Input:** `{ title, content, category?, tags?, visibility? }`  
**Returns:** `KbArticle`

---

#### `knowledge.update`
**Type:** Mutation · **Access:** `PERM(knowledge, write)`

**Input:** `{ id, title?, content?, tags?, category? }`  
**Returns:** Updated `KbArticle`

---

#### `knowledge.publish`
**Type:** Mutation · **Access:** `PERM(knowledge, write)`

**Input:** `{ id: uuid }`  
**Returns:** Updated `KbArticle` (status → `published`)

---

#### `knowledge.recordFeedback`
**Type:** Mutation · **Access:** `AUTH`

Records user feedback (helpful/not helpful) on an article.

**Input:** `{ articleId: uuid, helpful?: boolean }`  
**Returns:** `KbFeedback`

---

### 6.21 `notifications`

In-app notification management and preferences.

---

#### `notifications.list`
**Type:** Query · **Access:** `AUTH`

**Input:** `{ unreadOnly?: boolean (default false), limit?: number (default 30) }`  
**Returns:** `{ items: Notification[] }`

---

#### `notifications.unreadCount`
**Type:** Query · **Access:** `AUTH`

**Returns:** `{ count: number }` — used for header badge

---

#### `notifications.markRead`
**Type:** Mutation · **Access:** `AUTH`

**Input:** `{ id: uuid }`  
**Returns:** `{ ok: true }` or `NOT_FOUND`

---

#### `notifications.markAllRead`
**Type:** Mutation · **Access:** `AUTH`

Marks all notifications for the current user as read.

**Input:** None  
**Returns:** `{ ok: true }`

---

#### `notifications.send`
**Type:** Mutation · **Access:** `PERM(users, write)`

Sends a notification to a specific user (system/automation use).

**Input:**

| Field | Type | Default |
|-------|------|---------|
| `userId` | uuid | required |
| `title` | string | required |
| `body` | string? | — |
| `link` | string? | — |
| `type` | `info` \| `warning` \| `error` \| `success` | `info` |
| `sourceType` | string? | — |
| `sourceId` | uuid? | — |

**Returns:** Created `Notification`

---

#### `notifications.getPreferences`
**Type:** Query · **Access:** `AUTH`

Returns the current user's notification delivery preferences.

**Returns:** `NotificationPreference[]`

---

#### `notifications.updatePreference`
**Type:** Mutation · **Access:** `AUTH`

Creates or updates a notification delivery preference.

**Input:** `{ channel: "email"|"in_app"|"slack", eventType: string, enabled: boolean }`  
**Returns:** Upserted `NotificationPreference`

---

### 6.22 `catalog`

Service catalog item and request management.

---

#### `catalog.listItems`
**Type:** Query · **Access:** `PERM(catalog, read)`

**Input:** `{ status?: string (default "active"), category?, limit?, cursor? }`  
**Returns:** `{ items: CatalogItem[], nextCursor }`

---

#### `catalog.getItem`
**Type:** Query · **Access:** `PERM(catalog, read)`

**Input:** `{ id: uuid }`  
**Returns:** `CatalogItem`

---

#### `catalog.createItem`
**Type:** Mutation · **Access:** `PERM(catalog, write)`

**Input:** `{ name, description?, category?, price?, fulfillmentTime?, approvalRequired?, formSchema? }`  
**Returns:** `CatalogItem`

---

#### `catalog.submitRequest`
**Type:** Mutation · **Access:** `AUTH`

Submits a service catalog request. Routes to `pending_approval` if the item requires approval, else `submitted`.

**Input:** `{ catalogItemId: uuid, formData: object, notes?: string }`  
**Returns:** `CatalogRequest`

---

#### `catalog.listRequests`
**Type:** Query · **Access:** `PERM(catalog, read)`

**Returns:** `CatalogRequest[]`

---

#### `catalog.fulfillRequest`
**Type:** Mutation · **Access:** `PERM(catalog, write)`

Marks a catalog request as fulfilled.

**Input:** `{ id: uuid, notes?: string }`  
**Returns:** Updated `CatalogRequest`

---

### 6.23 `csm`

Customer Success Management.

> **Note:** The CSM module is partially implemented. `cases` procedures are stubs returning empty results or errors. `accounts` and `contacts` delegate to the CRM tables.

---

#### `csm.accounts.list`
**Type:** Query · **Access:** `PERM(csm, read)`

**Returns:** `CrmAccount[]`

---

#### `csm.contacts.list`
**Type:** Query · **Access:** `PERM(csm, read)`

**Returns:** `CrmContact[]`

---

#### `csm.slaMetrics`
**Type:** Query · **Access:** `PERM(csm, read)`

**Returns:** SLA performance metrics (partial implementation)

---

#### `csm.dashboard`
**Type:** Query · **Access:** `PERM(csm, read)`

**Returns:** Customer health dashboard counts

---

### 6.24 `apm`

Application Portfolio Management.

---

#### `apm.applications.list`
**Type:** Query · **Access:** `PERM(analytics, read)`

**Returns:** `Application[]`

---

#### `apm.applications.get`
**Type:** Query · **Access:** `PERM(analytics, read)`

**Input:** `{ id: uuid }`  
**Returns:** `Application`

---

#### `apm.applications.create`
**Type:** Mutation · **Access:** `PERM(analytics, write)`

**Input:** `{ name, description?, lifecycle, cloudHosting?, businessCriticality?, techDebtScore?, annualCost? }`  
**Returns:** `Application`

---

#### `apm.applications.update`
**Type:** Mutation · **Access:** `PERM(analytics, write)`

**Input:** `{ id, lifecycle?, techDebtScore?, annualCost? }`  
**Returns:** Updated `Application`

---

#### `apm.portfolio.summary`
**Type:** Query · **Access:** `PERM(analytics, read)`

Returns portfolio-level aggregates including lifecycle distribution, average health, total cost, and categorised lists.

**Returns:** `{ totalApps, avgHealth, totalCost, byLifecycle: Record<string, number>, retireCandidates, highTechDebt, cloudNative }`

---

### 6.25 `oncall`

On-call schedule and escalation management.

---

#### `oncall.schedules.list`
**Type:** Query · **Access:** `PERM(incidents, read)`

**Returns:** `OnCallSchedule[]`

---

#### `oncall.schedules.get`
**Type:** Query · **Access:** `PERM(incidents, read)`

**Input:** `{ id: uuid }`  
**Returns:** `OnCallSchedule` with members and escalation chain

---

#### `oncall.schedules.create`
**Type:** Mutation · **Access:** `PERM(incidents, write)`

**Input:** `{ name, timezone, members: { userId, priority }[], escalationChain: { userId, delayMinutes }[] }`  
**Returns:** `OnCallSchedule`

---

#### `oncall.schedules.update`
**Type:** Mutation · **Access:** `PERM(incidents, write)`

**Input:** `{ id, name?, members?, escalationChain? }`  
**Returns:** Updated `OnCallSchedule`

---

#### `oncall.escalations.list`
**Type:** Query · **Access:** `PERM(incidents, read)`

Returns all escalation chains flattened from on-call schedules.

**Returns:** Escalation entry list

---

#### `oncall.activeRotation`
**Type:** Query · **Access:** `PERM(incidents, read)`

Returns the current on-call member for each schedule based on a weekly round-robin calculation.

**Returns:** `{ scheduleId, scheduleName, currentOnCall: User }[]`

---

### 6.26 `events`

Platform event stream and infrastructure health.

> **Note:** Event list, acknowledge, and suppress procedures are stubs. `healthNodes` and `dashboard` use live data.

---

#### `events.list`
**Type:** Query · **Access:** `PERM(events, read)`

**Returns:** `[]` *(stub)*

---

#### `events.acknowledge`
**Type:** Mutation · **Access:** `PERM(events, write)`

**Input:** `{ id: uuid }`  
**Returns:** `{ success: true }` *(stub)*

---

#### `events.suppress`
**Type:** Mutation · **Access:** `PERM(events, write)`

**Input:** `{ id: uuid, duration: number }`  
**Returns:** `{ success: true }` *(stub)*

---

#### `events.healthNodes`
**Type:** Query · **Access:** `PERM(events, read)`

Maps CI items to a health status for infrastructure topology health monitoring.

**Returns:** `{ id, name, type, status, health }[]`

---

#### `events.dashboard`
**Type:** Query · **Access:** `PERM(events, read)`

**Returns:** Event aggregates (counts by severity, recent events)

---

### 6.27 `facilities`

Building, room, booking, and facilities request management.

---

#### `facilities.buildings.list`
**Type:** Query · **Access:** `PERM(facilities, read)`

**Returns:** `Building[]`

---

#### `facilities.buildings.get`
**Type:** Query · **Access:** `PERM(facilities, read)`

**Input:** `{ id: uuid }`  
**Returns:** `Building`

---

#### `facilities.buildings.create`
**Type:** Mutation · **Access:** `PERM(facilities, write)`

**Input:** `{ name, address?, city?, country?, floors? }`  
**Returns:** `Building`

---

#### `facilities.rooms.list`
**Type:** Query · **Access:** `PERM(facilities, read)`

**Input:** `{ buildingId?: uuid }`  
**Returns:** `Room[]`

---

#### `facilities.rooms.checkAvailability`
**Type:** Query · **Access:** `PERM(facilities, read)`

**Input:** `{ roomId: uuid, startTime: datetime, endTime: datetime }`  
**Returns:** `{ available: boolean, conflicts: RoomBooking[] }`

---

#### `facilities.bookings.list`
**Type:** Query · **Access:** `PERM(facilities, read)`

**Returns:** `RoomBooking[]`

---

#### `facilities.bookings.create`
**Type:** Mutation · **Access:** `PERM(facilities, write)`

Creates a room booking after checking for conflicts.

**Input:** `{ roomId: uuid, startTime: datetime, endTime: datetime, title?, attendees? }`  
**Returns:** `RoomBooking`

---

#### `facilities.moveRequests.list`
**Type:** Query · **Access:** `PERM(facilities, read)`

**Returns:** `MoveRequest[]`

---

#### `facilities.moveRequests.create`
**Type:** Mutation · **Access:** `PERM(facilities, write)`

**Input:** `{ requestorId, fromLocation, toLocation, scheduledDate?, notes? }`  
**Returns:** `MoveRequest`

---

#### `facilities.facilityRequests.list`
**Type:** Query · **Access:** `PERM(facilities, read)`

**Returns:** `FacilityRequest[]`

---

#### `facilities.facilityRequests.create`
**Type:** Mutation · **Access:** `PERM(facilities, write)`

**Input:** `{ type, description, location?, priority?, requestorId? }`  
**Returns:** `FacilityRequest`

---

### 6.28 `walkup`

Walk-up service desk queue management.

---

#### `walkup.queue.list`
**Type:** Query · **Access:** `PERM(incidents, read)`

**Returns:** Current walk-up queue entries

---

#### `walkup.queue.joinQueue`
**Type:** Mutation · **Access:** `AUTH`

**Input:** `{ locationId: string, issueType: string, description?: string }`  
**Returns:** Queue entry with estimated wait time

---

#### `walkup.queue.callNext`
**Type:** Mutation · **Access:** `PERM(incidents, write)`

Calls the next person in the queue for a given location.

**Input:** `{ locationId: string }`  
**Returns:** Queue entry (or null if empty)

---

#### `walkup.queue.complete`
**Type:** Mutation · **Access:** `PERM(incidents, write)`

Marks a walk-up visit as complete.

**Input:** `{ id: uuid, resolution?: string }`  
**Returns:** Updated queue entry

---

#### `walkup.appointments.list`
**Type:** Query · **Access:** `PERM(incidents, read)`

**Returns:** `WalkupAppointment[]`

---

#### `walkup.appointments.create`
**Type:** Mutation · **Access:** `AUTH`

**Input:** `{ locationId: string, scheduledAt: datetime, issueType: string }`  
**Returns:** `WalkupAppointment`

---

#### `walkup.locations`
**Type:** Query · **Access:** `PERM(incidents, read)`

Returns available walk-up service desk locations.

**Returns:** Static location list

---

#### `walkup.analytics`
**Type:** Query · **Access:** `PERM(incidents, read)`

Returns walk-up visit analytics (count, avg wait/service time).

**Returns:** `{ totalVisits, avgWaitMinutes, avgServiceMinutes }`

---

### 6.29 `vendors`

Vendor registry and performance management.

---

#### `vendors.list`
**Type:** Query · **Access:** `PERM(procurement, read)`

**Returns:** `Vendor[]`

---

#### `vendors.get`
**Type:** Query · **Access:** `PERM(procurement, read)`

**Input:** `{ id: uuid }`  
**Returns:** `Vendor`

---

#### `vendors.create`
**Type:** Mutation · **Access:** `PERM(procurement, write)`

**Input:** `{ name, contactEmail?, phone?, address?, paymentTerms?, category? }`  
**Returns:** `Vendor`

---

#### `vendors.update`
**Type:** Mutation · **Access:** `PERM(procurement, write)`

**Input:** `{ id, status?, rating?, notes? }`  
**Returns:** Updated `Vendor`

---

#### `vendors.performance`
**Type:** Query · **Access:** `PERM(procurement, read)`

Aggregates PO data to compute on-time delivery rates and spend per vendor.

**Input:** `{ id: uuid }`  
**Returns:** `{ onTimeRate, totalSpend, poCount, avgLeadTimeDays }`

---

#### `vendors.riskAssessment`
**Type:** Query · **Access:** `PERM(procurement, read)`

Returns a heuristic risk score based on vendor rating and delivery history.

**Input:** `{ id: uuid }`  
**Returns:** `{ riskLevel, score, factors: string[] }`

---

### 6.30 `approvals`

Multi-level approval workflow management.

---

#### `approvals.myPending`
**Type:** Query · **Access:** `PERM(approvals, read)`

Returns approval items currently pending the authenticated user's decision.

**Returns:** `ApprovalStep[]` with related entity details

---

#### `approvals.mySubmitted`
**Type:** Query · **Access:** `PERM(approvals, read)`

Returns approval requests submitted by the current user.

**Returns:** `ApprovalStep[]` *(currently returns empty array — wiring pending)*

---

#### `approvals.decide`
**Type:** Mutation · **Access:** `PERM(approvals, approve)`

Records an approval or rejection decision. Uses optimistic concurrency, records a step, sends a notification, and optionally enqueues a workflow trigger.

**Input:**

| Field | Type |
|-------|------|
| `stepId` | uuid |
| `decision` | `"approved"` \| `"rejected"` |
| `comments` | string? |

**Returns:** Updated `ApprovalStep`

---

#### `approvals.list`
**Type:** Query · **Access:** `PERM(approvals, read)`

Paginated approval list with optional filters.

**Input:** `{ status?, resourceType?, assigneeId?, limit?, cursor? }`  
**Returns:** `{ items: ApprovalStep[], nextCursor }`

---

### 6.31 `reports`

Cross-module reporting and analytics.

---

#### `reports.executiveOverview`
**Type:** Query · **Access:** `PERM(reports, read)`

Returns a high-level operational snapshot suitable for executive dashboards.

**Returns:** `{ incidentMetrics, changeMetrics, assetMetrics, projectMetrics, hrMetrics, financialMetrics }`

---

#### `reports.slaDashboard`
**Type:** Query · **Access:** `PERM(reports, read)`

Returns SLA performance metrics including breach rates and response time percentiles.

**Returns:** SLA KPI aggregates

---

#### `reports.workloadAnalysis`
**Type:** Query · **Access:** `PERM(reports, read)`

Returns workload distribution analysis across teams and agents.

**Returns:** Per-team ticket and WO counts, capacity utilization

---

#### `reports.trendAnalysis`
**Type:** Query · **Access:** `PERM(reports, read)`

Returns trend data for key operational metrics over a time period.

**Input:** `{ days?: number (default 30) }`  
**Returns:** Time-series trend data by domain

---

### 6.32 `search`

Federated full-text search across all modules.

---

#### `search.global`
**Type:** Query · **Access:** `AUTH`

Performs a full-text search across multiple entity types using Meilisearch.

**Input:**

| Field | Type | Default |
|-------|------|---------|
| `query` | string (1–200) | required |
| `entityTypes` | string[]? | All types |
| `limit` | number | `20` |

**Returns:** `SearchResult[]` with `type`, `id`, `title`, `excerpt`, `url`

---

### 6.33 `ai`

AI-powered assistance via Anthropic Claude.

---

#### `ai.summarizeTicket`
**Type:** Query · **Access:** `PERM(incidents, read)`

Generates an AI summary of a ticket's description and comment thread.

**Input:** `{ ticketId: uuid }`  
**Returns:** `{ summary: string } | null`

---

#### `ai.suggestResolution`
**Type:** Query · **Access:** `PERM(incidents, read)`

Suggests a resolution for a ticket based on its category, description, and similar resolved tickets in the knowledge base.

**Input:** `{ ticketId: uuid }`  
**Returns:** `{ suggestion: string } | null`

---

## Appendix A — Procedure Access Summary

| Router | Total Procedures | Public | Auth | Permission | Admin |
|--------|-----------------|--------|------|------------|-------|
| auth | 12 | 5 | 4 | 3 | 0 |
| admin | 9 | 0 | 0 | 0 | 9 |
| tickets | 7 | 0 | 0 | 7 | 0 |
| changes | 13 | 0 | 0 | 13 | 0 |
| workOrders | 7 | 0 | 0 | 7 | 0 |
| assets | 15 | 0 | 0 | 15 | 0 |
| workflows | 9 | 0 | 0 | 9 | 0 |
| hr | 11 | 0 | 0 | 11 | 0 |
| procurement | 9 | 0 | 0 | 9 | 0 |
| dashboard | 3 | 0 | 0 | 3 | 0 |
| security | 10 | 0 | 0 | 10 | 0 |
| grc | 11 | 0 | 0 | 11 | 0 |
| financial | 10 | 0 | 0 | 10 | 0 |
| contracts | 8 | 0 | 0 | 8 | 0 |
| projects | 10 | 0 | 0 | 10 | 0 |
| crm | 12 | 0 | 0 | 12 | 0 |
| legal | 9 | 0 | 0 | 9 | 0 |
| devops | 7 | 0 | 0 | 7 | 0 |
| surveys | 6 | 0 | 1 | 5 | 0 |
| knowledge | 6 | 0 | 1 | 5 | 0 |
| notifications | 8 | 0 | 6 | 2 | 0 |
| catalog | 6 | 0 | 1 | 5 | 0 |
| csm | 4 | 0 | 0 | 4 | 0 |
| apm | 5 | 0 | 0 | 5 | 0 |
| oncall | 6 | 0 | 0 | 6 | 0 |
| events | 5 | 0 | 0 | 5 | 0 |
| facilities | 11 | 0 | 0 | 11 | 0 |
| walkup | 7 | 0 | 2 | 5 | 0 |
| vendors | 6 | 0 | 0 | 6 | 0 |
| approvals | 4 | 0 | 0 | 4 | 0 |
| reports | 4 | 0 | 0 | 4 | 0 |
| search | 1 | 0 | 1 | 0 | 0 |
| ai | 2 | 0 | 0 | 2 | 0 |
| **TOTAL** | **~282** | **5** | **16** | **252** | **9** |

---

## Appendix B — Zod Input Types Reference

Shared schemas from `@nexusops/types`:

| Schema | Used In | Key Fields |
|--------|---------|-----------|
| `SignupSchema` | `auth.signup` | name, email, password, orgName |
| `LoginSchema` | `auth.login` | email, password |
| `InviteCreateSchema` | `auth.inviteUser` | email, role, name? |
| `CreateTicketSchema` | `tickets.create` | title, categoryId, priorityId, type, assigneeId, tags, customFields |
| `UpdateTicketSchema` | `tickets.update` | All ticket fields (partial) |
| `AddCommentSchema` | `tickets.addComment` | ticketId, body, isInternal |
| `TicketListFiltersSchema` | `tickets.list` | All filter fields |
| `CreateAssetSchema` | `assets.create` | name, typeId, status, purchaseCost, etc. |
| `CreatePurchaseRequestSchema` | `procurement.purchaseRequests.create` | title, items[], justification |
| `CreateLeaveRequestSchema` | `hr.leave.create` | type, startDate, endDate, reason |

---

## Appendix C — Rate Limiting

All endpoints are subject to Redis-backed rate limiting:

| Caller Type | Limit Key | Default Cap |
|-------------|-----------|-------------|
| Authenticated | Per session token | `RATE_LIMIT_MAX` env (default 200,000/window) |
| Unauthenticated | Per IP address | `RATE_LIMIT_ANON_MAX` env |

Exceeding the limit returns HTTP 429 with `TRPCError({ code: "TOO_MANY_REQUESTS" })`.

---

## Appendix D — Audit Logging

Every **mutation** on a `protectedProcedure` or higher is automatically audit-logged via the `auditMutation` middleware. Log entries are written to the `audit_logs` table and include:

| Field | Value |
|-------|-------|
| `userId` | Authenticated user |
| `orgId` | Organisation |
| `action` | Procedure path (e.g. `tickets.create`) |
| `resourceType` | Entity type |
| `resourceId` | Entity ID (where applicable) |
| `ip` | Client IP |
| `userAgent` | Client UA |
| `timestamp` | UTC timestamp |

Audit logs are queryable by org admins via `admin.auditLog.list`.

---

*End of API Specification*

*For questions, contact the NexusOps platform team at Coheron.*
