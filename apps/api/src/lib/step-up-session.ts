import { getRedis } from "./redis";

const PREFIX = "stepup:";
/** Must match client-facing `verifyStepUp` window. */
const TTL_SEC = 15 * 60;

function key(sessionId: string): string {
  return `${PREFIX}${sessionId}`;
}

/**
 * Marks the current session token (hash) as step-up verified until Redis TTL expires.
 */
export async function setSessionStepUpVerified(sessionId: string): Promise<void> {
  const redis = getRedis();
  const untilMs = Date.now() + TTL_SEC * 1000;
  await redis.set(key(sessionId), String(untilMs), "EX", TTL_SEC);
}

export async function isSessionStepUpValid(sessionId: string): Promise<boolean> {
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

export async function clearSessionStepUp(sessionId: string): Promise<void> {
  try {
    await getRedis().del(key(sessionId));
  } catch {
    /* non-fatal */
  }
}
