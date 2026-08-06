/**
 * Employee-directory visibility rules (pure, UI-side).
 *
 * The HR employee directory is reachable by anyone with `hr:read` — which the
 * mandatory base `requester` role holds, because ordinary staff need HR
 * self-service (raising HR cases, viewing their own record). But a requester
 * must not see the *whole* company roster (names, departments, managers, and via
 * the row Edit dialog, salary/PAN/bank). So the directory is scoped by whether
 * the caller can *manage* HR:
 *
 *   - a manager (someone with `hr:assign`, the same action the API requires to
 *     create/update an employee) sees every row;
 *   - everyone else sees only their own employee record.
 *
 * This is a display filter (defense-in-depth); the authoritative boundary is the
 * API. Kept pure and dependency-free so it is unit-testable.
 */

/** Minimal shape the filter needs from an employee row. */
export interface DirectoryEmployeeRow {
  /** FK to the platform user this employee record belongs to. */
  userId?: string | null;
  [key: string]: unknown;
}

/**
 * Filter the directory rows to what the current user may see.
 *
 * @param rows        the full employee list returned by `hr.employees.list`
 * @param currentUserId the viewing user's id (matches `row.userId`)
 * @param canManage   true when the viewer has the HR manage capability
 *                    (`can("hr","assign")`)
 */
export function filterEmployeeDirectory<T extends DirectoryEmployeeRow>(
  rows: readonly T[] | null | undefined,
  currentUserId: string | null | undefined,
  canManage: boolean,
): T[] {
  const all = rows ?? [];
  if (canManage) return [...all];
  if (!currentUserId) return [];
  return all.filter((r) => r.userId === currentUserId);
}
