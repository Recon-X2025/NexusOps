import { describe, it, expect } from "vitest";
import { createMockContext, seedFullOrg } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import {
  vendors,
  invoices,
  invoiceLineItems,
  gstr2bImports,
  gstr2bReconLines,
  gstinRegistry,
} from "@coheronconnect/db";
import { eq } from "drizzle-orm";
import { randomUUID as uuidv4 } from "node:crypto";
import { db } from "./helpers";

describe("F-G2 GSTR-3B ITC Verification", () => {
  it("computes net payable correctly by deducting ITC from output tax", async () => {
    const { orgId, adminId } = await seedFullOrg();
    const ctx = createMockContext(adminId, orgId);
    const caller = accountingRouter.createCaller(ctx);

    let [gstin] = await db()
      .select()
      .from(gstinRegistry)
      .where(eq(gstinRegistry.orgId, orgId))
      .limit(1);
    if (!gstin) {
      const [inserted] = await db()
        .insert(gstinRegistry)
        .values({
          id: uuidv4(),
          orgId,
          gstin: "27AAACG0000A1Z5",
          legalName: "Test Org GSTIN",
          stateCode: "27",
          status: "active",
        })
        .returning();
      gstin = inserted;
    }

    const month = 10;
    const year = 2025;

    // Output Tax: 18,000 IGST
    const vendorId = uuidv4();
    await db().insert(vendors).values({
      id: vendorId,
      orgId,
      name: "Customer",
      gstin: "27XXXXX1234X1Z5",
      state: "27",
    });

    const invoiceId = uuidv4();
    await db().insert(invoices).values({
      id: invoiceId,
      orgId,
      vendorId,
      type: "receivable",
      gstinId: gstin.id,
      invoiceNumber: "INV-VERIFY-001",
      taxableValue: "100000",
      igstAmount: "18000",
      amount: "118000",
      status: "pending",
      invoiceDate: new Date("2025-10-15"),
      dueDate: new Date("2025-10-20"),
    });

    await db().insert(invoiceLineItems).values({
      id: uuidv4(),
      orgId,
      invoiceId,
      lineItemNumber: 1,
      description: "Services",
      amount: "100000",
      gstRate: 18,
      igst: "18000",
      cgst: "0",
      sgst: "0",
      grossAmount: "118000",
    });

    // Input Tax Credit: 5,000 IGST
    const importId = uuidv4();
    await db().insert(gstr2bImports).values({
      id: importId,
      orgId,
      gstinId: gstin.id,
      month,
      year,
      financialYear: "2025-26",
      status: "reconciled",
    });

    await db().insert(gstr2bReconLines).values({
      id: uuidv4(),
      orgId,
      importId,
      supplierName: "Vendor Co",
      supplierGstin: "29XXXXX9876X1Z3",
      invoiceNumber: "PUR-001",
      invoiceDate: "2025-10-10",
      bookGross: "25000",
      bookIgst: "5000",
      bookCgst: "0",
      bookSgst: "0",
      status: "matched", // Matched is required for ITC
    });

    // Generate GSTR-3B
    const gstr3b = await caller.gstr.generateGSTR3B({
      month,
      year,
      gstinId: gstin.id,
    });

    console.log("\n================ GSTR-3B RESULT ================\n");
    console.log(`Output Tax (from Invoices):`);
    console.log(`  IGST: ${gstr3b.payload["3_1"].osup_det.iamt}`);
    console.log(`  CGST: ${gstr3b.payload["3_1"].osup_det.camt}`);
    console.log(`  SGST: ${gstr3b.payload["3_1"].osup_det.samt}`);

    console.log(`\nInput Tax Credit (from matched GSTR-2B):`);
    console.log(`  IGST: ${gstr3b.payload["4"].itc_avl.osup_det.iamt}`);
    console.log(`  CGST: ${gstr3b.payload["4"].itc_avl.osup_det.camt}`);
    console.log(`  SGST: ${gstr3b.payload["4"].itc_avl.osup_det.samt}`);

    console.log(`\nNet Payable (Output - ITC):`);
    console.log(`  IGST: ${Math.max(0, gstr3b.summary.outputIGST - gstr3b.summary.inputIGST)}`);
    console.log(`  CGST: ${Math.max(0, gstr3b.summary.outputCGST - gstr3b.summary.inputCGST)}`);
    console.log(`  SGST: ${Math.max(0, gstr3b.summary.outputSGST - gstr3b.summary.inputSGST)}`);
    console.log(`  Total: ${gstr3b.summary.netPayable}`);
    console.log("================================================\n");

    expect(Number(gstr3b.payload["3_1"].osup_det.iamt)).toBe(18000);
    expect(Number(gstr3b.payload["4"].itc_avl.osup_det.iamt)).toBe(5000);
    expect(Number(Math.max(0, gstr3b.summary.outputIGST - gstr3b.summary.inputIGST))).toBe(13000);
  });
});
