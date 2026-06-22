import { TRPCError } from "@trpc/server";

/**
 * Valid incident/ticket status lifecycle transitions (ITSM core path).
 * Spec: incidents — open → in_progress → resolved → closed
 */
export const TICKET_LIFECYCLE: Record<string, string[]> = {
  open: ["in_progress", "pending", "resolved", "closed"],
  in_progress: ["pending", "resolved", "open", "closed"],
  pending: ["open", "in_progress", "resolved", "closed"],
  resolved: ["closed", "open", "in_progress", "pending"],
  closed: ["open"],
};

export function assertTicketTransition(fromCategory: string, toCategory: string) {
  const allowed = TICKET_LIFECYCLE[fromCategory];
  if (!allowed) return;
  if (!allowed.includes(toCategory)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid status transition: ${fromCategory} → ${toCategory}. Allowed: ${allowed.join(", ")}`,
    });
  }
}
