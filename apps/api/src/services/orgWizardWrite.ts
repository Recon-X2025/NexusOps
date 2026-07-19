import { DbOrTx, eq, sql } from "@coheronconnect/db";
import {
  organizations,
  gstinRegistry,
  legalEntities,
  superAdminAuditLogs
} from "@coheronconnect/db/schema";
import { panColumns } from "../lib/pan";

export class DuplicateGstinError extends Error {
  constructor() {
    super("This GSTIN is already registered to another organisation");
    this.name = "DuplicateGstinError";
  }
}

export async function writeWizardData(
  db: DbOrTx,
  orgId: string,
  input: {
    profile?: {
      displayName?: string;
      industry?: string;
      size?: string;
      city?: string;
      state?: string;
      website?: string;
      supportEmail?: string;
    };
    india?: {
      gstin?: string;
      pan?: string;
      cin?: string;
      tan?: string;
      pf?: string;
      stateCode?: string;
    };
    itsm?: {
      p1?: number;
      p2?: number;
      p3?: number;
      p4?: number;
    };
    step?: number;
  },
  actor: {
    type: "tenant_user" | "mac_operator";
    id: string; // user.id (for tenant_user) or email (for mac_operator)
  }
) {
  return await db.transaction(async (tx) => {
    // 1. Fetch organization state before write
    const [orgRow] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!orgRow) {
      throw new Error("Organisation not found");
    }

    const updateFields: any = { // any-ratchet-allow: dynamic update builder
      updatedAt: new Date()
    };

    if (actor.type === "tenant_user") {
      updateFields.onboardingLastEditedBy = actor.id;
    }

    // Process Profile
    if (input.profile) {
      if (input.profile.displayName !== undefined) updateFields.name = input.profile.displayName;
      if (input.profile.industry !== undefined) updateFields.industry = input.profile.industry;
      if (input.profile.size !== undefined) updateFields.companySize = input.profile.size;
      if (input.profile.city !== undefined) updateFields.city = input.profile.city;
      if (input.profile.state !== undefined) updateFields.state = input.profile.state;
      if (input.profile.website !== undefined) updateFields.website = input.profile.website;
      if (input.profile.supportEmail !== undefined) updateFields.supportEmail = input.profile.supportEmail;
    }

    // Process ITSM
    if (input.itsm) {
      if (input.itsm.p1 !== undefined) updateFields.slaP1Hours = input.itsm.p1;
      if (input.itsm.p2 !== undefined) updateFields.slaP2Hours = input.itsm.p2;
      if (input.itsm.p3 !== undefined) updateFields.slaP3Hours = input.itsm.p3;
      if (input.itsm.p4 !== undefined) updateFields.slaP4Hours = input.itsm.p4;
    }

    // Process India Compliance (partial mapping)
    if (input.india) {
      if (input.india.pan !== undefined) {
        const panCols = panColumns(input.india.pan);
        updateFields.pan = input.india.pan;
        updateFields.panMaskedHash = panCols.panMaskedHash;
        updateFields.panMaskedDisplay = panCols.panMaskedDisplay;
      }
      if (input.india.tan !== undefined) updateFields.tan = input.india.tan;
      if (input.india.pf !== undefined) updateFields.epfCode = input.india.pf;
      if (input.india.stateCode !== undefined) updateFields.primaryStateCode = input.india.stateCode;
    }

    // Process Step Progress
    if (input.step !== undefined) {
      updateFields.onboardingStep = sql`GREATEST(COALESCE(${organizations.onboardingStep}, 1), ${input.step})`;
    }

    // Perform org update if fields were set
    await tx.update(organizations).set(updateFields).where(eq(organizations.id, orgId));

    // Handle GSTIN Registry
    if (input.india && (input.india.gstin !== undefined || input.india.stateCode !== undefined)) {
      try {
        const [existingGstin] = await tx
          .select()
          .from(gstinRegistry)
          .where(eq(gstinRegistry.orgId, orgId))
          .limit(1);

        if (existingGstin) {
          const gstinUpdate: any = { updatedAt: new Date() }; // any-ratchet-allow: dynamic update builder
          if (input.india.gstin !== undefined) gstinUpdate.gstin = input.india.gstin;
          if (input.india.stateCode !== undefined) gstinUpdate.stateCode = input.india.stateCode;
          await tx.update(gstinRegistry).set(gstinUpdate).where(eq(gstinRegistry.orgId, orgId));
        } else {
          const finalGstin = input.india.gstin ?? "";
          const finalStateCode = input.india.stateCode ?? input.india.gstin?.substring(0, 2) ?? "";
          await tx.insert(gstinRegistry).values({
            orgId,
            gstin: finalGstin,
            legalName: updateFields.name ?? orgRow.name,
            stateCode: finalStateCode,
            isPrimary: true
          });
        }
      } catch (err: any) { // any-ratchet-allow: pg database error handling
        if (err.code === "23505" || err.message?.includes("unique constraint") || err.message?.includes("gstin")) {
          throw new DuplicateGstinError();
        }
        throw err;
      }
    }

    // Handle Legal Entity for CIN
    if (input.india && input.india.cin !== undefined) {
      const [existingLe] = await tx
        .select()
        .from(legalEntities)
        .where(eq(legalEntities.orgId, orgId))
        .limit(1);

      if (existingLe) {
        await tx
          .update(legalEntities)
          .set({ cin: input.india.cin, updatedAt: new Date() })
          .where(eq(legalEntities.orgId, orgId));
      } else {
        await tx.insert(legalEntities).values({
          orgId,
          name: updateFields.name ?? orgRow.name,
          code: "HQ",
          cin: input.india.cin
        });
      }
    }

    // 2. Fetch updated state for audit logging
    const [updatedOrgRow] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    // Audit logs for MAC operators
    if (actor.type === "mac_operator") {
      await tx.insert(superAdminAuditLogs).values({
        actorEmail: actor.id,
        orgId,
        action: "UPDATE_WIZARD_DATA",
        beforeJson: orgRow,
        afterJson: updatedOrgRow
      });
    }

    return { success: true };
  });
}
