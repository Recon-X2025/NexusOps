import { employees, eq, and, inArray } from "@coheronconnect/db";
import type { Context } from "./trpc";

/** All employee IDs in the primary reporting tree under `managerEmployeeId` (excludes the manager). */
export async function collectReportSubtreeEmployeeIds(
  db: Context["db"],
  orgId: string,
  managerEmployeeId: string,
): Promise<string[]> {
  const collected = new Set<string>();
  let frontier: string[] = [managerEmployeeId];
  for (let depth = 0; depth < 25 && frontier.length > 0; depth++) {
    const children = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.orgId, orgId), inArray(employees.managerId, frontier)));
    const next: string[] = [];
    for (const c of children) {
      if (!collected.has(c.id)) {
        collected.add(c.id);
        next.push(c.id);
      }
    }
    frontier = next;
  }
  return [...collected];
}
