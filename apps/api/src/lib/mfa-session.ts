import { getRedis } from "./redis";

/**
 * Marks a session (token hash) as MFA-verified. Set once at login after a valid
 * TOTP / backup-code exchange. Mirrors step-up-session.ts but with a TTL that
 * covers the full session lifetime (MFA was proven at login, not per-action).
 */

const PREFIX = "mfaok:";
/** Covers the longest ("remember me") session: 30 days. */
const TTL_SEC = 30 * 24 * 60 * 60;

function key(sessionId: string): string {
  return `${PREFIX}${sessionId}`;
}

export async function setSessionMfaVerified(sessionId: string): Promise<void> {
  const redis = getRedis();
  const untilMs = Date.now() + TTL_SEC * 1000;
  await redis.set(key(sessionId), String(untilMs), "EX", TTL_SEC);
}

export async function isSessionMfaValid(sessionId: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const v = await redis.get(key(sessionId));
    if (!v) return false;
    const untilMs = parseInt(v, 10);
    return Number.isFinite(untilMs) && untilMs > Date.now();
  } catch {
    return false;
  }
}

export async function clearSessionMfa(sessionId: string): Promise<void> {
  try {
    await getRedis().del(key(sessionId));
  } catch {
    /* non-fatal */
  }
}
