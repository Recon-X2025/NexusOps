import { TRPCError } from "@trpc/server";
import { getRedis } from "./redis";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 60;

/**
 * Redis INCR + EXPIRE rate limiter: 60 requests per user per endpoint per minute.
 * Falls open if Redis is unavailable — never blocks legitimate traffic due to infra failure.
 */
export async function rateLimit(
  userId: string | undefined,
  orgId: string | undefined,
  endpoint: string,
): Promise<void> {
  const subject = userId ?? orgId ?? "anon";
  const key = `rate:${subject}:${endpoint}`;
  try {
    const redis = getRedis();
    const count = await redis.incr(key);
    if (count === 1) {
      // First request in this window — set the expiry
      await redis.expire(key, WINDOW_SECONDS);
    }
    if (count > MAX_REQUESTS) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests, try again later",
      });
    }
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    // Redis unavailable — fail open so outages don't block users
  }
}
