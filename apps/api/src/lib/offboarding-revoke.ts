/**
 * Offboarding → platform access revocation.
 *
 * Product rule: when an employee is offboarded, their login is disabled at END OF
 * DAY ON THE DAY AFTER their recorded last working day. They keep access through
 * the last working day itself and one further day for handover. Documents are
 * emailed by HR afterwards; no portal access is retained.
 *
 * The trigger is a DATE, not the offboarding event. An offboarding recorded today
 * with a last working day next month must NOT disable access today — which is why
 * this is a daily sweep over `employees.end_date` rather than something the
 * offboarding mutation does inline.
 *
 * Revocation uses the SAME mechanism as the Admin Console's disable action
 * (`admin.users.delete`, apps/api/src/routers/admin.ts:229-247): set
 * `users.status = "disabled"` and write an `audit_logs` row. There is deliberately
 * not a second disable path.
 */
import {
  employees,
  users,
  auditLogs,
  eq,
  and,
  isNotNull,
  lt,
  type Db,
} from "@coheronconnect/db";

/**
 * The instant at which access ends for a given last working day: the very end of
 * the following day. Access is retained through `endDate` and through `endDate+1`;
 * it is revoked once the clock passes midnight at the end of that extra day.
 *
 * Example — last working day Mon 10th:
 *   Mon 10th  → retained (last working day)
 *   Tue 11th  → retained (handover day)
 *   Wed 12th 00:00 onwards → revoked
 */
export function accessEndsAt(lastWorkingDay: Date): Date {
  const d = new Date(lastWorkingDay);
  // Midnight at the start of the day AFTER the handover day = end of handover day.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 2, 0, 0, 0, 0);
}

export interface RevocationResult {
  /** Users whose status was flipped to `disabled` by this run. */
  revoked: { employeeId: string; userId: string }[];
  /** Offboarded-and-elapsed employees with no linked user account — skipped, not an error. */
  skippedNoUser: string[];
}

/**
 * Disables the login of every employee whose access window has closed.
 *
 * Idempotent: only users still `active`/`invited` are touched, so re-running the
 * sweep does nothing and cannot produce duplicate audit rows.
 *
 * An employee with no linked user account is skipped silently — an employee
 * record without a login is a normal state (imported staff who never got access),
 * not a fault.
 */
export async function revokeElapsedOffboardedAccess(
  db: Db,
  now: Date = new Date(),
): Promise<RevocationResult> {
  const result: RevocationResult = { revoked: [], skippedNoUser: [] };

  // Candidates: an exit date is recorded and it is far enough in the past that
  // even the handover day has fully elapsed. Filtering in SQL on `end_date <
  // now` first keeps the scan small; `accessEndsAt` then applies the exact
  // end-of-next-day boundary in application code, where it is testable.
  const candidates = await db
    .select({
      employeeId: employees.id,
      orgId: employees.orgId,
      userId: employees.userId,
      endDate: employees.endDate,
    })
    .from(employees)
    .where(and(isNotNull(employees.endDate), lt(employees.endDate, now)));

  for (const c of candidates) {
    if (!c.endDate) continue;
    if (now < accessEndsAt(c.endDate)) continue; // still inside the handover window

    if (!c.userId) {
      result.skippedNoUser.push(c.employeeId);
      continue;
    }

    // Only flip a login that is still usable. Keeps the sweep idempotent and
    // stops it re-auditing someone an admin already disabled by hand.
    const [updated] = await db
      .update(users)
      .set({ status: "disabled", updatedAt: now })
      .where(and(eq(users.id, c.userId), eq(users.orgId, c.orgId), eq(users.status, "active")))
      .returning({ id: users.id });

    if (!updated) continue;

    await db.insert(auditLogs).values({
      orgId: c.orgId,
      // No human actor — the date, not a person, triggered this.
      userId: null,
      action: "user_access_revoked_offboarding",
      resourceType: "user",
      resourceId: c.userId,
      changes: {
        status: "disabled",
        reason: "offboarding_elapsed",
        employeeId: c.employeeId,
        lastWorkingDay: c.endDate.toISOString(),
        revokedAt: now.toISOString(),
      } as Record<string, unknown>,
    });

    result.revoked.push({ employeeId: c.employeeId, userId: c.userId });
  }

  return result;
}
