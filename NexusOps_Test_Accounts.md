# CoheronConnect — Test Accounts Reference

**Organization:** Coheron Demo (`coheron-demo`)
**Universal Password:** `demo1234!`

---

## Accounts

| # | Email | Name | Password | DB Role | Matrix Role(s) |
|---|-------|------|----------|---------|----------------|
| 1 | `admin@coheron.com` | Alex Chen | `demo1234!` | `owner` | `admin` (full access) |
| 2 | `agent1@coheron.com` | Jordan Smith | `demo1234!` | `member` | `itil` |
| 3 | `agent2@coheron.com` | Sam Rivera | `demo1234!` | `member` | `operator_field` |
| 4 | `hr@coheron.com` | Morgan Lee | `demo1234!` | `member` | `requester` + `hr_manager` |
| 5 | `finance@coheron.com` | Taylor Kim | `demo1234!` | `member` | `requester` + `finance_manager` |
| 6 | `employee@coheron.com` | Casey Brown | `demo1234!` | `member` | `requester` |
| 7 | `viewer@coheron.com` | Robin White | `demo1234!` | `viewer` | `requester` + `report_viewer` |

> **Note:** The accounts above are deterministic for demo purposes. However, as of v2.2, the platform now seeds **40+ additional unique users** and **hundreds of transactional records** (tickets, assets, deals, etc.) dynamically using Faker.js.

---

## Role Descriptions

### `admin` — Platform Administrator
> Assigned to: **Alex Chen** (`admin@coheron.com`)

Full unrestricted access to every module and action across the entire platform. Bypasses all RBAC permission checks. Can manage users, roles, system properties, audit logs, and all domain modules.

---

### `itil` — Service Desk / ITSM Analyst
> Assigned to: **Jordan Smith** (`agent1@coheron.com`)

Standard IT service desk analyst. Scoped strictly to IT modules — cannot access GRC, finance, procurement, CRM, or projects without an additional matrix role.

| Module | Permissions |
|--------|-------------|
| Incidents | read, write, assign, close |
| Requests | read, write, assign, close |
| Changes | read, write |
| Problems | read, write |
| Work Orders | read |
| Knowledge | read, write |
| Approvals | read, approve |
| CMDB / HAM / SAM | read |
| Facilities | read |
| Reports | read |

---

### `operator_field` — Field Service Technician
> Assigned to: **Sam Rivera** (`agent2@coheron.com`)

Field technician role for work order execution, parts usage, and dispatch. No ITSM admin access. Preferred over the legacy `field_service` role (v3.1+).

| Module | Permissions |
|--------|-------------|
| Work Orders | read, write, assign, close |
| Incidents | read, write |
| Inventory | read, write |
| HAM | read, write |
| CMDB | read |
| Knowledge | read |
| Facilities | read |

---

### `hr_manager` — HR Manager
> Assigned to: **Morgan Lee** (`hr@coheron.com`) — effective roles: `requester` + `hr_manager`

Full authority over HR and onboarding modules, including approval workflows. Also inherits `requester` permissions for self-service access.

| Module | Permissions |
|--------|-------------|
| HR | read, write, delete, admin, assign, close, approve |
| Onboarding | read, write, admin |
| Approvals | read, write, approve, admin |
| Reports | read, write |
| Catalog | read |
| Knowledge | read |
| *(via requester)* | catalog r/w, incidents r/w, requests r/w, facilities r/w, procurement r/w |

---

### `finance_manager` — Finance Manager
> Assigned to: **Taylor Kim** (`finance@coheron.com`) — effective roles: `requester` + `finance_manager`

Full financial authority including budget management and chargebacks. Can read and approve procurement but cannot create purchase orders directly. Also inherits `requester` permissions.

| Module | Permissions |
|--------|-------------|
| Financial | read, write, delete, admin |
| Budget | read, write, admin |
| Chargebacks | read, write, admin |
| Procurement | read, approve |
| Purchase Orders | read, approve |
| Contracts | read, write |
| Vendors | read, write |
| Reports | read, write, admin |
| Analytics | read, write |
| *(via requester)* | catalog r/w, incidents r/w, requests r/w, facilities r/w, procurement r/w |

---

### `requester` — Employee (Self-Service)
> Assigned to: **Casey Brown** (`employee@coheron.com`)

Default role for all `member` DB users with no matrix role. Self-service only — submit incidents/requests, browse the service catalog and knowledge base, raise HR cases, submit purchase requests, and view own approvals.

| Module | Permissions |
|--------|-------------|
| Catalog | read, write |
| Knowledge | read |
| Incidents | read, write |
| Requests | read, write |
| Approvals | read |
| Facilities | read, write |
| HR | read, write |
| Procurement | read, write |

---

### `report_viewer` — Read-Only Viewer
> Assigned to: **Robin White** (`viewer@coheron.com`) — effective roles: `requester` + `report_viewer`

Read-only access to reports, analytics, and key ITSM record types. Cannot create or modify any records. Inherits `requester` permissions for self-service.

| Module | Permissions |
|--------|-------------|
| Reports | read |
| Analytics | read |
| Incidents | read |
| Requests | read |
| Changes | read |
| Problems | read |
| Users | read |
| *(via requester)* | catalog r/w, incidents r/w, requests r/w, facilities r/w, procurement r/w |

---

## Notes

- All accounts belong to the **Coheron Demo** organization.
- The `admin` role short-circuits all permission checks — it has implicit access to every module and action without needing explicit entries in the RBAC matrix.
- Domain accounts (`hr`, `finance`) receive the `requester` role as a base plus their domain-specific matrix role as an additive layer.
- The `viewer` DB role maps to the `["requester", "report_viewer"]` effective role pair.
- Passwords are managed via bcrypt (cost factor 12). Re-running `pnpm seed` will refresh all password hashes without re-seeding module data.
