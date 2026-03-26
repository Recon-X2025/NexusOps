import { TRPCError } from "@trpc/server";
import { getRedis } from "./redis";

const WINDOW_SEC = 5 * 60; // 5 minutes
const MAX_FAILED_EMAIL = 10;
const MAX_FAILED_IP = 50;

function emailKey(email: string) {
  return `login_attempts:${email.trim().toLowerCase()}`;
}
function ipKey(ip: string) {
  return `login_attempts_ip:${ip}`;
}

/**
 * Record a failed login attempt. Throws TOO_MANY_REQUESTS when limit exceeded.
 * Keys are stored in Redis with a TTL so they reset automatically.
 */
export async function recordFailedLogin(email: string, ip?: string | null): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();

  const ek = emailKey(email);
  pipeline.incr(ek);
  pipeline.expire(ek, WINDOW_SEC);

  if (ip) {
    const ik = ipKey(ip);
    pipeline.incr(ik);
    pipeline.expire(ik, WINDOW_SEC);
  }

  const results = await pipeline.exec();
  const emailCount = results?.[0]?.[1] as number ?? 0;
  const ipCount = ip ? (results?.[2]?.[1] as number ?? 0) : 0;

  if (emailCount > MAX_FAILED_EMAIL) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many login attempts. Try again in a few minutes.",
    });
  }

  if (ip && ipCount > MAX_FAILED_IP) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many login attempts from this IP. Try again later.",
    });
  }
}

export async function clearLoginAttempts(email: string): Promise<void> {
  const redis = getRedis();
  await redis.del(emailKey(email));
}
