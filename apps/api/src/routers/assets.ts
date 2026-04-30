import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  assets,
  assetTypes,
  assetHistory,
  ciItems,
  ciRelationships,
  softwareLicenses,
  licenseAssignments,
  eq,
  and,
  count,
  desc,
  asc,
  sql,
} from "@coheronconnect/db";

type CIItem = typeof ciItems.$inferSelect;
type CIRelationship = typeof ciRelationships.$inferSelect;
type SoftwareLicense = typeof softwareLicenses.$inferSelect;
import { CreateAssetSchema } from "@coheronconnect/types";

export const assetsRouter = router({
  list: permissionProcedure("cmdb", "read")
    .input(
      z.object({
        typeId: z.string().uuid().optional(),
        status: z.string().optional(),
        ownerId: z.string().uuid().optional(),
        search: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(25),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(assets.orgId, org!.id)];

      if (input.status)
        conditions.push(eq(assets.status, input.status as "in_stock" | "deployed" | "maintenance" | "retired" | "disposed"));
      if (input.typeId) conditions.push(eq(assets.typeId, input.typeId));
      if (input.ownerId) conditions.push(eq(assets.ownerId, input.ownerId));

      const rows = await db
        .select()
        .from(assets)
        .where(and(...conditions))
        .orderBy(desc(assets.createdAt))
        .limit(input.limit + 1)
        .offset(input.cursor ? parseInt(input.cursor) : 0);

      const hasMore = rows.length > input.limit;
      return {
        items: hasMore ? rows.slice(0, -1) : rows,
        nextCursor: hasMore ? String((input.cursor ? parseInt(input.cursor) : 0) + input.limit) : null,
      };
    }),

  get: permissionProcedure("cmdb", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
    const { db, org } = ctx;

    const [asset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, input.id), eq(assets.orgId, org!.id)));

    if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });

    const history = await db
      .select()
      .from(assetHistory)
      .where(eq(assetHistory.assetId, asset.id))
      .orderBy(desc(assetHistory.createdAt))
      .limit(50);

    return { asset, history };
  }),

  create: permissionProcedure("cmdb", "write")
    .input(CreateAssetSchema)
    .mutation(async ({ ctx, input }) => {
    const { db, org, user } = ctx;

    const [countResult] = await db
      .select({ count: count() })
      .from(assets)
      .where(eq(assets.orgId, org!.id));

    const seq = (countResult?.count ?? 0) + 1;
    const assetTag = `AST-${String(seq).padStart(4, "0")}`;

    const [asset] = await db
      .insert(assets)
      .values({
        orgId: org!.id,
        assetTag,
        name: input.name,
        typeId: input.typeId,
        status: input.status ?? "in_stock",
        ownerId: input.ownerId,
        location: input.location,
        purchaseDate: input.purchaseDate,
        purchaseCost: input.purchaseCost?.toString(),
        warrantyExpiry: input.warrantyExpiry,
        vendor: input.vendor,
        customFields: input.customFields,
        parentAssetId: input.parentAssetId,
      })
      .returning();

    await db.insert(assetHistory).values({
      assetId: asset!.id,
      actorId: user!.id,
      action: "created",
      details: { assetTag },
    });

    return asset;
  }),

  assign: permissionProcedure("cmdb", "write")
    .input(z.object({ id: z.string().uuid(), ownerId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;

      const [existing] = await db
        .select()
        .from(assets)
        .where(and(eq(assets.id, input.id), eq(assets.orgId, org!.id)));

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      if (existing.status === "retired" || existing.status === "disposed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot assign a retired or disposed asset",
        });
      }

      const [updated] = await db
        .update(assets)
        .set({
          ownerId: input.ownerId,
          status: input.ownerId ? "deployed" : "in_stock",
          updatedAt: new Date(),
        })
        .where(and(eq(assets.id, input.id), eq(assets.orgId, org!.id)))
        .returning();

      await db.insert(assetHistory).values({
        assetId: input.id,
        actorId: user!.id,
        action: input.ownerId ? "assigned" : "unassigned",
        details: { ownerId: input.ownerId },
      });

      return updated;
    }),

  retire: permissionProcedure("cmdb", "write")
    .input(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;

      const [updated] = await db
        .update(assets)
        .set({ status: "retired", ownerId: null, updatedAt: new Date() })
        .where(and(eq(assets.id, input.id), eq(assets.orgId, org!.id)))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });

      await db.insert(assetHistory).values({
        assetId: input.id,
        actorId: user!.id,
        action: "retired",
        details: { reason: input.reason },
      });

      return updated;
    }),

  listTypes: permissionProcedure("cmdb", "read").query(async ({ ctx }) => {
    return ctx.db.select().from(assetTypes).where(eq(assetTypes.orgId, ctx.org!.id));
  }),

  // ── CMDB ─────────────────────────────────────────────────────────────────
  cmdb: router({
    list: permissionProcedure("cmdb", "read").query(async ({ ctx }) => {
      return ctx.db.select().from(ciItems).where(eq(ciItems.orgId, ctx.org!.id));
    }),

    getTopology: permissionProcedure("cmdb", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;

      const cis = await db.select().from(ciItems).where(eq(ciItems.orgId, org!.id));
      if (cis.length === 0) {
        return {
          nodes: [] as { id: string; name: string; type: string; status: string }[],
          edges: [] as { id: string; source: string; target: string; type: string }[],
        };
      }
      const rels = await db
        .select()
        .from(ciRelationships)
        .where(
          sql`${ciRelationships.sourceId} IN (SELECT id FROM ci_items WHERE org_id = ${org!.id}) AND ${ciRelationships.targetId} IN (SELECT id FROM ci_items WHERE org_id = ${org!.id})`,
        );

      return {
        nodes: cis.map((ci: CIItem) => ({ id: ci.id, name: ci.name, type: ci.ciType, status: ci.status })),
        edges: rels.map((r: CIRelationship) => ({
          id: r.id,
          source: r.sourceId,
          target: r.targetId,
          type: r.relationType,
        })),
      };
    }),

    /**
     * US-ITSM-006: hop-limited dependency subgraph from a root CI (service / impact neighborhood).
     * `maxDepth` = max graph distance from root (0 → root only).
     */
    getServiceMap: permissionProcedure("cmdb", "read")
      .input(
        z.object({
          rootCiId: z.string().uuid(),
          maxDepth: z.coerce.number().int().min(0).max(6).default(3),
          maxNodes: z.coerce.number().int().min(1).max(200).default(100),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;

        const cis = (await db.select().from(ciItems).where(eq(ciItems.orgId, org!.id))) as CIItem[];
        const byId = new Map(cis.map((c: CIItem) => [c.id, c]));
        if (!byId.has(input.rootCiId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "CI not found" });
        }

        const rels: CIRelationship[] =
          cis.length === 0
            ? []
            : ((await db
                .select()
                .from(ciRelationships)
                .where(
                  sql`${ciRelationships.sourceId} IN (SELECT id FROM ci_items WHERE org_id = ${org!.id}) AND ${ciRelationships.targetId} IN (SELECT id FROM ci_items WHERE org_id = ${org!.id})`,
                )) as CIRelationship[]);

        const adj = new Map<string, Set<string>>();
        for (const r of rels) {
          if (!adj.has(r.sourceId)) adj.set(r.sourceId, new Set());
          if (!adj.has(r.targetId)) adj.set(r.targetId, new Set());
          adj.get(r.sourceId)!.add(r.targetId);
          adj.get(r.targetId)!.add(r.sourceId);
        }

        const visited = new Set<string>();
        const queue: { id: string; d: number }[] = [{ id: input.rootCiId, d: 0 }];
        visited.add(input.rootCiId);

        while (queue.length > 0 && visited.size < input.maxNodes) {
          const cur = queue.shift()!;
          if (cur.d >= input.maxDepth) continue;
          const nbr = adj.get(cur.id);
          if (!nbr) continue;
          for (const v of nbr) {
            if (visited.size >= input.maxNodes) break;
            if (!visited.has(v)) {
              visited.add(v);
              queue.push({ id: v, d: cur.d + 1 });
            }
          }
        }

        const nodeSet = visited;
        const edgeRows = rels.filter((r: CIRelationship) => nodeSet.has(r.sourceId) && nodeSet.has(r.targetId));

        return {
          rootCiId: input.rootCiId,
          maxDepth: input.maxDepth,
          nodes: [...nodeSet].map((id) => {
            const ci = byId.get(id)!;
            return { id: ci.id, name: ci.name, type: ci.ciType, status: ci.status };
          }),
          edges: edgeRows.map((r: CIRelationship) => ({
            id: r.id,
            source: r.sourceId,
            target: r.targetId,
            type: r.relationType,
          })),
        };
      }),

    impactAnalysis: permissionProcedure("cmdb", "read")
      .input(z.object({ ciId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;

        // Find all downstream CIs (things that depend on this CI)
        const upstream: string[] = [];
        const downstream: string[] = [];
        const visited = new Set<string>();

        async function traverse(id: string, direction: "up" | "down") {
          if (visited.has(id)) return;
          visited.add(id);

          if (direction === "down") {
            const deps = await db
              .select()
              .from(ciRelationships)
              .where(eq(ciRelationships.targetId, id));

            for (const dep of deps) {
              downstream.push(dep.sourceId);
              await traverse(dep.sourceId, "down");
            }
          } else {
            const deps = await db
              .select()
              .from(ciRelationships)
              .where(eq(ciRelationships.sourceId, id));

            for (const dep of deps) {
              upstream.push(dep.targetId);
              await traverse(dep.targetId, "up");
            }
          }
        }

        await traverse(input.ciId, "down");
        await traverse(input.ciId, "up");

        return { upstream, downstream };
      }),

    createCi: permissionProcedure("cmdb", "write")
      .input(
        z.object({
          name: z.string().min(1),
          ciType: z.enum(["server", "application", "database", "network", "service", "cloud"]),
          status: z.enum(["operational", "degraded", "down", "planned"]).optional(),
          environment: z.string().optional(),
          attributes: z.record(z.unknown()).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db
          .insert(ciItems)
          .values({
            orgId: org!.id,
            name: input.name,
            ciType: input.ciType,
            status: input.status ?? "operational",
            environment: input.environment,
            attributes: input.attributes,
          })
          .returning();
        return row;
      }),

    updateCi: permissionProcedure("cmdb", "write")
      .input(
        z.object({
          id: z.string().uuid(),
          name: z.string().optional(),
          status: z.enum(["operational", "degraded", "down", "planned"]).optional(),
          environment: z.string().nullable().optional(),
          attributes: z.record(z.unknown()).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, name, status, environment, attributes } = input;
        const data: Record<string, unknown> = { updatedAt: new Date() };
        if (name !== undefined) data.name = name;
        if (status !== undefined) data.status = status;
        if (environment !== undefined) data.environment = environment;
        if (attributes !== undefined) data.attributes = attributes;
        const [row] = await db
          .update(ciItems)
          .set(data as typeof ciItems.$inferInsert)
          .where(and(eq(ciItems.id, id), eq(ciItems.orgId, org!.id)))
          .returning();
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "CI not found" });
        return row;
      }),

    linkCi: permissionProcedure("cmdb", "write")
      .input(
        z.object({
          sourceId: z.string().uuid(),
          targetId: z.string().uuid(),
          relationType: z.enum(["depends_on", "runs_on", "connected_to", "member_of", "hosts"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        if (input.sourceId === input.targetId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Source and target must differ" });
        }
        const [a] = await db
          .select({ id: ciItems.id })
          .from(ciItems)
          .where(and(eq(ciItems.id, input.sourceId), eq(ciItems.orgId, org!.id)));
        const [b] = await db
          .select({ id: ciItems.id })
          .from(ciItems)
          .where(and(eq(ciItems.id, input.targetId), eq(ciItems.orgId, org!.id)));
        if (!a || !b) throw new TRPCError({ code: "NOT_FOUND", message: "CI not found" });
        const [rel] = await db
          .insert(ciRelationships)
          .values({
            sourceId: input.sourceId,
            targetId: input.targetId,
            relationType: input.relationType,
          })
          .returning();
        return rel;
      }),

    /** US-ITSM-006: idempotent upsert by `external_key` per org (bulk CMDB ingest). */
    bulkImportCis: permissionProcedure("cmdb", "write")
      .input(
        z.object({
          items: z
            .array(
              z.object({
                externalKey: z.string().min(1).max(256),
                name: z.string().min(1),
                ciType: z.enum(["server", "application", "database", "network", "service", "cloud"]),
                status: z.enum(["operational", "degraded", "down", "planned"]).optional(),
                environment: z.string().max(200).optional(),
                attributes: z.record(z.unknown()).optional(),
              }),
            )
            .min(1)
            .max(500),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const now = new Date();
        const items: CIItem[] = [];
        for (const item of input.items) {
          const [row] = await db
            .insert(ciItems)
            .values({
              orgId: org!.id,
              externalKey: item.externalKey,
              name: item.name,
              ciType: item.ciType,
              status: item.status ?? "operational",
              environment: item.environment,
              attributes: item.attributes,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [ciItems.orgId, ciItems.externalKey],
              set: {
                name: item.name,
                ciType: item.ciType,
                status: item.status ?? "operational",
                environment: item.environment,
                attributes: item.attributes,
                updatedAt: now,
              },
            })
            .returning();
          if (row) items.push(row);
        }
        return { count: items.length, items };
      }),
  }),

  // ── Licenses ──────────────────────────────────────────────────────────────
  licenses: router({
    list: permissionProcedure("sam", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;

      const licenseList = await db
        .select()
        .from(softwareLicenses)
        .where(eq(softwareLicenses.orgId, org!.id));

      const withUsage = await Promise.all(
        licenseList.map(async (lic: SoftwareLicense) => {
          const [result] = await db
            .select({ used: count() })
            .from(licenseAssignments)
            .where(
              and(
                eq(licenseAssignments.licenseId, lic.id),
                sql`${licenseAssignments.revokedAt} IS NULL`,
              ),
            );

          const used = result?.used ?? 0;
          const total = lic.totalSeats ? parseInt(lic.totalSeats) : null;
          return {
            ...lic,
            usedSeats: used,
            utilizationPct: total ? Math.round((used / total) * 100) : null,
          };
        }),
      );

      return withUsage;
    }),

    create: permissionProcedure("sam", "write")
      .input(z.object({
        productName: z.string().min(1),
        vendor: z.string().optional(),
        licenseType: z.enum(["perpetual", "subscription", "trial", "open_source", "freeware"]).default("subscription"),
        totalSeats: z.coerce.number().int().positive().optional(),
        costPerSeat: z.string().optional(),
        expiresAt: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [license] = await db.insert(softwareLicenses).values({
          orgId: org!.id,
          productName: input.productName,
          vendor: input.vendor,
          licenseType: input.licenseType,
          totalSeats: input.totalSeats ? String(input.totalSeats) : undefined,
          costPerSeat: input.costPerSeat,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
          notes: input.notes,
        } as any).returning();
        return license;
      }),

    assign: permissionProcedure("sam", "write")
      .input(z.object({
        licenseId: z.string().uuid(),
        assetId: z.string().uuid().optional(),
        userId: z.string().uuid().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        const [license] = await db
          .select()
          .from(softwareLicenses)
          .where(and(eq(softwareLicenses.id, input.licenseId), eq(softwareLicenses.orgId, org!.id)));

        if (!license) throw new TRPCError({ code: "NOT_FOUND" });

        if (license.totalSeats) {
          const [result] = await db
            .select({ used: count() })
            .from(licenseAssignments)
            .where(
              and(
                eq(licenseAssignments.licenseId, input.licenseId),
                sql`${licenseAssignments.revokedAt} IS NULL`,
              ),
            );

          if ((result?.used ?? 0) >= parseInt(license.totalSeats)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "All license seats are in use",
            });
          }
        }

        const [assignment] = await db
          .insert(licenseAssignments)
          .values({
            licenseId: input.licenseId,
            assetId: input.assetId,
            userId: input.userId,
          })
          .returning();

        return assignment;
      }),

    revoke: permissionProcedure("sam", "write")
      .input(z.object({ assignmentId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db } = ctx;

        const [updated] = await db
          .update(licenseAssignments)
          .set({ revokedAt: new Date() })
          .where(eq(licenseAssignments.id, input.assignmentId))
          .returning();

        return updated;
      }),
  }),

  // ── HAM - Hardware Asset Management ───────────────────────────────────────
  ham: router({
    list: permissionProcedure("ham", "read")
      .input(z.object({
        status: z.string().optional(),
        search: z.string().optional(),
        limit: z.coerce.number().default(50),
        cursor: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(assets.orgId, org!.id)];
        if (input.status) conditions.push(eq(assets.status, input.status as any));
        const rows = await db.select().from(assets)
          .where(and(...conditions))
          .orderBy(desc(assets.createdAt))
          .limit(input.limit + 1)
          .offset(input.cursor ? parseInt(input.cursor) : 0);
        const hasMore = rows.length > input.limit;
        return {
          items: hasMore ? rows.slice(0, -1) : rows,
          nextCursor: hasMore ? String((input.cursor ? parseInt(input.cursor) : 0) + input.limit) : null,
        };
      }),

    assign: permissionProcedure("ham", "write")
      .input(z.object({
        assetId: z.string().uuid(),
        userId: z.string().uuid().optional(),
        location: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [asset] = await db.update(assets)
          .set({ ownerId: input.userId, location: input.location, updatedAt: new Date() } as any)
          .where(and(eq(assets.id, input.assetId), eq(assets.orgId, org!.id)))
          .returning();
        if (input.userId) {
          await db.insert(assetHistory).values({
            assetId: input.assetId,
            actorId: ctx.user!.id,
            action: "assigned",
            details: { userId: input.userId },
          } as any);
        }
        return asset;
      }),

    retire: permissionProcedure("ham", "write")
      .input(z.object({ assetId: z.string().uuid(), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [asset] = await db.update(assets)
          .set({ status: "retired" as any, updatedAt: new Date() })
          .where(and(eq(assets.id, input.assetId), eq(assets.orgId, org!.id)))
          .returning();
        await db.insert(assetHistory).values({
          assetId: input.assetId,
          actorId: ctx.user!.id,
          action: "retired",
          details: { reason: input.reason },
        } as any);
        return asset;
      }),
  }),

  // ── SAM - Software Asset Management ───────────────────────────────────────
  sam: router({
    licenses: router({
      list: permissionProcedure("sam", "read")
        .input(z.object({ search: z.string().optional(), limit: z.coerce.number().default(50) }))
        .query(async ({ ctx, input }) => {
          const { db, org } = ctx;
          const conditions = [eq(softwareLicenses.orgId, org!.id)];
          const rows = await db.select().from(softwareLicenses)
            .where(and(...conditions))
            .orderBy(desc(softwareLicenses.createdAt))
            .limit(input.limit);
          return Promise.all(rows.map(async (lic: SoftwareLicense) => {
            const [{ cnt }] = await db.select({ cnt: count() }).from(licenseAssignments)
              .where(and(
                eq(licenseAssignments.licenseId, lic.id),
                sql`${licenseAssignments.revokedAt} IS NULL`,
              ));
            const total = lic.totalSeats ? parseInt(lic.totalSeats) : 0;
            return {
              ...lic,
              assigned: Number(cnt),
              utilization: total > 0 ? Math.round((Number(cnt) / total) * 100) : 0,
            };
          }));
        }),

      assign: permissionProcedure("sam", "write")
        .input(z.object({
          licenseId: z.string().uuid(),
          userId: z.string().uuid(),
        }))
        .mutation(async ({ ctx, input }) => {
          const { db, org } = ctx;
          const [lic] = await db.select().from(softwareLicenses)
            .where(and(eq(softwareLicenses.id, input.licenseId), eq(softwareLicenses.orgId, org!.id)));
          if (!lic) throw new TRPCError({ code: "NOT_FOUND" });
          const [{ cnt }] = await db.select({ cnt: count() }).from(licenseAssignments)
            .where(and(
              eq(licenseAssignments.licenseId, input.licenseId),
              sql`${licenseAssignments.revokedAt} IS NULL`,
            ));
          if (lic.totalSeats && Number(cnt) >= parseInt(lic.totalSeats)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "No available seats" });
          }
          const [assignment] = await db.insert(licenseAssignments).values({
            licenseId: input.licenseId,
            userId: input.userId,
          } as any).returning();
          return assignment;
        }),
    }),
  }),
});
