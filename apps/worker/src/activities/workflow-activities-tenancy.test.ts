/**
 * Tenant isolation for the Temporal workflow activities.
 *
 * This worker connects with its own `pg` Pool as the application database user,
 * which is a superuser and BYPASSRLS — row-level security constrains NOTHING
 * here, so every predicate in workflow-activities.ts is load-bearing with no
 * second wall behind it. That makes this class of defect invisible to every
 * other gate: the database accepts the rows, typecheck cannot see data, and no
 * other suite drives these activities across two tenants.
 *
 * Every case below FAILED before 8db6e51 (4 of 5; the fifth is the control that
 * must pass in both states). If they all pass without the fix, they are broken.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createActivities } from "./workflow-activities";

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://coheronconnect_test:coheronconnect_test@localhost:5433/coheronconnect_test";

let pool: Pool;
let acts: ReturnType<typeof createActivities>;
let orgA = "", orgB = "", userA = "", userB = "", teamB = "";
let ticketA = "", runB = "";

async function seedOrg(label: string) {
  const id = randomUUID();
  await pool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1,$2,$3)`,
    [id, label, `${label}-${id.slice(0, 8)}`]);
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (org_id, email, name) VALUES ($1,$2,$3) RETURNING id`,
    [id, `${label}-${id.slice(0, 8)}@qa.test`, label]);
  return { id, userId: u.rows[0]!.id };
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  acts = createActivities(pool);

  const a = await seedOrg("tenant-verify-a"); orgA = a.id; userA = a.userId;
  const b = await seedOrg("tenant-verify-b"); orgB = b.id; userB = b.userId;

  const t = await pool.query<{ id: string }>(
    `INSERT INTO teams (org_id, name) VALUES ($1,'Org B team') RETURNING id`, [orgB]);
  teamB = t.rows[0]!.id;

  // org A's ticket — the thing org B's workflow must not touch
  const pr = await pool.query<{ id: string }>(
    `INSERT INTO ticket_priorities (org_id, name, sort_order) VALUES ($1,'P1',1) RETURNING id`, [orgA]);
  const st = await pool.query<{ id: string }>(
    `INSERT INTO ticket_statuses (org_id, name, category, sort_order) VALUES ($1,'Open','open',1) RETURNING id`, [orgA]);
  const tk = await pool.query<{ id: string }>(
    `INSERT INTO tickets (org_id, number, title, type, priority_id, status_id, requester_id)
     VALUES ($1,'TKT-VERIFY-1','ORG-A-TICKET','incident',$2,$3,$4) RETURNING id`,
    [orgA, pr.rows[0]!.id, st.rows[0]!.id, userA]);
  ticketA = tk.rows[0]!.id;

  // a run belonging to org B's workflow
  const wf = await pool.query<{ id: string }>(
    `INSERT INTO workflows (org_id, name, trigger_type, created_by_id)
     VALUES ($1,'Org B WF','manual',$2) RETURNING id`, [orgB, userB]);
  const ver = await pool.query<{ id: string }>(
    `INSERT INTO workflow_versions (workflow_id, version) VALUES ($1,1) RETURNING id`, [wf.rows[0]!.id]);
  const run = await pool.query<{ id: string }>(
    `INSERT INTO workflow_runs (workflow_id, workflow_version_id, status, started_at)
     VALUES ($1,$2,'running',now()) RETURNING id`, [wf.rows[0]!.id, ver.rows[0]!.id]);
  runB = run.rows[0]!.id;
});

afterAll(async () => {
  if (!pool) return;
  await pool.query(`DELETE FROM organizations WHERE id = ANY($1::uuid[])`, [[orgA, orgB]]);
  await pool.end();
});

const title = async (id: string) =>
  (await pool.query<{ title: string; assignee_id: string | null }>(
    `SELECT title, assignee_id FROM tickets WHERE id = $1`, [id])).rows[0];

describe("AUDIT VERIFY: apps/worker tenant scoping", () => {
  it("updateTicketField — org B cannot rewrite org A's ticket", async () => {
    await expect(acts.updateTicketField({
      orgId: orgB, runId: runB, nodeId: "uf-1",
      data: { field: "title", value: "PWNED BY ORG B" },
      context: { ticketId: ticketA },
    })).rejects.toThrow(/ticketId does not belong/);
    const row = await title(ticketA);
    expect(row!.title).toBe("ORG-A-TICKET");   // unchanged
  });

  it("assignTicket — org B cannot assign org A's ticket to org B's user", async () => {
    await expect(acts.assignTicket({
      orgId: orgB, runId: runB, nodeId: "as-1",
      data: { assigneeId: userB },
      context: { ticketId: ticketA },
    })).rejects.toThrow(/does not belong to this organisation/);
    const row = await title(ticketA);
    expect(row!.assignee_id).toBeNull();
  });

  it("assignTicket — a foreign TEAM is refused too", async () => {
    await expect(acts.assignTicket({
      orgId: orgA, runId: runB, nodeId: "as-2",
      data: { teamId: teamB },
      context: { ticketId: ticketA },
    })).rejects.toThrow(/teamId does not belong/);
  });

  it("sendNotification — org B cannot notify org A's user", async () => {
    await expect(acts.sendNotification({
      orgId: orgB, runId: runB, nodeId: "nt-1",
      data: { title: "x", message: "y", userId: userA },
      context: {},
    })).rejects.toThrow(/recipient does not belong/);
    const n = await pool.query(`SELECT 1 FROM notifications WHERE user_id = $1`, [userA]);
    expect(n.rows).toHaveLength(0);
  });

  it("CONTROL — org A's own workflow still works end to end", async () => {
    const wf = await pool.query<{ id: string }>(
      `INSERT INTO workflows (org_id, name, trigger_type, created_by_id)
       VALUES ($1,'Org A WF','manual',$2) RETURNING id`, [orgA, userA]);
    const ver = await pool.query<{ id: string }>(
      `INSERT INTO workflow_versions (workflow_id, version) VALUES ($1,1) RETURNING id`, [wf.rows[0]!.id]);
    const run = await pool.query<{ id: string }>(
      `INSERT INTO workflow_runs (workflow_id, workflow_version_id, status, started_at)
       VALUES ($1,$2,'running',now()) RETURNING id`, [wf.rows[0]!.id, ver.rows[0]!.id]);
    const runA = run.rows[0]!.id;

    await acts.updateTicketField({
      orgId: orgA, runId: runA, nodeId: "uf-ok",
      data: { field: "title", value: "LEGITIMATELY UPDATED" },
      context: { ticketId: ticketA },
    });
    expect((await title(ticketA))!.title).toBe("LEGITIMATELY UPDATED");

    await acts.assignTicket({
      orgId: orgA, runId: runA, nodeId: "as-ok",
      data: { assigneeId: userA },
      context: { ticketId: ticketA },
    });
    expect((await title(ticketA))!.assignee_id).toBe(userA);

    await acts.sendNotification({
      orgId: orgA, runId: runA, nodeId: "nt-ok",
      data: { title: "ok", message: "ok", userId: userA },
      context: {},
    });
    const n = await pool.query(`SELECT 1 FROM notifications WHERE user_id = $1`, [userA]);
    expect(n.rows.length).toBeGreaterThan(0);
  });
});
