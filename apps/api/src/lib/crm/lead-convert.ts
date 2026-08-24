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
  or,
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

  // Lock the lead FOR UPDATE so concurrent conversions serialise: the first sets
  // convertedDealId and commits; the second then reads it and returns the existing
  // deal via the idempotency check below, instead of both reading a null
  // convertedDealId and each minting a duplicate deal/account/contact. (The caller
  // owns the transaction — see the doc comment — so this lock holds until commit.)
  const [lead] = await tx
    .select()
    .from(crmLeads)
    .where(and(eq(crmLeads.id, leadId), eq(crmLeads.orgId, orgId)))
    .for("update");
  if (!lead) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
  }

  /*
   * Idempotency keys on `convertedDealId` ALONE.
   *
   * It was `status === "converted" && convertedDealId`, and the AND was the
   * hole: `leads.update` accepts a status and blocks only the move INTO
   * "converted", never the move out. Editing a converted lead to any other
   * status therefore left `convertedDealId` set while the status said
   * otherwise, and this guard — needing both — stopped matching. The next
   * convert fell straight through and raised a SECOND deal against the same
   * lead. Measured: deals 1 -> 2 on a lead already converted.
   *
   * `convertedDealId` is the durable fact. A lead that points at a deal has
   * been converted, whatever its status column has since been edited to say.
   */
  if (lead.convertedDealId) {
    const [existing] = await tx
      .select()
      .from(crmDeals)
      .where(and(eq(crmDeals.id, lead.convertedDealId), eq(crmDeals.orgId, orgId)));
    if (existing) return existing;
  }

  /**
   * A deal that cannot be forecast is not worth creating. Converting therefore
   * REQUIRES an estimated value and an expected close date — enforced here, in the
   * shared conversion path, so every caller (router, UI, future importer) is bound
   * by it rather than only the screen that happens to ask.
   *
   * The value may come from the caller (an explicit override at convert time) or
   * from the lead's own `estimatedValue`; the close date comes from the lead. The
   * message names exactly which one is missing.
   */
  const resolvedValue = dealValue ?? (lead.estimatedValue ?? null);
  const resolvedClose = lead.expectedClose ?? null;
  const missing: string[] = [];
  if (resolvedValue === null || resolvedValue === "") missing.push("estimated value");
  if (resolvedClose === null) missing.push("expected close date");
  if (missing.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        `Cannot convert this lead: ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} missing. ` +
        "A deal without both cannot be forecast — set them on the lead first.",
    });
  }

  /*
   * ── Upsert the account. ───────────────────────────────────────────────────
   *
   * A CONVERSION ALWAYS PRODUCES AN ACCOUNT. This was `if (!accountId &&
   * lead.company)`, so a lead with no company converted to a contact whose
   * `accountId` was undefined — and `crm_contacts.account_id` is nullable, so
   * it stored NULL without complaint. `contacts.create` REQUIRES an accountId;
   * conversion did not. Two paths, two rules.
   *
   * The consequence is not cosmetic: an account-less contact appears on no
   * account page, and `contacts.list({ accountId })` — which is how the account
   * screen finds its people — cannot return it by construction. The deal was
   * left account-less too, which is the same hole one level up: `crm_deals`
   * carries the account, and the quote -> deal -> account chain is how a quote
   * finds its buyer and its place of supply.
   *
   * DECISION (b): where the lead names no company, the account is named after
   * the PERSON. Refusing to convert — option (a) — was rejected because a sole
   * proprietor or an individual buyer is an ordinary Indian SMB customer, not
   * bad data; refusing would leave a fully qualified lead (conversion already
   * demands an estimated value and an expected close) with no route forward
   * except typing a company name that does not exist, which puts the
   * fabrication in the customer record rather than keeping it out. The person's
   * name is real data already on the lead; nothing is invented.
   *
   * Zero account-less contacts exist on either database today, so there is
   * nothing to migrate — this closes the path, it does not repair history.
   */
  let accountId = lead.accountId ?? undefined;
  if (!accountId) {
    const company = lead.company?.trim();
    const personName = [lead.firstName, lead.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ");
    // firstName/lastName are NOT NULL, so personName is only ever empty if both
    // are whitespace. Email is the next identifying thing the lead carries.
    const accountName = company || personName || lead.email?.trim() || `Lead ${leadId}`;

    const [existingAccount] = await tx
      .select()
      .from(crmAccounts)
      .where(
        and(
          eq(crmAccounts.orgId, orgId),
          eq(crmAccounts.name, accountName),
          eq(crmAccounts.archived, false),
        ),
      );
    if (existingAccount) {
      accountId = existingAccount.id;
    } else {
      const [account] = await tx
        .insert(crmAccounts)
        .values({
          orgId,
          name: accountName,
          ownerId: lead.ownerId ?? actorId,
          // Say why the account exists when it was not a named company, so the
          // record is legible to whoever opens it next.
          notes: company
            ? undefined
            : "Created on lead conversion. The lead named no company, so this account is the individual buyer.",
        })
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
      // Carry the lead's qualification onto the opportunity. Before this a
      // converted lead landed in the pipeline worth zero with no close date.
      value: resolvedValue,
      expectedClose: resolvedClose,
      ownerId: actorId,
      accountId,
      contactId,
      weightedValue: resolvedValue ? String(Number(resolvedValue) * 0.1) : undefined,
    })
    .returning();

  /*
   * ── Carry the lead's history onto the new deal. ──────────────────────────
   *
   * This matched on contact_id ALONE. Activities logged against a LEAD carry
   * lead_id with contact_id NULL, so they never matched: a converted lead's
   * history stayed stranded on the lead, the new deal showed zero, and no
   * screen surfaced what had happened before conversion. Proven live — a lead
   * with two activities converted, deal showed 0, lead kept both.
   *
   * The contact_id branch is EXTENDED, not replaced: a lead whose activities
   * were already attached by contact_id must keep re-pointing exactly as before.
   *
   * DECISION (a): set deal_id and LEAVE lead_id intact. The lead row survives
   * conversion and still has a page; clearing lead_id would blank that page and
   * erase the record of what happened before the deal existed. An activity is
   * genuinely associated with all of them, and these columns are independent —
   * so the deal, the account and the lead each show it. Nothing is moved away
   * from anywhere.
   *
   * account_id and contact_id are set too, because conversion is the moment
   * those associations become known — without them the account timeline (see
   * accounts/[id]/page.tsx) would start blank for a customer that has a history.
   *
   * `isNull(dealId)` is kept so we never steal another deal's activities.
   */
  const associationFilters = [
    contactId ? eq(crmActivities.contactId, contactId) : undefined,
    eq(crmActivities.leadId, leadId),
  ].filter(Boolean);

  await tx
    .update(crmActivities)
    .set({
      dealId: deal!.id,
      accountId,
      ...(contactId ? { contactId } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(crmActivities.orgId, orgId),
        eq(crmActivities.archived, false),
        isNull(crmActivities.dealId),
        or(...associationFilters),
      ),
    );

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
