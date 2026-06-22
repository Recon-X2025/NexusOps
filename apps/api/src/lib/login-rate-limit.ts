import { TRPCError } from "@trpc/server";
import { getRedis } from "./redis";

const WINDOW_SEC = 5 * 60; // 5 minutes
const MAX_FAILED_EMAIL = 10;
const MAX_FAILED_IP = 50;

// ── Pre-bcrypt total-attempt gate ─────────────────────────────────────────────
//
// This limit fires BEFORE bcrypt to cap the number of login attempts that ever
// reach the CPU-bound hash phase.  It limits ALL login attempts (not just
// failed ones) so that an attacker who happens to know the correct password
// cannot use rapid cycling to saturate the bcrypt semaphore.
//
// Limits (configurable via env):
//   LOGIN_RATE_PER_MIN   max total attempts per unique email per minute (default 5)
//
// The key is separate from the failed-login key so clearing failed attempts on
// success does not reset the concurrency gate.

const RATE_WINDOW_SEC = 60; // 1 minute
const MAX_ATTEMPTS_PER_MIN = parseInt(process.env["LOGIN_RATE_PER_MIN"] ?? "5", 10);

function loginRateKey(email: string) {
  return `login_rate:${email.trim().toLowerCase()}`;
}

/**
 * Increments the per-email total-attempt counter and throws TOO_MANY_REQUESTS
 * if the caller has exceeded MAX_ATTEMPTS_PER_MIN within the past 60 seconds.
 * Must be called BEFORE bcrypt to be effective.
 */
export async function checkLoginRateLimit(email: string): Promise<void> {
  const redis = getRedis();
  const key   = loginRateKey(email);

  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, RATE_WINDOW_SEC, "NX"); // only set TTL on first write

  const results = await pipeline.exec();
  const count   = results?.[0]?.[1] as number ?? 0;

  if (count > MAX_ATTEMPTS_PER_MIN) {
    throw new TRPCError({
      code:    "TOO_MANY_REQUESTS",
      message: "Too many login attempts. Please wait a minute and try again.",
    });
  }
}

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
