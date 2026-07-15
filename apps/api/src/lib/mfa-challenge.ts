import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { getRedis } from "./redis";

/**
 * Short-lived MFA challenge tokens. Issued when an MFA-enrolled user's password
 * succeeds; the client must exchange the token for a real session via
 * `auth.verifyMfa`. No usable session exists until TOTP passes.
 *
 * The raw token is returned to the client; Redis stores it only as a SHA-256
 * hash (like session tokens), mapping to the userId. Single-use: consumed on
 * read.
 */

const PREFIX = "mfachal:";
const TTL_SEC = 5 * 60;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function key(tokenHash: string): string {
  return `${PREFIX}${tokenHash}`;
}

/** Issue a challenge token bound to a user; returns the raw token for the client. */
export async function issueMfaChallenge(userId: string): Promise<string> {
  const token = nanoid(32);
  await getRedis().set(key(hashToken(token)), userId, "EX", TTL_SEC);
  return token;
}

/**
 * Consume a challenge token, returning the bound userId (or null if
 * invalid/expired/already-used). Single-use: the key is deleted on read.
 */
export async function consumeMfaChallenge(token: string): Promise<string | null> {
  try {
    const redis = getRedis();
    const k = key(hashToken(token));
    const userId = await redis.get(k);
    if (!userId) return null;
    await redis.del(k);
    return userId;
  } catch {
    return null;
  }
}
