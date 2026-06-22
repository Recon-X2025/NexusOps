import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg } from "./helpers";
import { crmRouter } from "../routers/crm";

describe("CRM API Integration", () => {
    let ctx: any;
    let caller: any;

    beforeEach(async () => {
        const { orgId, adminId } = await seedFullOrg();
        ctx = createMockContext(adminId, orgId);
        caller = crmRouter.createCaller(ctx);
    });

    it("should create, get, and delete an account", async () => {
        // 1. Create
        const account = await caller.createAccount({
            name: "Test Account",
            industry: "Technology",
            tier: "enterprise",
        });
        expect(account.name).toBe("Test Account");

        // 2. Get
        const fetched = await caller.getAccount({ id: account.id });
        expect(fetched.id).toBe(account.id);
        expect(fetched.name).toBe("Test Account");

        // 3. Delete
        const result = await caller.deleteAccount({ id: account.id });
        expect(result.success).toBe(true);

        // 4. Verify deleted
        await expect(caller.getAccount({ id: account.id })).rejects.toThrow(/not found/i);
    });

    it("should create, get, and delete a deal", async () => {
        // 1. Create
        const deal = await caller.createDeal({
            title: "Test Deal",
            value: "100000",
            probability: 50,
        });
        expect(deal.title).toBe("Test Deal");

        // 2. Get
        const fetched = await caller.getDeal({ id: deal.id });
        expect(fetched.id).toBe(deal.id);
        expect(fetched.title).toBe("Test Deal");

        // 3. Delete
        const result = await caller.deleteDeal({ id: deal.id });
        expect(result.success).toBe(true);

        // 4. Verify deleted
        await expect(caller.getDeal({ id: deal.id })).rejects.toThrow(/not found/i);
    });
});
