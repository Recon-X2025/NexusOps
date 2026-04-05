/**
 * NexusOps — non-interactive "Day in the Life" chaos / vertical validation.
 *
 * Full vertical (seed + UI + DB counts): Postgres for Drizzle **must be the same DB the API uses**.
 *
 *   CHAOS_BASE_URL          — default http://139.84.154.78
 *   CHAOS_DATABASE_URL      — optional; if set, used for seed + DB assertions (overrides DATABASE_URL for this process)
 *   DATABASE_URL            — used when CHAOS_DATABASE_URL unset (also read from repo .env)
 *
 * UI-only on remote (no seed / no DB tunnel): use an account that already exists on that deployment:
 *
 *   CHAOS_SKIP_SEED=1
 *   CHAOS_LOGIN_EMAIL=...   CHAOS_LOGIN_PASSWORD=...   (or CHAOS_ADMIN_EMAIL / CHAOS_ADMIN_PASSWORD)
 *   CHAOS_SKIP_DB_ASSERT=1  — skip Drizzle counts at end
 *   CHAOS_ORG_SLUG         — when CHAOS_SKIP_SEED=1 and DB assert is on, org slug to count tickets in (default coheron-demo)
 *
 * If the base URL is remote but DATABASE_URL looks local, the test fails fast unless you set
 * CHAOS_ALLOW_DB_MISMATCH=1 (not recommended) or fix CHAOS_DATABASE_URL.
 *
 * Run:
 *   CHAOS_DATABASE_URL=postgresql://... pnpm exec playwright test -c tests/chaos-vertical/playwright.config.ts
 */
import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = process.env["CHAOS_BASE_URL"] ?? process.env["NEXUS_QA_BASE_URL"] ?? "http://139.84.154.78";
const DEFAULT_ADMIN_PASSWORD = "ChaosVertical!9";

function parseEnvLine(key: string, line: string): string | undefined {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`);
  const m = line.match(re);
  if (!m) return undefined;
  let v = m[1]!.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}

/** Load DATABASE_URL / CHAOS_DATABASE_URL from repo .env files when not already set. */
function loadChaosEnvFromFiles(): void {
  const roots = [path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../..")];
  for (const root of roots) {
    for (const name of [".env", ".env.local", ".env.production"]) {
      const p = path.join(root, name);
      if (!fs.existsSync(p)) continue;
      const text = fs.readFileSync(p, "utf8");
      for (const line of text.split("\n")) {
        if (!process.env["DATABASE_URL"]) {
          const du = parseEnvLine("DATABASE_URL", line);
          if (du) process.env["DATABASE_URL"] = du;
        }
        if (!process.env["CHAOS_DATABASE_URL"]) {
          const cu = parseEnvLine("CHAOS_DATABASE_URL", line);
          if (cu) process.env["CHAOS_DATABASE_URL"] = cu;
        }
      }
    }
  }
}

function resolveChaosDatabaseUrl(): string | undefined {
  loadChaosEnvFromFiles();
  const u = process.env["CHAOS_DATABASE_URL"]?.trim() || process.env["DATABASE_URL"]?.trim();
  return u || undefined;
}

function isLocalDatabaseHost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr.replace(/^postgresql:/i, "http:"));
    const h = (u.hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h.endsWith(".local");
  } catch {
    return /localhost|127\.0\.0\.1/i.test(urlStr);
  }
}

function isRemoteHttpBase(base: string): boolean {
  try {
    const h = new URL(base).hostname.toLowerCase();
    return h !== "localhost" && h !== "127.0.0.1";
  } catch {
    return true;
  }
}

function assertDatabaseMatchesRemoteBase(dbUrl: string): void {
  if (!isRemoteHttpBase(BASE)) return;
  if (!isLocalDatabaseHost(dbUrl)) return;
  if (process.env["CHAOS_ALLOW_DB_MISMATCH"] === "1" || process.env["CHAOS_ALLOW_DB_MISMATCH"] === "true")
    return;
  if (process.env["CHAOS_SKIP_SEED"] === "1" || process.env["CHAOS_SKIP_SEED"] === "true") return;

  throw new Error(
    [
      `Chaos test misconfiguration: CHAOS_BASE_URL is remote (${BASE}) but the DB URL looks local.`,
      `Seed writes to Postgres; login hits the remote API — they must use the same database.`,
      `Fix: set CHAOS_DATABASE_URL to the deployment Postgres (SSH tunnel is fine), or run with CHAOS_SKIP_SEED=1 and CHAOS_LOGIN_EMAIL / CHAOS_LOGIN_PASSWORD for an existing user, or set CHAOS_ALLOW_DB_MISMATCH=1 to force (will fail login if users differ).`,
    ].join("\n"),
  );
}

async function trpcLogin(page: Page, email: string, password: string): Promise<string> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const sessionId = await page.evaluate(
    async ({ base, email, password }) => {
      const r = await fetch(`${base}/api/trpc/auth.login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const text = await r.text();
      const data = JSON.parse(text) as unknown;
      const unwrap = (): string => {
        if (data && typeof data === "object" && !Array.isArray(data) && "error" in data) {
          const e = (data as { error?: { message?: string } }).error;
          const msg = typeof e?.message === "string" ? e.message : JSON.stringify((data as { error: unknown }).error);
          const hint =
            /invalid credentials|unauthorized/i.test(msg) && !/too many login attempts/i.test(msg)
              ? " — seed/DB mismatch: set CHAOS_DATABASE_URL to the API's Postgres, or CHAOS_SKIP_SEED=1 with CHAOS_LOGIN_EMAIL/PASSWORD."
              : "";
          throw new Error(msg + hint);
        }
        if (Array.isArray(data) && data[0]) {
          const first = data[0] as Record<string, unknown>;
          if (first["error"]) {
            const e = first["error"] as Record<string, unknown>;
            throw new Error(typeof e["message"] === "string" ? e["message"] : JSON.stringify(e));
          }
          const result = first["result"] as Record<string, unknown> | undefined;
          const inner = result?.["data"] as Record<string, unknown> | undefined;
          if (inner) {
            if (typeof inner["sessionId"] === "string") return inner["sessionId"] as string;
            const json = inner["json"] as Record<string, unknown> | undefined;
            if (typeof json?.["sessionId"] === "string") return json["sessionId"] as string;
          }
        }
        if (data && typeof data === "object" && "result" in data) {
          const d = (data as { result?: { data?: unknown } }).result?.data;
          if (d && typeof d === "object") {
            const bag = d as Record<string, unknown>;
            if (typeof bag["sessionId"] === "string") return bag["sessionId"] as string;
            const json = bag["json"] as Record<string, unknown> | undefined;
            if (json && typeof json["sessionId"] === "string") return json["sessionId"] as string;
          }
        }
        throw new Error(`Unexpected login response: ${text.slice(0, 400)}`);
      };
      return unwrap();
    },
    { base: BASE, email, password },
  );

  await page.evaluate(
    (sid) => {
      localStorage.setItem("nexusops_session", sid);
      document.cookie = `nexusops_session=${sid}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    },
    sessionId,
  );
  return sessionId;
}

async function seedChaosTenant(orgSlug: string, adminEmail: string, passwordPlain: string): Promise<void> {
  const dbUrl = resolveChaosDatabaseUrl();
  if (!dbUrl) throw new Error("CHAOS_DATABASE_URL or DATABASE_URL is required for Drizzle seed");
  process.env["DATABASE_URL"] = dbUrl;

  const {
    getDb,
    closeDb,
    organizations,
    users,
    ticketCategories,
    ticketPriorities,
    ticketStatuses,
    tickets,
    assets,
    assetTypes,
    eq,
    and,
    like,
    count,
  } = await import("@nexusops/db");

  const db = getDb();
  const passwordHash = await bcrypt.hash(passwordPlain, 12);

  const [existingOrg] = await db.select().from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);
  let orgId: string;
  if (!existingOrg) {
    const [o] = await db
      .insert(organizations)
      .values({
        name: `Chaos Tenant ${orgSlug}`,
        slug: orgSlug,
        plan: "professional",
        primaryColor: "#6366f1",
      })
      .returning();
    orgId = o!.id;
  } else {
    orgId = existingOrg.id;
  }

  await db.delete(tickets).where(and(eq(tickets.orgId, orgId), like(tickets.title, "CHAOS-SEED-%")));
  await db.delete(tickets).where(and(eq(tickets.orgId, orgId), like(tickets.title, "CHAOS-RUN-%")));
  await db.delete(assets).where(and(eq(assets.orgId, orgId), like(assets.assetTag, "CHAOS-AST-%")));

  const [u0] = await db.select().from(users).where(and(eq(users.orgId, orgId), eq(users.email, adminEmail))).limit(1);
  let adminId: string;
  if (!u0) {
    const [u] = await db
      .insert(users)
      .values({
        orgId,
        email: adminEmail,
        name: "Chaos Admin",
        passwordHash,
        role: "owner",
        status: "active",
      })
      .returning();
    adminId = u!.id;
  } else {
    await db.update(users).set({ passwordHash, status: "active", role: "owner" }).where(eq(users.id, u0.id));
    adminId = u0.id;
  }

  let [stAny] = await db.select().from(ticketStatuses).where(eq(ticketStatuses.orgId, orgId)).limit(1);
  let openStatusId: string;
  let inProgressStatusId: string;
  let defaultPriorityId: string;
  let defaultCategoryId: string;

  if (!stAny) {
    const cats = await db
      .insert(ticketCategories)
      .values([
        { orgId, name: "Chaos IT", color: "#6366f1", icon: "monitor", sortOrder: 0 },
      ])
      .returning();
    defaultCategoryId = cats[0]!.id;

    const prios = await db
      .insert(ticketPriorities)
      .values([
        {
          orgId,
          name: "High",
          color: "#f97316",
          slaResponseMinutes: 60,
          slaResolveMinutes: 480,
          sortOrder: 0,
        },
      ])
      .returning();
    defaultPriorityId = prios[0]!.id;

    const statuses = await db
      .insert(ticketStatuses)
      .values([
        { orgId, name: "Open", color: "#6366f1", category: "open", sortOrder: 0 },
        { orgId, name: "In Progress", color: "#f59e0b", category: "in_progress", sortOrder: 1 },
        { orgId, name: "Resolved", color: "#10b981", category: "resolved", sortOrder: 2 },
        { orgId, name: "Closed", color: "#6b7280", category: "closed", sortOrder: 3 },
      ])
      .returning();
    openStatusId = statuses.find((s) => s.category === "open")!.id;
    inProgressStatusId = statuses.find((s) => s.category === "in_progress")!.id;
  } else {
    const statuses = await db.select().from(ticketStatuses).where(eq(ticketStatuses.orgId, orgId));
    const open = statuses.find((s) => s.category === "open");
    const ip = statuses.find((s) => s.category === "in_progress");
    if (!open || !ip) {
      throw new Error(`Org ${orgSlug} has ticket statuses but missing open/in_progress — fix DB or use fresh slug`);
    }
    openStatusId = open.id;
    inProgressStatusId = ip.id;

    const [p0] = await db.select().from(ticketPriorities).where(eq(ticketPriorities.orgId, orgId)).limit(1);
    if (!p0) throw new Error(`Org ${orgSlug} missing ticket_priorities`);
    defaultPriorityId = p0.id;

    const [c0] = await db.select().from(ticketCategories).where(eq(ticketCategories.orgId, orgId)).limit(1);
    if (!c0) throw new Error(`Org ${orgSlug} missing ticket_categories`);
    defaultCategoryId = c0.id;
  }

  const numPrefix = orgSlug.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4) || "CHAO";
  const ticketValues = Array.from({ length: 50 }, (_, i) => ({
    orgId,
    number: `${numPrefix}-${String(i + 1).padStart(4, "0")}`,
    title: `CHAOS-SEED-${String(i + 1).padStart(3, "0")} seeded load ticket`,
    description: "Drizzle seed — chaos vertical suite",
    categoryId: defaultCategoryId,
    priorityId: defaultPriorityId,
    statusId: i % 3 === 0 ? inProgressStatusId : openStatusId,
    type: "incident" as const,
    impact: "medium" as const,
    urgency: "medium" as const,
    requesterId: adminId,
    slaBreached: false,
  }));

  await db.insert(tickets).values(ticketValues);

  const [typeRow] = await db.select().from(assetTypes).where(eq(assetTypes.orgId, orgId)).limit(1);
  let typeId: string;
  if (!typeRow) {
    const [t] = await db
      .insert(assetTypes)
      .values({ orgId, name: "Chaos Device", icon: "laptop", fieldsSchema: [] })
      .returning();
    typeId = t!.id;
  } else {
    typeId = typeRow.id;
  }

  const assetRows = Array.from({ length: 50 }, (_, i) => ({
    orgId,
    assetTag: `CHAOS-AST-${String(i + 1).padStart(4, "0")}`,
    name: `Chaos Asset ${i + 1}`,
    typeId,
    status: "in_stock" as const,
  }));
  await db.insert(assets).values(assetRows);

  await closeDb();
}

async function assertDbCounts(orgSlug: string, expectSeedTickets: number, runPrefix: string): Promise<void> {
  const dbUrl = resolveChaosDatabaseUrl();
  if (!dbUrl) throw new Error("CHAOS_DATABASE_URL or DATABASE_URL missing for assertDbCounts");
  process.env["DATABASE_URL"] = dbUrl;

  const { getDb, closeDb, organizations, tickets, assets, eq, and, like, count } = await import("@nexusops/db");
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);
  if (!org) throw new Error(`assertDbCounts: org slug not found: ${orgSlug}`);

  const [{ c: seedCount }] = await db
    .select({ c: count() })
    .from(tickets)
    .where(and(eq(tickets.orgId, org.id), like(tickets.title, "CHAOS-SEED-%")));

  const [{ c: runCount }] = await db
    .select({ c: count() })
    .from(tickets)
    .where(and(eq(tickets.orgId, org.id), like(tickets.title, `${runPrefix}%`)));

  const [{ c: assetCount }] = await db
    .select({ c: count() })
    .from(assets)
    .where(and(eq(assets.orgId, org.id), like(assets.assetTag, "CHAOS-AST-%")));

  await closeDb();

  expect(seedCount, "seeded CHAOS-SEED tickets in DB").toBe(expectSeedTickets);
  expect(runCount, "UI-created CHAOS-RUN tickets in DB").toBe(10);
  expect(assetCount, "seeded CHAOS-AST assets in DB").toBe(50);
}

/** When seed was skipped: only assert this run's tickets exist in DB (needs deployment DATABASE_URL). */
async function assertDbRunTicketsOnly(orgSlug: string, runPrefix: string, expectedRun: number): Promise<void> {
  const dbUrl = resolveChaosDatabaseUrl();
  if (!dbUrl) throw new Error("CHAOS_DATABASE_URL or DATABASE_URL required for DB assertions");
  process.env["DATABASE_URL"] = dbUrl;

  const { getDb, closeDb, organizations, tickets, eq, and, like, count } = await import("@nexusops/db");
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);
  if (!org) {
    await closeDb();
    throw new Error(
      `assertDbRunTicketsOnly: org slug "${orgSlug}" not in DB — use CHAOS_SKIP_DB_ASSERT=1 for UI-only runs, or seed once with matching project name.`,
    );
  }

  const [{ c: runCount }] = await db
    .select({ c: count() })
    .from(tickets)
    .where(and(eq(tickets.orgId, org.id), like(tickets.title, `${runPrefix}%`)));

  await closeDb();
  expect(runCount, "UI-created CHAOS-RUN tickets in DB").toBe(expectedRun);
}

test.describe("NexusOps chaos — vertical day-in-the-life", () => {
  test.describe.configure({ mode: "serial" });

  test("stress auth, tickets, HAM, routes, concurrency, screenshots, DB integrity", async ({ page }, testInfo) => {
    const skipSeed =
      process.env["CHAOS_SKIP_SEED"] === "1" || process.env["CHAOS_SKIP_SEED"]?.toLowerCase() === "true";
    const skipDbAssert =
      skipSeed ||
      process.env["CHAOS_SKIP_DB_ASSERT"] === "1" ||
      process.env["CHAOS_SKIP_DB_ASSERT"]?.toLowerCase() === "true";

    const projectKey = testInfo.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 48);
    const chaosTenantSlug = `chaos-v-${projectKey}`;
    const orgSlugForDbAssert = skipSeed
      ? (process.env["CHAOS_ORG_SLUG"]?.trim() || "coheron-demo")
      : chaosTenantSlug;
    const adminEmail = `chaos.admin+${projectKey}@nexusops.test`;
    const password = process.env["CHAOS_ADMIN_PASSWORD"] ?? DEFAULT_ADMIN_PASSWORD;
    const runId = `${Date.now()}-${testInfo.workerIndex}`;
    const runTitlePrefix = `CHAOS-RUN-${runId}`;

    const loginEmail =
      skipSeed
        ? (process.env["CHAOS_LOGIN_EMAIL"] ?? process.env["CHAOS_ADMIN_EMAIL"] ?? "").trim()
        : adminEmail;
    const loginPassword =
      skipSeed
        ? (process.env["CHAOS_LOGIN_PASSWORD"] ?? process.env["CHAOS_ADMIN_PASSWORD"] ?? DEFAULT_ADMIN_PASSWORD).trim()
        : password;

    if (skipSeed) {
      test.skip(!loginEmail || !loginPassword, "CHAOS_SKIP_SEED requires CHAOS_LOGIN_EMAIL + CHAOS_LOGIN_PASSWORD (or CHAOS_ADMIN_*)");
    } else {
      const dbUrl = resolveChaosDatabaseUrl();
      test.skip(!dbUrl, "CHAOS_DATABASE_URL or DATABASE_URL required when seed is enabled");
      process.env["DATABASE_URL"] = dbUrl!;
      assertDatabaseMatchesRemoteBase(dbUrl!);
      await seedChaosTenant(chaosTenantSlug, adminEmail, password);
    }

    await trpcLogin(page, loginEmail, loginPassword);
    await page.goto(`${BASE}/app/dashboard`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() =>
      page.goto(`${BASE}/app/dashboard`, { waitUntil: "domcontentloaded", timeout: 60_000 }),
    );

    // ── API chaos: slow / failing create → Sonner should surface an error toast ──
    let failCreateRemaining = 1;
    await page.route("**/api/trpc/tickets.create**", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      if (failCreateRemaining-- > 0) {
        await new Promise((r) => setTimeout(r, 2200));
        return route.fulfill({
          status: 500,
          headers: { "content-type": "application/json" },
          body: JSON.stringify([{ error: { json: { message: "CHAOS: injected 500", code: -32603 } } }]),
        });
      }
      return route.continue();
    });

    await page.goto(`${BASE}/app/tickets/new`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("ticket-title").fill(`${runTitlePrefix}-000 chaos probe`);
    await page.getByTestId("ticket-description").fill("Chaos probe — first submit should hit injected failure.");
    await page.locator('select').filter({ has: page.locator('option:text("Network")') }).selectOption("Network");
    await page.getByTestId("ticket-submit").click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: /fail|error|500|CHAOS/i })).toBeVisible({
      timeout: 35_000,
    });

    await page.unroute("**/api/trpc/tickets.create**");

    const createdIds: string[] = [];

    for (let i = 0; i < 10; i++) {
      await page.goto(`${BASE}/app/tickets/new`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("ticket-title").fill(`${runTitlePrefix}-${String(i).padStart(2, "0")} stress ticket`);
      await page.getByTestId("ticket-description").fill(`High-velocity create #${i} — Temporal SLA scheduling may run on API.`);
      await page.locator('select').filter({ has: page.locator('option:text("Network")') }).selectOption("Network");
      // Higher impact → SLA / workflow path on API (scheduleSlaBreach when Temporal is wired).
      await page.locator('select').filter({ has: page.locator('option:text("1 – Enterprise-wide impact")') }).selectOption("1_enterprise");
      await page.locator('select').filter({ has: page.locator('option:text("1 – Critical (cannot work)")') }).selectOption("1_critical");
      await page.getByTestId("ticket-submit").click();
      await page.waitForURL(/\/app\/tickets\/[0-9a-f-]{36}/i, { timeout: 45_000 });
      const url = page.url();
      const id = url.split("/").pop() ?? "";
      if (id) createdIds.push(id);

      if (i % 2 === 0) {
        await page.getByRole("button", { name: /Resolve/i }).click();
        await page.getByRole("button", { name: /Mark Resolved/i }).click();
        await expect(page.locator("[data-sonner-toast]").filter({ hasText: /updated|resolved/i })).toBeVisible({
          timeout: 20_000,
        });
      }
    }

    expect(createdIds.length, "expected 10 ticket creates").toBe(10);

    // Orchestration-adjacent: "Create Change" from ticket overflow menu (drives change + workflow wiring on API)
    await page.goto(`${BASE}/app/tickets/${createdIds[1] ?? createdIds[0]}`, { waitUntil: "domcontentloaded" });
    await page.locator('div[class*="flex-shrink-0"] div.relative > button').first().click();
    await page.getByRole("button", { name: /Create Change/i }).click({ timeout: 12_000 }).catch(() => {});

    // ── Ticket queue: concurrent UI mutations ──
    await page.goto(`${BASE}/app/tickets`, { waitUntil: "networkidle" }).catch(() =>
      page.goto(`${BASE}/app/tickets`, { waitUntil: "domcontentloaded" }),
    );
    const refreshBtn = page.locator('button').filter({ has: page.locator("svg.lucide-refresh-cw") }).first();
    const exportBtn = page.getByRole("button", { name: /Export/i }).first();
    const filterBtn = page.getByRole("button", { name: /^Filters$/ }).first();
    await Promise.all([
      refreshBtn.click().catch(() => {}),
      exportBtn.click().catch(() => {}),
      filterBtn.click().catch(() => {}),
      page.getByPlaceholder(/search/i).first().fill("CHAOS").catch(() => {}),
      page.getByRole("link", { name: /New Ticket/i }).click({ trial: true }).catch(() => {}),
    ]);

    // ── HAM: action surface (Assign per in_stock row + header actions).
    //   Full "Edit / Archive / Delete" are not exposed on the HAM table in this codebase;
    //   we stress every actionable control present (Assign, Run Discovery, Export, Add/Cancel).
    await page.goto(`${BASE}/app/ham`, { waitUntil: "domcontentloaded" });
    for (let k = 0; k < 20; k++) {
      const assign = page.getByRole("button", { name: /^Assign$/ }).first();
      if (!(await assign.isVisible().catch(() => false))) break;
      await assign.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(120);
    }
    for (let round = 0; round < 3; round++) {
      await page.getByRole("button", { name: /Run Discovery/i }).click();
      await page.getByRole("button", { name: /^Export$/ }).click();
      const addOrCancel = page.getByRole("button", { name: /Add Asset|Cancel/ });
      await addOrCancel.click();
      await page.waitForTimeout(200);
    }

    await Promise.all([
      page.getByRole("button", { name: /Run Discovery/i }).click().catch(() => {}),
      page.getByRole("button", { name: /^Export$/ }).click().catch(() => {}),
      page.getByPlaceholder("Search assets...").fill(`chaos-${runId}`).catch(() => {}),
    ]);

    // ── Visual regression (under load; allow modest pixel drift) ──
    await page.goto(`${BASE}/app/dashboard`, { waitUntil: "networkidle" }).catch(() => {});
    await expect(page).toHaveScreenshot("chaos-dashboard.png", {
      fullPage: true,
      maxDiffPixels: 800,
      animations: "disabled",
    });

    await page.goto(`${BASE}/app/employee-portal`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveScreenshot("chaos-service-portal.png", {
      fullPage: true,
      maxDiffPixels: 1200,
      animations: "disabled",
    });

    if (!skipDbAssert) {
      const dbUrl = resolveChaosDatabaseUrl();
      if (!dbUrl) throw new Error("CHAOS_SKIP_DB_ASSERT=0 requires CHAOS_DATABASE_URL or DATABASE_URL");
      process.env["DATABASE_URL"] = dbUrl;
      if (skipSeed) await assertDbRunTicketsOnly(orgSlugForDbAssert, runTitlePrefix, 10);
      else await assertDbCounts(chaosTenantSlug, 50, runTitlePrefix);
    }
  });
});
