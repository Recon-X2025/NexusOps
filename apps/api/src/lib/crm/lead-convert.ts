/**
 * Lossless lead → deal conversion (G6).
 * ─────────────────────────────────────
 * Before G6 the convert path created a deal from only { title, value } and
 * dropped the lead's company + person entirely. This helper upserts a real
 * `crm_account` (from the lead's company) and `crm_contact` (from the lead's
 * person), carries both onto the new `crm_deal`, re-points the lead's open
 * activities at that deal, and back-links the lead to account/contact/deal.
 *
 * It runs inside a caller-supplied transaction so the whole conversion is
 * atomic: a converted deal can never exist without its source lead flagged
 * "converted" and linked to the account/contact it came from.
 *
 * Idempotent: converting an already-converted lead returns the existing deal
 * and creates no duplicate account/contact/deal.
 */
import {
  crmLeads,
  crmDeals,
  crmAccounts,
  crmContacts,
  crmActivities,
  eq,
  and,
  isNull,
  type DbOrTx,
} from "@coheronconnect/db";
import { TRPCError } from "@trpc/server";

export interface ConvertLeadArgs {
  leadId: string;
  orgId: string;
  actorId: string;
  dealTitle: string;
  dealValue?: string;
}

/**
 * @param tx  a transaction (or db) handle — the caller owns the transaction so
 *            the conversion commits together with any surrounding work.
 */
export async function convertLeadToDeal(tx: DbOrTx, args: ConvertLeadArgs) {
  const { leadId, orgId, actorId, dealTitle, dealValue } = args;

  const [lead] = await tx
    .select()
    .from(crmLeads)
    .where(and(eq(crmLeads.id, leadId), eq(crmLeads.orgId, orgId)));
  if (!lead) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
  }

  // Idempotency: an already-converted lead returns its existing deal untouched.
  if (lead.status === "converted" && lead.convertedDealId) {
    const [existing] = await tx
      .select()
      .from(crmDeals)
      .where(and(eq(crmDeals.id, lead.convertedDealId), eq(crmDeals.orgId, orgId)));
    if (existing) return existing;
  }

  // ── Upsert the account from the lead's company. ────────────────────────────
  let accountId = lead.accountId ?? undefined;
  if (!accountId && lead.company) {
    const [existingAccount] = await tx
      .select()
      .from(crmAccounts)
      .where(
        and(
          eq(crmAccounts.orgId, orgId),
          eq(crmAccounts.name, lead.company),
          eq(crmAccounts.archived, false),
        ),
      );
    if (existingAccount) {
      accountId = existingAccount.id;
    } else {
      const [account] = await tx
        .insert(crmAccounts)
        .values({ orgId, name: lead.company, ownerId: lead.ownerId ?? actorId })
        .returning();
      accountId = account!.id;
    }
  }

  // ── Upsert the contact from the lead's person. ─────────────────────────────
  let contactId = lead.contactId ?? undefined;
  if (!contactId) {
    const [existingContact] = lead.email
      ? await tx
          .select()
          .from(crmContacts)
          .where(
            and(
              eq(crmContacts.orgId, orgId),
              eq(crmContacts.archived, false),
              eq(crmContacts.email, lead.email),
            ),
          )
      : [undefined];
    if (existingContact) {
      contactId = existingContact.id;
      // Attach the contact to the account if it had none.
      if (accountId && !existingContact.accountId) {
        await tx
          .update(crmContacts)
          .set({ accountId, updatedAt: new Date() })
          .where(eq(crmContacts.id, existingContact.id));
      }
    } else {
      const [contact] = await tx
        .insert(crmContacts)
        .values({
          orgId,
          accountId,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          title: lead.title,
        })
        .returning();
      contactId = contact!.id;
    }
  }

  // ── Create the deal carrying account + contact. ────────────────────────────
  const [deal] = await tx
    .insert(crmDeals)
    .values({
      orgId,
      title: dealTitle,
      value: dealValue,
      ownerId: actorId,
      accountId,
      contactId,
      weightedValue: dealValue ? String(Number(dealValue) * 0.1) : undefined,
    })
    .returning();

  // ── Re-point the lead's open activities at the new deal. ───────────────────
  // Only unarchived activities on this contact that aren't already tied to a
  // deal — so we never steal another deal's history.
  if (contactId) {
    await tx
      .update(crmActivities)
      .set({ dealId: deal!.id, accountId, updatedAt: new Date() })
      .where(
        and(
          eq(crmActivities.orgId, orgId),
          eq(crmActivities.contactId, contactId),
          eq(crmActivities.archived, false),
          isNull(crmActivities.dealId),
        ),
      );
  }

  // ── Flag + back-link the lead. ─────────────────────────────────────────────
  await tx
    .update(crmLeads)
    .set({
      status: "converted",
      convertedDealId: deal!.id,
      accountId,
      contactId,
      updatedAt: new Date(),
    })
    .where(and(eq(crmLeads.id, leadId), eq(crmLeads.orgId, orgId)));

  return deal!;
}
