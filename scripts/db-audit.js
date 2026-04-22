#!/usr/bin/env node
/**
 * NexusOps — Data Integrity Audit
 *
 * Runs every integrity check against the live DB and emits a structured
 * PASS / WARN / FAIL report. Exit code 1 if any FAIL exists.
 *
 * Usage:
 *   node scripts/db-audit.js
 *   DATABASE_URL=postgres://... node scripts/db-audit.js
 */

"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DB = process.env.DATABASE_URL ?? "postgresql://nexusops:nexusops@localhost:5434/nexusops";

// ── helpers ──────────────────────────────────────────────────────────────────

const _tmpFile = path.join(os.tmpdir(), "nexusops-audit.sql");

function q(sql) {
  fs.writeFileSync(_tmpFile, sql, "utf8");
  try {
    return execSync(
      `psql "${DB}" -tA --csv -f "${_tmpFile}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    )
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch (e) {
    throw new Error("Query failed: " + (e.stderr ?? e.message)?.slice(0, 200));
  }
}

function scalar(sql) {
  const rows = q(sql);
  return rows[0] ?? "0";
}

// ── reporter ─────────────────────────────────────────────────────────────────

const findings = [];

function pass(check, detail = "") {
  findings.push({ status: "PASS", check, detail });
  console.log(`  ✓  ${check}${detail ? "  →  " + detail : ""}`);
}

function warn(check, detail = "") {
  findings.push({ status: "WARN", check, detail });
  console.warn(`  ⚠  ${check}  →  ${detail}`);
}

function fail(check, detail = "") {
  findings.push({ status: "FAIL", check, detail });
  console.error(`  ✗  ${check}  →  ${detail}`);
}

function rowsOrPass(rows, check, format) {
  if (rows.length === 0) {
    pass(check, "0 violations");
  } else {
    fail(check, `${rows.length} violation(s):\n${rows.slice(0, 5).map(r => "       " + format(r)).join("\n")}`);
  }
}

// ── section header ────────────────────────────────────────────────────────────

function section(title) {
  console.log("\n── " + title + " " + "─".repeat(Math.max(0, 55 - title.length)));
}

// ═════════════════════════════════════════════════════════════════════════════
// RUN AUDIT
// ═════════════════════════════════════════════════════════════════════════════

async function run() {
  console.log("\n NexusOps — Data Integrity Audit");
  console.log(" DB: " + DB.replace(/:\/\/[^@]+@/, "://***@") + "\n");

  // ── 0. Quick counts ───────────────────────────────────────────────────────
  section("0. Record Counts");
  for (const [label, table] of [
    ["tickets",          "tickets"],
    ["change_requests",  "change_requests"],
    ["approval_requests","approval_requests"],
    ["purchase_requests","purchase_requests"],
    ["users",            "users"],
    ["organizations",    "organizations"],
    ["sessions",         "sessions"],
    ["audit_logs",       "audit_logs"],
  ]) {
    const n = scalar(`SELECT COUNT(*) FROM ${table}`);
    console.log(`  ${label.padEnd(24)} ${n.padStart(6)} rows`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHECK 1 — TICKETS
  // ══════════════════════════════════════════════════════════════════════════
  section("1. Tickets");

  // 1a. NULL/empty title (schema has NOT NULL but data import could bypass)
  {
    const n = scalar("SELECT COUNT(*) FROM tickets WHERE trim(title) = '' OR title IS NULL");
    n === "0" ? pass("No ticket with blank/null title") : fail("Tickets with blank/null title", `${n} found`);
  }

  // 1b. NULL status_id
  {
    const n = scalar("SELECT COUNT(*) FROM tickets WHERE status_id IS NULL");
    n === "0" ? pass("No ticket with null status_id") : fail("Tickets with null status_id", `${n} found`);
  }

  // 1c. Broken FK: status_id references non-existent ticket_status
  {
    const rows = q(`
      SELECT t.id, t.number, t.status_id
      FROM tickets t
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
      WHERE ts.id IS NULL
      LIMIT 10
    `);
    rowsOrPass(rows, "No ticket with orphaned status_id FK",
      r => { const [id, num, sid] = r.split(","); return `ticket ${num} (${id?.slice(0,8)}) → missing status ${sid?.slice(0,8)}`; });
  }

  // 1d. Broken FK: org_id references non-existent org
  {
    const rows = q(`
      SELECT t.id, t.number, t.org_id
      FROM tickets t
      LEFT JOIN organizations o ON t.org_id = o.id
      WHERE o.id IS NULL
      LIMIT 10
    `);
    rowsOrPass(rows, "No ticket with orphaned org_id FK",
      r => { const [id, num, oid] = r.split(","); return `ticket ${num} (${id?.slice(0,8)}) → missing org ${oid?.slice(0,8)}`; });
  }

  // 1e. Broken FK: requester_id references non-existent user
  {
    const rows = q(`
      SELECT t.id, t.number
      FROM tickets t
      LEFT JOIN users u ON t.requester_id = u.id
      WHERE t.requester_id IS NOT NULL AND u.id IS NULL
      LIMIT 10
    `);
    rowsOrPass(rows, "No ticket with orphaned requester_id FK",
      r => { const [id, num] = r.split(","); return `ticket ${num} (${id?.slice(0,8)})`; });
  }

  // 1f. version < 1 (corrupted optimistic lock counter)
  {
    const n = scalar("SELECT COUNT(*) FROM tickets WHERE version < 1");
    n === "0" ? pass("All ticket versions ≥ 1") : fail("Tickets with version < 1", `${n} found`);
  }

  // 1g. SLA: if sla_resolve_due_at < sla_response_due_at (inverted SLA window)
  {
    const n = scalar(`
      SELECT COUNT(*) FROM tickets
      WHERE sla_response_due_at IS NOT NULL
        AND sla_resolve_due_at IS NOT NULL
        AND sla_resolve_due_at < sla_response_due_at
    `);
    n === "0"
      ? pass("No inverted SLA windows (resolve_due ≥ response_due)")
      : fail("Tickets with inverted SLA window (resolve_due < response_due)", `${n} found`);
  }

  // 1h. SLA breached flag vs actual due date (should be consistent)
  {
    const n = scalar(`
      SELECT COUNT(*) FROM tickets
      WHERE sla_breached = false
        AND sla_resolve_due_at IS NOT NULL
        AND sla_resolve_due_at < NOW()
        AND status_id NOT IN (
          SELECT id FROM ticket_statuses WHERE category IN ('resolved','closed')
        )
    `);
    n === "0"
      ? pass("No open tickets with expired SLA but sla_breached=false")
      : warn("Open tickets past SLA deadline but sla_breached=false", `${n} found — run SLA sync`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHECK 2 — APPROVALS
  // ══════════════════════════════════════════════════════════════════════════
  section("2. Approvals");

  // 2a. Approval without entity_id (source reference)
  {
    const n = scalar("SELECT COUNT(*) FROM approval_requests WHERE entity_id IS NULL");
    n === "0" ? pass("No approval_request with null entity_id") : fail("Approvals with null entity_id", `${n} found`);
  }

  // 2b. Stuck in pending after decided_at is set (status/timestamp mismatch)
  {
    const n = scalar(`
      SELECT COUNT(*) FROM approval_requests
      WHERE status = 'pending' AND decided_at IS NOT NULL
    `);
    n === "0"
      ? pass("No approval stuck in pending with a decided_at timestamp")
      : fail("Approvals status=pending but decided_at set", `${n} found — decision not committed`);
  }

  // 2c. Decided but missing decided_at timestamp
  {
    const n = scalar(`
      SELECT COUNT(*) FROM approval_requests
      WHERE status IN ('approved','rejected') AND decided_at IS NULL
    `);
    n === "0"
      ? pass("All decided approvals have decided_at timestamp")
      : fail("Decided approvals (approved/rejected) missing decided_at", `${n} found`);
  }

  // 2d. Approved with no approver reference
  {
    const rows = q(`
      SELECT ar.id, ar.status
      FROM approval_requests ar
      LEFT JOIN users u ON ar.approver_id = u.id
      WHERE u.id IS NULL
      LIMIT 10
    `);
    rowsOrPass(rows, "No approval with orphaned approver_id FK",
      r => { const [id, status] = r.split(","); return `${id?.slice(0,8)} status=${status}`; });
  }

  // 2e. version integrity
  {
    const n = scalar("SELECT COUNT(*) FROM approval_requests WHERE version < 1");
    n === "0" ? pass("All approval versions ≥ 1") : fail("Approvals with version < 1", `${n} found`);
  }

  // 2f. Duplicate idempotency keys within same org
  {
    const rows = q(`
      SELECT org_id, idempotency_key, COUNT(*) AS cnt
      FROM approval_requests
      WHERE idempotency_key IS NOT NULL
      GROUP BY org_id, idempotency_key
      HAVING COUNT(*) > 1
      LIMIT 5
    `);
    rowsOrPass(rows, "No duplicate idempotency keys in approval_requests",
      r => { const [oid, key, cnt] = r.split(","); return `org ${oid?.slice(0,8)} key=${key} count=${cnt}`; });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHECK 3 — CHANGE REQUESTS
  // ══════════════════════════════════════════════════════════════════════════
  section("3. Change Requests");

  // 3a. version integrity
  {
    const n = scalar("SELECT COUNT(*) FROM change_requests WHERE version < 1");
    n === "0" ? pass("All change_request versions ≥ 1") : fail("Change requests with version < 1", `${n} found`);
  }

  // 3b. Changes in 'approved' status but no change_approvals record
  {
    const rows = q(`
      SELECT cr.id, cr.number, cr.status
      FROM change_requests cr
      WHERE cr.status = 'approved'
        AND NOT EXISTS (
          SELECT 1 FROM change_approvals ca WHERE ca.change_id = cr.id
        )
      LIMIT 10
    `);
    rowsOrPass(rows, "All approved change_requests have at least one change_approval record",
      r => { const [id, num, status] = r.split(","); return `CR ${num} (${id?.slice(0,8)}) status=${status}`; });
  }

  // 3c. Orphaned org
  {
    const rows = q(`
      SELECT cr.id, cr.number
      FROM change_requests cr
      LEFT JOIN organizations o ON cr.org_id = o.id
      WHERE o.id IS NULL
      LIMIT 10
    `);
    rowsOrPass(rows, "No change_request with orphaned org_id",
      r => { const [id, num] = r.split(","); return `CR ${num} (${id?.slice(0,8)})`; });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHECK 4 — USERS
  // ══════════════════════════════════════════════════════════════════════════
  section("4. Users");

  // 4a. Users without org_id (schema enforces NOT NULL, but check anyway)
  {
    const n = scalar("SELECT COUNT(*) FROM users WHERE org_id IS NULL");
    n === "0" ? pass("All users have org_id") : fail("Users with null org_id", `${n} found`);
  }

  // 4b. Users whose org_id points to a deleted org
  {
    const rows = q(`
      SELECT u.id, u.email, u.org_id
      FROM users u
      LEFT JOIN organizations o ON u.org_id = o.id
      WHERE o.id IS NULL
      LIMIT 10
    `);
    rowsOrPass(rows, "No user with orphaned org_id FK",
      r => { const [id, email, oid] = r.split(","); return `${email} (${id?.slice(0,8)}) org=${oid?.slice(0,8)}`; });
  }

  // 4c. Active users with no email set
  {
    const n = scalar("SELECT COUNT(*) FROM users WHERE trim(email) = '' OR email IS NULL");
    n === "0" ? pass("All users have email") : fail("Users with blank/null email", `${n} found`);
  }

  // 4d. Duplicate email within same org (should be caught by unique index)
  {
    const rows = q(`
      SELECT org_id, email, COUNT(*) AS cnt
      FROM users
      GROUP BY org_id, email
      HAVING COUNT(*) > 1
      LIMIT 5
    `);
    rowsOrPass(rows, "No duplicate (org_id, email) pairs in users",
      r => { const [oid, email, cnt] = r.split(","); return `org ${oid?.slice(0,8)} ${email} x${cnt}`; });
  }

  // 4e. RBAC: 'owner' role exists (at least 1 per org)
  {
    const rows = q(`
      SELECT o.slug, COUNT(u.id) AS owner_count
      FROM organizations o
      LEFT JOIN users u ON u.org_id = o.id AND u.role = 'owner'
      GROUP BY o.id, o.slug
      HAVING COUNT(u.id) = 0
    `);
    rowsOrPass(rows, "Every organization has at least one owner",
      r => { const [slug] = r.split(","); return `org '${slug}' has no owner`; });
  }

  // 4f. Users with invalid / unrecognised role value (should never happen with enum)
  {
    const rows = q(`
      SELECT id, email, role::text
      FROM users
      WHERE role::text NOT IN ('owner','admin','member','viewer')
      LIMIT 5
    `);
    rowsOrPass(rows, "All user roles are valid enum values",
      r => { const [id, email, role] = r.split(","); return `${email} role=${role}`; });
  }

  // 4g. Disabled users still holding active sessions
  {
    const rows = q(`
      SELECT u.id, u.email, COUNT(s.id) AS active_sessions
      FROM users u
      JOIN sessions s ON s.user_id = u.id AND s.expires_at > NOW()
      WHERE u.status = 'disabled'
      GROUP BY u.id, u.email
      HAVING COUNT(s.id) > 0
      LIMIT 5
    `);
    rowsOrPass(rows, "No disabled users with live sessions",
      r => { const [id, email, cnt] = r.split(","); return `${email} (${id?.slice(0,8)}) ${cnt} live sessions`; });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHECK 5 — DUPLICATES
  // ══════════════════════════════════════════════════════════════════════════
  section("5. Duplicates");

  // 5a. Duplicate ticket titles per org
  {
    const rows = q(`
      SELECT org_id, title, COUNT(*) AS cnt
      FROM tickets
      GROUP BY org_id, title
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC
      LIMIT 10
    `);
    if (rows.length === 0) {
      pass("No duplicate ticket titles within same org");
    } else {
      warn("Duplicate ticket titles within org (not an error, but notable)",
        `${rows.length} title(s) repeated:\n${rows.slice(0,5).map(r => { const [, title, cnt] = r.split(","); return "       " + JSON.stringify(title) + " ×" + cnt; }).join("\n")}`);
    }
  }

  // 5b. Duplicate ticket (org, number) — must be zero (unique index)
  {
    const rows = q(`
      SELECT org_id, number, COUNT(*) AS cnt
      FROM tickets
      GROUP BY org_id, number
      HAVING COUNT(*) > 1
      LIMIT 5
    `);
    rowsOrPass(rows, "No duplicate (org_id, number) in tickets",
      r => { const [oid, num, cnt] = r.split(","); return `org ${oid?.slice(0,8)} ${num} x${cnt}`; });
  }

  // 5c. Duplicate idempotency keys in tickets (per org)
  {
    const rows = q(`
      SELECT org_id, idempotency_key, COUNT(*) AS cnt
      FROM tickets
      WHERE idempotency_key IS NOT NULL
      GROUP BY org_id, idempotency_key
      HAVING COUNT(*) > 1
      LIMIT 5
    `);
    rowsOrPass(rows, "No duplicate idempotency keys in tickets",
      r => { const [oid, key, cnt] = r.split(","); return `org ${oid?.slice(0,8)} key=${key} x${cnt}`; });
  }

  // 5d. Duplicate change_request (org, number)
  {
    const rows = q(`
      SELECT org_id, number, COUNT(*) AS cnt
      FROM change_requests
      GROUP BY org_id, number
      HAVING COUNT(*) > 1
      LIMIT 5
    `);
    rowsOrPass(rows, "No duplicate (org_id, number) in change_requests",
      r => { const [oid, num, cnt] = r.split(","); return `org ${oid?.slice(0,8)} ${num} x${cnt}`; });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHECK 6 — FOREIGN KEY HEALTH (cross-table orphan sweep)
  // ══════════════════════════════════════════════════════════════════════════
  section("6. Cross-table FK Health");

  // 6a. ticket_activity_logs without a valid ticket
  {
    const rows = q(`
      SELECT tal.id, tal.ticket_id
      FROM ticket_activity_logs tal
      LEFT JOIN tickets t ON tal.ticket_id = t.id
      WHERE t.id IS NULL
      LIMIT 5
    `);
    rowsOrPass(rows, "No orphaned ticket_activity_logs",
      r => { const [id, tid] = r.split(","); return `log ${id?.slice(0,8)} → missing ticket ${tid?.slice(0,8)}`; });
  }

  // 6b. ticket_comments without a valid ticket
  {
    const rows = q(`
      SELECT tc.id, tc.ticket_id
      FROM ticket_comments tc
      LEFT JOIN tickets t ON tc.ticket_id = t.id
      WHERE t.id IS NULL
      LIMIT 5
    `);
    rowsOrPass(rows, "No orphaned ticket_comments",
      r => { const [id, tid] = r.split(","); return `comment ${id?.slice(0,8)} → missing ticket ${tid?.slice(0,8)}`; });
  }

  // 6c. purchase_request_items without a valid purchase_request
  {
    const rows = q(`
      SELECT pri.id, pri.pr_id
      FROM purchase_request_items pri
      LEFT JOIN purchase_requests pr ON pri.pr_id = pr.id
      WHERE pr.id IS NULL
      LIMIT 5
    `);
    rowsOrPass(rows, "No orphaned purchase_request_items",
      r => { const [id, prid] = r.split(","); return `item ${id?.slice(0,8)} → missing PR ${prid?.slice(0,8)}`; });
  }

  // 6d. audit_logs without a valid user (user deleted but log kept — OK as warn)
  {
    const rows = q(`
      SELECT al.id, al.user_id
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.user_id IS NOT NULL AND u.id IS NULL
      LIMIT 5
    `);
    if (rows.length === 0) {
      pass("All audit_logs reference valid users");
    } else {
      warn("Audit logs reference deleted users (non-critical — user was removed)",
        `${rows.length} log(s): ${rows.slice(0,3).map(r => r.split(",")[1]?.slice(0,8)).join(", ")}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHECK 7 — SESSION HEALTH
  // ══════════════════════════════════════════════════════════════════════════
  section("7. Session Health");

  {
    const total  = scalar("SELECT COUNT(*) FROM sessions");
    const active = scalar("SELECT COUNT(*) FROM sessions WHERE expires_at > NOW()");
    const expired = parseInt(total) - parseInt(active);
    console.log(`  sessions: ${total} total  |  ${active} active  |  ${expired} expired`);
    if (expired > 10000) {
      warn("High number of expired sessions in DB — consider pruning",
        `${expired} expired rows (run: DELETE FROM sessions WHERE expires_at < NOW())`);
    } else {
      pass("Expired session count is manageable", `${expired} rows`);
    }
  }

  {
    const rows = q(`
      SELECT s.id, s.user_id
      FROM sessions s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE u.id IS NULL
      LIMIT 5
    `);
    rowsOrPass(rows, "No sessions referencing deleted users",
      r => { const [id, uid] = r.split(","); return `session ${id?.slice(0,8)} → missing user ${uid?.slice(0,8)}`; });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  const passes = findings.filter(f => f.status === "PASS").length;
  const warns  = findings.filter(f => f.status === "WARN").length;
  const fails  = findings.filter(f => f.status === "FAIL").length;

  console.log("\n" + "═".repeat(60));
  console.log(`  Audit complete: ${passes} passed  ${warns} warnings  ${fails} failures`);

  if (fails > 0) {
    console.error("\n  FAILURES:");
    for (const f of findings.filter(x => x.status === "FAIL")) {
      console.error(`    ✗  ${f.check}`);
      console.error(`       ${f.detail}`);
    }
  }

  if (warns > 0) {
    console.warn("\n  WARNINGS:");
    for (const w of findings.filter(x => x.status === "WARN")) {
      console.warn(`    ⚠  ${w.check}`);
      console.warn(`       ${w.detail}`);
    }
  }

  console.log("═".repeat(60) + "\n");

  if (fails > 0) process.exit(1);
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
