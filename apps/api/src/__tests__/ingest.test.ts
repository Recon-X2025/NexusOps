import { describe, it, expect, beforeEach } from "vitest";
import { ingestRouter } from "../routers/ingest";
import { createMockContext } from "./helpers";
import { legalMatters, contracts, eq, and } from "@nexusops/db";

describe("ingestRouter", () => {
    let ctx: any;
    let caller: any;

    beforeEach(async () => {
        const { orgId } = await import("./helpers").then(h => h.seedTestOrg());
        const { userId } = await import("./helpers").then(h => h.seedUser(orgId));
        ctx = await createMockContext(userId, orgId);
        caller = ingestRouter.createCaller(ctx);
    });

    it("should bulk import legal matters and sync counters", async () => {
        const input = [
            { title: "Legacy Case 1", type: "litigation" as const, status: "active" as const },
            { title: "Legacy Case 2", type: "commercial" as const, status: "intake" as const },
        ];

        const result = await caller.importMatters(input);
        expect(result.imported).toBe(2);
        expect(result.ids).toHaveLength(2);

        const rows = await ctx.db.select().from(legalMatters).where(eq(legalMatters.orgId, ctx.org.id));
        expect(rows.some((r: any) => r.title === "Legacy Case 1")).toBe(true);
        expect(rows.some((r: any) => r.title === "Legacy Case 2")).toBe(true);
    });

    it("should bulk import contracts and sync counters", async () => {
        const input = [
            { title: "Legacy Contract 1", counterparty: "Vendor A" },
            { title: "Legacy Contract 2", counterparty: "Vendor B" },
        ];

        const result = await caller.importContracts(input);
        expect(result.imported).toBe(2);
        expect(result.ids).toHaveLength(2);

        const rows = await ctx.db.select().from(contracts).where(eq(contracts.orgId, ctx.org.id));
        expect(rows.some((r: any) => r.title === "Legacy Contract 1")).toBe(true);
        expect(rows.some((r: any) => r.title === "Legacy Contract 2")).toBe(true);
    });
});
