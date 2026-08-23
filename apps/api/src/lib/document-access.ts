/**
 * Who may open a document.
 *
 * Until 2026-08-23 `document_acls` was written by `documents.grantAcl` and read
 * NOWHERE. A restriction was recorded and never enforced, so the grant screen
 * asserted a control that did not exist. This is the enforcement.
 *
 * THE RULE, as decided by the owner:
 *
 *   1. A document with no ACL rows is unrestricted. Existing behaviour is
 *      unchanged for every document already in the system — this feature can
 *      only ever narrow access that was explicitly narrowed.
 *   2. The ORG OWNER always has access, always. Restricting a document must not
 *      be able to lock an organisation out of its own records. When an owner
 *      opens a document they are not otherwise entitled to, that is a BYPASS and
 *      it is audited — the point of a break-glass is that it leaves a mark.
 *   3. The UPLOADER keeps access to what they uploaded, unless explicitly
 *      removed. "Explicitly" means a deny row naming them; absence from the
 *      grant list is not removal.
 *   4. Otherwise a matching, unexpired grant is required — by user, by role, by
 *      team, or everyone-in-org.
 *   5. A DENY beats a grant. Rule 2 beats a deny.
 *   6. Every rule has a WINDOW — grant, deny, or not yet in effect. A rule
 *      outside its window does not apply in either direction.
 *
 * VISIBILITY IS NOT ACCESS. A restricted document still appears in listings —
 * "can see, but can't open without permission". Hiding it entirely would make
 * shared folders lie about what they contain, and a user who cannot see a
 * document cannot ask for access to it.
 */
import { documentAcls, teamMembers, teams, eq, and, or, isNull, gt, lte, inArray, type DbOrTx } from "@coheronconnect/db";

export interface DocumentAccess {
  /** The document carries at least one live ACL row. */
  restricted: boolean;
  /** Whether THIS caller may open it. */
  canOpen: boolean;
  /** Why — for auditing a bypass and for explaining a refusal. */
  via: "unrestricted" | "owner-bypass" | "uploader" | "acl" | "denied" | "no-grant";
}

export interface AccessCaller {
  userId: string;
  /** `users.role` — "owner" is the break-glass. */
  role: string | null | undefined;
  /** `users.matrixRole` — matched against principalType "role". */
  matrixRole: string | null | undefined;
  orgId: string;
}

/**
 * Resolve access for one document. Read-only; never throws for a refusal —
 * the caller decides whether a refusal is a 403, a filtered list, or a padlock.
 */
export async function resolveDocumentAccess(
  db: DbOrTx,
  doc: { id: string; ownerId: string | null },
  caller: AccessCaller,
): Promise<DocumentAccess> {
  const now = new Date();

  // Rows IN EFFECT RIGHT NOW. A rule has a window: it starts at
  // `effectiveFrom` (null = immediately) and ends at `expiresAt` (null =
  // never). Outside that window it does not apply — in either direction. An
  // expired grant is not a grant; a deny that starts next month is not yet a
  // deny. Filtered in SQL so a document with a hundred historical rules costs
  // the same as one with two.
  const rows = await db
    .select()
    .from(documentAcls)
    .where(
      and(
        eq(documentAcls.documentId, doc.id),
        or(isNull(documentAcls.effectiveFrom), lte(documentAcls.effectiveFrom, now)),
        or(isNull(documentAcls.expiresAt), gt(documentAcls.expiresAt, now)),
      ),
    );

  if (rows.length === 0) return { restricted: false, canOpen: true, via: "unrestricted" };

  // The caller's teams — resolved only when a team rule exists, because this is
  // on the document-open path and most documents have none.
  let callerTeams: string[] = [];
  if (rows.some((r) => r.principalType === "team")) {
    const memberships = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(and(eq(teamMembers.userId, caller.userId), eq(teams.orgId, caller.orgId)));
    callerTeams = memberships.map((m) => m.teamId);
  }

  const matches = (r: typeof rows[number]): boolean => {
    switch (r.principalType) {
      case "everyone_in_org": return true;
      case "user":            return r.principalId === caller.userId;
      case "role":            return !!caller.matrixRole && r.principalId === caller.matrixRole;
      case "team":            return !!r.principalId && callerTeams.includes(r.principalId);
      default:                return false;
    }
  };

  const mine = rows.filter(matches);
  const denied = mine.some((r) => r.isDeny);
  const granted = mine.some((r) => !r.isDeny);

  // 2 — break-glass. Beats a deny, deliberately.
  if (caller.role === "owner") {
    const entitled = granted && !denied;
    return { restricted: true, canOpen: true, via: entitled ? "acl" : "owner-bypass" };
  }
  // 5 — deny beats grant, and beats rule 3.
  if (denied) return { restricted: true, canOpen: false, via: "denied" };
  // 3 — the uploader keeps their own document.
  if (doc.ownerId && doc.ownerId === caller.userId) {
    return { restricted: true, canOpen: true, via: "uploader" };
  }
  // 4
  if (granted) return { restricted: true, canOpen: true, via: "acl" };

  return { restricted: true, canOpen: false, via: "no-grant" };
}

/** Resolve access for many documents at once — for list screens. */
export async function resolveDocumentAccessBatch(
  db: DbOrTx,
  docs: Array<{ id: string; ownerId: string | null }>,
  caller: AccessCaller,
): Promise<Map<string, DocumentAccess>> {
  const out = new Map<string, DocumentAccess>();
  if (docs.length === 0) return out;

  // One query for every document on the page, rather than one per row.
  const ids = docs.map((d) => d.id);
  const rows = await db
    .select({ documentId: documentAcls.documentId })
    .from(documentAcls)
    .where(
      and(
        inArray(documentAcls.documentId, ids),
        // Same window as the single-document path. Without this a document
        // whose only rule starts next month would show as restricted today.
        or(isNull(documentAcls.effectiveFrom), lte(documentAcls.effectiveFrom, new Date())),
        or(isNull(documentAcls.expiresAt), gt(documentAcls.expiresAt, new Date())),
      ),
    );
  const restrictedIds = new Set(rows.map((r) => r.documentId));

  for (const d of docs) {
    if (!restrictedIds.has(d.id)) {
      out.set(d.id, { restricted: false, canOpen: true, via: "unrestricted" });
    } else {
      out.set(d.id, await resolveDocumentAccess(db, d, caller));
    }
  }
  return out;
}
