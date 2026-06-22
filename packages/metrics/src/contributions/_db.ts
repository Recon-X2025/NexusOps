import type { MetricResolveCtx } from "../types";

/** Drizzle client from API context — typed loosely so this package does not import DB schema types into `.d.ts` builds. */
export function dbOf(ctx: MetricResolveCtx): any {
  return ctx.services.db;
}
