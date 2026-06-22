import { router, permissionProcedure } from "../lib/trpc";
import { z } from "zod";
import { auditLogs } from "@coheronconnect/db";
import { ALL_FUNCTION_KEYS, type RoleViewKey, type CommandCenterPayload } from "@coheronconnect/metrics";
import { getRedis } from "../lib/redis";
import {
  buildCommandCenterPayload,
  buildHubPayload,
  buildDeterministicNarrative,
  narrativePromptForAi,
} from "../services/command-center-payload";
import { generateCommandCenterNarrative } from "../services/ai";
import { sanitizeForAudit } from "../lib/audit-sanitize";

const CACHE_TTL_SEC = 30;

/** Single Command Center presentation: full-organization executive rollup. */
const DEFAULT_COMMAND_CENTER_ROLE: RoleViewKey = "ceo";

const RoleViewKeyZ = z.enum(["ceo", "coo", "cio", "cfo", "chro", "ciso", "cs", "gc"]);

const FunctionKeyZ = z.enum(
  ALL_FUNCTION_KEYS as unknown as [string, ...string[]],
);

const timeRangeZ = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
  granularity: z.enum(["day", "week", "month"]),
});

const REDIS_GET_TIMEOUT_MS = 1500;

async function getCachedCommandCenter<T>(key: string, fn: () => Promise<T>): Promise<T> {
  try {
    const redis = getRedis();
    let cached: string | null = null;
    try {
      cached = await Promise.race([
        redis.get(key),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("command_center_cache_redis_get_timeout")), REDIS_GET_TIMEOUT_MS),
        ),
      ]);
    } catch (e) {
      console.warn("[command-center] cache read skipped:", e);
    }
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        await redis.del(key).catch(() => {});
      }
    }
    const result = await fn();
    try {
      await redis.setex(key, CACHE_TTL_SEC, JSON.stringify(result));
    } catch {
      /* optional */
    }
    return result;
  } catch {
    return fn();
  }
}

export const commandCenterRouter = router({
  getView: permissionProcedure("command_center", "read")
    .input(
      z.object({
        range: timeRangeZ,
      }),
    )
    .query(async ({ ctx, input }) => {
      const u = ctx.user!;
      const org = ctx.org!;
      const activeRole = DEFAULT_COMMAND_CENTER_ROLE;

      const cacheKey = `commandCenter:v1:${org.id}:${activeRole}:${input.range.start.toISOString()}:${input.range.end.toISOString()}:${input.range.granularity}`;

      const payload = await getCachedCommandCenter(cacheKey, () =>
        buildCommandCenterPayload({
          role: activeRole,
          detectedRole: activeRole,
          canOverride: false,
          tenantId: org.id as string,
          userId: u.id as string,
          range: input.range,
          db: ctx.db,
        }),
      );

      void ctx.db
        .insert(auditLogs)
        .values({
          orgId: org.id as string,
          userId: u.id as string,
          action: "command_center.view",
          resourceType: "command_center",
          resourceId: activeRole,
          changes: sanitizeForAudit({
            role: activeRole,
            view: "default",
            range: {
              start: input.range.start.toISOString(),
              end: input.range.end.toISOString(),
              granularity: input.range.granularity,
            },
          }) as Record<string, unknown>,
          ipAddress: ctx.ipAddress ?? undefined,
          userAgent: ctx.userAgent ?? undefined,
        })
        .catch(() => {});

      return payload;
    }),

  /**
   * Hub-scoped Command Center view. Returns the same payload shape as
   * `getView` but built from a single FunctionKey's metric pool so each
   * hub Overview page renders bullets/trends/risks/heatmap that are
   * actually populated, instead of one or two cells filtered out of an
   * org-wide top-N list.
   */
  getHubView: permissionProcedure("command_center", "read")
    .input(
      z.object({
        functionKey: FunctionKeyZ,
        range: timeRangeZ,
      }),
    )
    .query(async ({ ctx, input }) => {
      const u = ctx.user!;
      const org = ctx.org!;

      const cacheKey = `commandCenter:hub:v1:${org.id}:${input.functionKey}:${input.range.start.toISOString()}:${input.range.end.toISOString()}:${input.range.granularity}`;

      const payload = await getCachedCommandCenter(cacheKey, () =>
        buildHubPayload({
          fn: input.functionKey as Parameters<typeof buildHubPayload>[0]["fn"],
          tenantId: org.id as string,
          userId: u.id as string,
          range: input.range,
          db: ctx.db,
        }),
      );

      void ctx.db
        .insert(auditLogs)
        .values({
          orgId: org.id as string,
          userId: u.id as string,
          action: "command_center.hub_view",
          resourceType: "command_center_hub",
          resourceId: input.functionKey,
          changes: sanitizeForAudit({
            functionKey: input.functionKey,
            range: {
              start: input.range.start.toISOString(),
              end: input.range.end.toISOString(),
              granularity: input.range.granularity,
            },
          }) as Record<string, unknown>,
          ipAddress: ctx.ipAddress ?? undefined,
          userAgent: ctx.userAgent ?? undefined,
        })
        .catch(() => {});

      return payload;
    }),

  generateNarrative: permissionProcedure("command_center", "read")
    .input(
      z.object({
        role: RoleViewKeyZ,
        payload: z.record(z.unknown()),
      }),
    )
    .mutation(async ({ input }) => {
      const payload = input.payload as unknown as CommandCenterPayload;
      const prompt = narrativePromptForAi({
        role: input.role,
        score: payload.score,
        scoreState: payload.scoreState,
        bullets: payload.bullets,
        attention: payload.attention,
      });
      const text = await generateCommandCenterNarrative(prompt);
      const finalText =
        text ??
        buildDeterministicNarrative(input.role, payload.score, payload.scoreState, payload.heatmap);
      return { text: finalText, attention: payload.attention };
    }),
});
