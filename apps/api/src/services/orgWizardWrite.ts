import { DbOrTx, eq, sql } from "@coheronconnect/db";
import {
  organizations,
  gstinRegistry,
  legalEntities,
  superAdminAuditLogs
} from "@coheronconnect/db/schema";
import { panColumns } from "../lib/pan";
// The GSTIN is the authority on its own state code — see the GST registry block below.
import { validateGSTIN } from "@coheronconnect/payroll-math";

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
      /** LLP registration identifier (7 chars). Persisted to legalEntities.llpin. */
      llpin?: string;
      /** Legal entity type — persisted to organizations.entity_type. */
      entityType?:
        | "private_limited"
        | "public_limited"
        | "one_person_company"
        | "llp"
        | "partnership_firm"
        | "sole_proprietorship"
        | "huf"
        | "trust_society_section8";
      tan?: string;
      pf?: string;
      esi?: string;
      /** EPF contribution rate for this establishment (percentage: 12 or 10). Applies to every
       *  employee under this registration. Absent leaves the current value (default 12). */
      pfContributionRate?: number;
      /** The EPFO ground for a 10% rate (one of the enumerated reasons). Required when the rate is
       *  below 12; ignored/cleared at 12. */
      pfReducedRateReason?:
        | "bidi"
        | "brick"
        | "coir"
        | "jute"
        | "guar_gum"
        | "under_20_employees"
        | "sick_establishment";
      stateCode?: string;
      annualAggregateTurnover?: number;
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
        // panColumns encrypts the raw PAN (KMS envelope) and derives the match aids; spread
        // its `pan` (ciphertext) — never re-assign the plaintext input over it.
        const panCols = await panColumns(input.india.pan);
        updateFields.pan = panCols.pan;
        updateFields.panMaskedHash = panCols.panMaskedHash;
        updateFields.panMaskedDisplay = panCols.panMaskedDisplay;
      }
      if (input.india.tan !== undefined) updateFields.tan = input.india.tan;
      if (input.india.entityType !== undefined) updateFields.entityType = input.india.entityType;
      if (input.india.pf !== undefined) updateFields.epfCode = input.india.pf;
      if (input.india.esi !== undefined) updateFields.esiEstablishmentNumber = input.india.esi;
      if (input.india.pfContributionRate !== undefined) {
        // A reduced (< 12%) rate MUST carry an enumerated EPFO ground — that ground is what goes on
        // the ECR upload. At 12% the reason is cleared.
        if (input.india.pfContributionRate < 12 && !input.india.pfReducedRateReason) {
          throw new Error(
            "A reduced PF contribution rate (below 12%) requires a reason — one of: Bidi, Brick, " +
              "Coir, Jute, Guar Gum, fewer than 20 employees, or a sick establishment.",
          );
        }
        updateFields.pfContributionRate = String(input.india.pfContributionRate);
        updateFields.pfReducedRateReason =
          input.india.pfContributionRate < 12 ? (input.india.pfReducedRateReason ?? null) : null;
      }
      if (input.india.stateCode !== undefined) updateFields.primaryStateCode = input.india.stateCode;
      if (input.india.annualAggregateTurnover !== undefined) {
        updateFields.annualAggregateTurnover = String(input.india.annualAggregateTurnover);
      }
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

        /*
         * The GST registry's state code comes from the GSTIN, NOT from the
         * wizard's `stateCode` field.
         *
         * That field is labelled "2-letter ISO 3166-2:IN code" (placeholder
         * "MH", default "KA") and also feeds `organizations.primaryStateCode`,
         * which is a different vocabulary for a different consumer. Writing it
         * here made the supplier state unresolvable: `normaliseStateToCode("KA")`
         * returns null, so `computeGST` compared "" against the buyer's "29" and
         * billed every sale as INTER-state IGST.
         *
         * `getGstStateCode` derives from the GSTIN and covers all 39 GST
         * jurisdictions, so no state or union territory is left out. When there
         * is no GSTIN there is no GST registration to speak of, and the ISO code
         * is NOT substituted — an empty state is an honest unknown, whereas "KA"
         * is a value that looks set and resolves to nothing.
         */
        const gstStateCode = (g: string | undefined): string => {
          const parsed = g ? validateGSTIN(g) : null;
          return parsed?.valid && parsed.stateCode ? parsed.stateCode : "";
        };

        if (existingGstin) {
          const gstinUpdate: any = { updatedAt: new Date() }; // any-ratchet-allow: dynamic update builder
          if (input.india.gstin !== undefined) {
            gstinUpdate.gstin = input.india.gstin;
            gstinUpdate.stateCode = gstStateCode(input.india.gstin);
          }
          await tx.update(gstinRegistry).set(gstinUpdate).where(eq(gstinRegistry.orgId, orgId));
        } else {
          const finalGstin = input.india.gstin ?? "";
          await tx.insert(gstinRegistry).values({
            orgId,
            gstin: finalGstin,
            legalName: updateFields.name ?? orgRow.name,
            stateCode: gstStateCode(input.india.gstin),
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

    // Handle Legal Entity registration identifier: CIN (companies) OR LLPIN (LLP). Both live on
    // legalEntities; an entity carries at most one, disambiguated by organizations.entity_type.
    if (input.india && (input.india.cin !== undefined || input.india.llpin !== undefined)) {
      const [existingLe] = await tx
        .select()
        .from(legalEntities)
        .where(eq(legalEntities.orgId, orgId))
        .limit(1);

      const idFields: { cin?: string; llpin?: string } = {};
      if (input.india.cin !== undefined) idFields.cin = input.india.cin;
      if (input.india.llpin !== undefined) idFields.llpin = input.india.llpin;

      if (existingLe) {
        await tx
          .update(legalEntities)
          .set({ ...idFields, updatedAt: new Date() })
          .where(eq(legalEntities.orgId, orgId));
      } else {
        await tx.insert(legalEntities).values({
          orgId,
          name: updateFields.name ?? orgRow.name,
          code: "HQ",
          ...idFields,
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
