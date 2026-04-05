import bcrypt from "bcryptjs";
import type { ChaosConfig } from "./chaos-config";
import { applyDatabaseUrlForDrizzle } from "./chaos-config";

/** Idempotent seed: org `CHAOS_ORG_SLUG`, owner admin, ticket + asset metadata for UI tests. */
export async function seedChaosOrganization(config: ChaosConfig): Promise<void> {
  const url = config.databaseUrl;
  if (!url) throw new Error("databaseUrl required to seed");
  applyDatabaseUrlForDrizzle(url);

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
  } = await import("@nexusops/db");

  const db = getDb();
  const passwordHash = await bcrypt.hash(config.seededAdminPassword, 12);
  const slug = config.orgSlug;

  const [existingOrg] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  let orgId: string;
  if (!existingOrg) {
    const [o] = await db
      .insert(organizations)
      .values({
        name: `Chaos Validation ${slug}`,
        slug,
        plan: "professional",
        primaryColor: "#6366f1",
      })
      .returning();
    orgId = o!.id;
  } else {
    orgId = existingOrg.id;
  }

  await db.delete(tickets).where(and(eq(tickets.orgId, orgId), like(tickets.title, "CHAOS-RUN-%")));
  await db.delete(tickets).where(and(eq(tickets.orgId, orgId), like(tickets.title, "CHAOS-SEED-%")));
  await db.delete(assets).where(and(eq(assets.orgId, orgId), like(assets.assetTag, "CHAOS-AST-%")));

  const [u0] = await db
    .select()
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.email, config.seededAdminEmail)))
    .limit(1);
  if (!u0) {
    await db.insert(users).values({
      orgId,
      email: config.seededAdminEmail,
      name: "Chaos Validation Admin",
      passwordHash,
      role: "owner",
      status: "active",
    });
  } else {
    await db
      .update(users)
      .set({ passwordHash, status: "active", role: "owner" })
      .where(eq(users.id, u0.id));
  }

  const [admin] = await db
    .select()
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.email, config.seededAdminEmail)))
    .limit(1);
  if (!admin) throw new Error("seed: admin user missing after upsert");
  const adminId = admin.id;

  let [st0] = await db.select().from(ticketStatuses).where(eq(ticketStatuses.orgId, orgId)).limit(1);
  let openStatusId: string;
  let inProgressStatusId: string;
  let defaultPriorityId: string;
  let defaultCategoryId: string;

  if (!st0) {
    const cats = await db
      .insert(ticketCategories)
      .values([{ orgId, name: "Chaos IT", color: "#6366f1", icon: "monitor", sortOrder: 0 }])
      .returning();
    defaultCategoryId = cats[0]!.id;
    const prios = await db
      .insert(ticketPriorities)
      .values([
        {
          orgId,
          name: "Medium",
          color: "#f59e0b",
          slaResponseMinutes: 240,
          slaResolveMinutes: 1440,
          sortOrder: 2,
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
    if (!open || !ip) throw new Error(`Org ${slug}: need open + in_progress ticket statuses`);
    openStatusId = open.id;
    inProgressStatusId = ip.id;
    const [p0] = await db.select().from(ticketPriorities).where(eq(ticketPriorities.orgId, orgId)).limit(1);
    if (!p0) throw new Error(`Org ${slug}: need ticket_priorities`);
    defaultPriorityId = p0.id;
    const [c0] = await db.select().from(ticketCategories).where(eq(ticketCategories.orgId, orgId)).limit(1);
    if (!c0) throw new Error(`Org ${slug}: need ticket_categories`);
    defaultCategoryId = c0.id;
  }

  const prefix = slug.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4) || "CHAO";
  await db.insert(tickets).values(
    Array.from({ length: 3 }, (_, i) => ({
      orgId,
      number: `${prefix}-S${String(i + 1).padStart(3, "0")}`,
      title: `CHAOS-SEED-${String(i + 1).padStart(2, "0")} baseline`,
      description: "system-validation seed",
      categoryId: defaultCategoryId,
      priorityId: defaultPriorityId,
      statusId: i === 0 ? inProgressStatusId : openStatusId,
      type: "request" as const,
      impact: "medium" as const,
      urgency: "medium" as const,
      requesterId: adminId,
      slaBreached: false,
    })),
  );

  const [typeRow] = await db.select().from(assetTypes).where(eq(assetTypes.orgId, orgId)).limit(1);
  let typeId: string;
  if (!typeRow) {
    const [t] = await db
      .insert(assetTypes)
      .values({ orgId, name: "Chaos HW", icon: "laptop", fieldsSchema: [] })
      .returning();
    typeId = t!.id;
  } else {
    typeId = typeRow.id;
  }

  await db.insert(assets).values(
    Array.from({ length: 5 }, (_, i) => ({
      orgId,
      assetTag: `CHAOS-AST-${String(i + 1).padStart(4, "0")}`,
      name: `Chaos HW ${i + 1}`,
      typeId,
      status: "in_stock" as const,
    })),
  );

  await closeDb();
}

export async function assertChaosRunTicketCount(config: ChaosConfig, titlePrefix: string, expected: number): Promise<void> {
  const url = config.databaseUrl;
  if (!url) throw new Error("databaseUrl required for DB assert");
  applyDatabaseUrlForDrizzle(url);

  const { getDb, closeDb, organizations, tickets, eq, and, like, count } = await import("@nexusops/db");
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, config.orgSlug)).limit(1);
  if (!org) {
    await closeDb();
    throw new Error(`DB assert: organization slug not found: ${config.orgSlug}`);
  }
  const [{ c }] = await db
    .select({ c: count() })
    .from(tickets)
    .where(and(eq(tickets.orgId, org.id), like(tickets.title, `${titlePrefix}%`)));
  await closeDb();
  if (c !== expected) {
    throw new Error(`CHAOS-RUN ticket count mismatch: expected ${expected}, got ${c} (prefix ${titlePrefix})`);
  }
}

/** Spec name: assert DB ticket rows for this chaos run match `expected`. */
export const verifyTicketCount = assertChaosRunTicketCount;
