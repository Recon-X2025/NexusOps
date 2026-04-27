import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg } from "./helpers";
import { accountingRouter } from "../routers/accounting";

describe("Accounting API Integration", () => {
    let ctx: any;
    let caller: any;

    beforeEach(async () => {
        const { orgId, adminId } = await seedFullOrg();
        ctx = createMockContext(adminId, orgId);
        caller = accountingRouter.createCaller(ctx);
    });

    it("should seed COA and create a journal entry", async () => {
        // 1. Seed COA
        const seedResult = await caller.coa.seed();
        expect(seedResult.seeded).toBeGreaterThan(0);

        // 2. List COA to get account IDs
        const accounts = await caller.coa.list({});
        const cashAcct = accounts.find((a: any) => a.code === "1110"); // Cash
        const salesAcct = accounts.find((a: any) => a.code === "4100"); // Sales

        expect(cashAcct).toBeDefined();
        expect(salesAcct).toBeDefined();

        // 3. Create Journal Entry
        const je = await caller.journal.create({
            date: new Date(),
            description: "Test Sale",
            lines: [
                { accountId: cashAcct.id, description: "Cash Sale", debitAmount: 1000, creditAmount: 0 },
                { accountId: salesAcct.id, description: "Sales Revenue", debitAmount: 0, creditAmount: 1000 },
            ],
        });
        expect(je.description).toBe("Test Sale");
        expect(Number(je.totalDebit)).toBe(1000);

        // 4. Verify Ledger (requires posting the entry)
        await caller.journal.post({ id: je.id });
        const ledger = await caller.ledger({ accountId: cashAcct.id });
        expect(ledger.lines.length).toBeGreaterThan(0);
        expect(Number(ledger.lines[0].line.debitAmount)).toBe(1000);
    });
});
