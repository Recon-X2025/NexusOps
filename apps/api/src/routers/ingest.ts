import { router, permissionProcedure } from "../lib/trpc";
import { z } from "zod";
import {
    legalMatters,
    contracts,
    eq,
    and,
} from "@nexusops/db";
import { getNextNumber, syncOrgCounters } from "../lib/auto-number";

const MatterIngestSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(["litigation", "employment", "ip", "regulatory", "ma", "data_privacy", "corporate", "commercial"]).default("commercial"),
    status: z.enum(["intake", "active", "discovery", "pre_trial", "trial", "closed", "settled"]).default("intake"),
    externalCounsel: z.string().optional(),
    jurisdiction: z.string().optional(),
    cnr: z.string().optional(),
    courtName: z.string().optional(),
    nextHearingAt: z.string().optional(),
    limitationDeadlineAt: z.string().optional(),
});

const ContractIngestSchema = z.object({
    title: z.string().min(1),
    contractType: z.string().default("general"),
    counterparty: z.string().optional(),
    amount: z.string().optional(),
    currency: z.string().default("INR"),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    status: z.string().default("active"),
});

export const ingestRouter = router({
    /**
     * Bulk import legal matters.
     * Automatically assigns matter numbers and syncs org counters.
     */
    importMatters: permissionProcedure("legal", "write")
        .input(z.array(MatterIngestSchema))
        .mutation(async ({ ctx, input }) => {
            const { db, org, user } = ctx;
            const results = [];

            for (const item of input) {
                const matterNumber = await getNextNumber(db, org!.id, "MAT");
                const { nextHearingAt, limitationDeadlineAt, ...rest } = item;

                const [row] = await db.insert(legalMatters).values({
                    orgId: org!.id,
                    matterNumber,
                    ...rest,
                    assignedTo: user!.id,
                    nextHearingAt: nextHearingAt ? new Date(nextHearingAt) : undefined,
                    limitationDeadlineAt: limitationDeadlineAt ? new Date(limitationDeadlineAt) : undefined,
                }).returning();

                results.push(row.id);
            }

            // Sync counters after bulk import to ensure no collisions
            await syncOrgCounters(db);

            return { imported: results.length, ids: results };
        }),

    /**
     * Bulk import contracts.
     */
    importContracts: permissionProcedure("contracts", "write")
        .input(z.array(ContractIngestSchema))
        .mutation(async ({ ctx, input }) => {
            const { db, org, user } = ctx;
            const results = [];

            for (const item of input) {
                const contractNumber = await getNextNumber(db, org!.id, "CON");
                const { startDate, endDate, ...rest } = item;

                const [row] = await db.insert(contracts).values({
                    orgId: org!.id,
                    contractNumber,
                    ...rest,
                    ownerId: user!.id,
                    startDate: startDate ? new Date(startDate) : undefined,
                    endDate: endDate ? new Date(endDate) : undefined,
                }).returning();

                results.push(row.id);
            }

            await syncOrgCounters(db);

            return { imported: results.length, ids: results };
        }),
});
