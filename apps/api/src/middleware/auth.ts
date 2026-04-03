import type { FastifyRequest } from "fastify";
import { createHash } from "crypto";
import { getDb, sessions, users, organizations, eq, and, sql } from "@nexusops/db";
import type { Context } from "../lib/trpc";
import { getRedis } from "../lib/redis";

function withoutPasswordHash<T extends { passwordHash?: string | null }>(row: T | null | undefined) {
  if (row == null) return null;
  const { passwordHash: _p, ...rest } = row;
  return rest as Omit<T, "passwordHash">;
}

/** SHA-256 hash a plaintext session token for safe DB storage/lookup. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * L1 TTL for valid sessions — 5 minutes, matching the Redis L2 layer.
 * At 10 K concurrent sessions the previous 30 s TTL caused mass L1 misses
 * ~30 s into the run, flooding Redis/DB simultaneously.
 *
 * Exported so index.ts can include this value in the startup config banner.
 */
export const SESSION_CACHE_TTL_MS = 300_000; // 5 min

/**
 * L1 TTL for null (invalid / already-expired) sessions.
 * Kept short so that a user who just created a fresh session token does not
 * have to wait the full window to become authenticated.
 *
 * Exported so index.ts can include this value in the startup config banner.
 */
export const NULL_SESSION_CACHE_TTL_MS = 30_000; // 30 s

/**
 * Redis TTL in seconds (5 minutes).
 * Exported so index.ts can include this value in the startup config banner.
 */
export const REDIS_TTL_SECS = 300;

// ── L1: In-process session cache ─────────────────────────────────────────────

interface SessionCacheEntry {
  user: Record<string, unknown> | null;
  org:  Record<string, unknown> | null;
  /** Absolute epoch ms beyond which this entry must not be served. */
  expiresAt: number;
}

const sessionCache = new Map<string, SessionCacheEntry>();

// Evict expired entries every minute so memory stays bounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of sessionCache) {
    if (entry.expiresAt <= now) sessionCache.delete(key);
  }
}, 60_000).unref();

/** Returns the L1 entry if still valid, otherwise null. */
function getL1(tokenHash: string): SessionCacheEntry | null {
  const entry = sessionCache.get(tokenHash);
  if (entry && entry.expiresAt > Date.now()) return entry;
  return null;
}

/**
 * Writes to L1, capping the TTL at the session's own expiry so a cached entry
 * can never outlive the real session.  Null sessions use the shorter TTL.
 */
function setL1(
  tokenHash: string,
  user: Context["user"],
  org: Record<string, unknown> | null,
  sessionExpiresAt: string | null,
): void {
  const now = Date.now();

  if (sessionExpiresAt) {
    const remainingMs = new Date(sessionExpiresAt).getTime() - now;
    if (remainingMs <= 0) {
      // Session already expired — cache as null with the short TTL.
      sessionCache.set(tokenHash, { user: null, org: null, expiresAt: now + NULL_SESSION_CACHE_TTL_MS });
      return;
    }
    const ttl = user
      ? Math.min(SESSION_CACHE_TTL_MS, remainingMs)
      : NULL_SESSION_CACHE_TTL_MS;
    sessionCache.set(tokenHash, { user, org, expiresAt: now + ttl });
    return;
  }

  // No expiry info available (null session or missing field) — use the
  // appropriate constant TTL.
  const ttl = user ? SESSION_CACHE_TTL_MS : NULL_SESSION_CACHE_TTL_MS;
  sessionCache.set(tokenHash, { user, org, expiresAt: now + ttl });
}

// ── L2: Redis session cache ───────────────────────────────────────────────────

interface RedisSessionPayload {
  user: Record<string, unknown>;
  org:  Record<string, unknown>;
  sessionExpiresAt: string; // ISO string — validated before serving
}

async function getRedisSession(tokenHash: string): Promise<RedisSessionPayload | null> {
  try {
    const raw = await getRedis().get(`session:${tokenHash}`);
    if (!raw) return null;
    return JSON.parse(raw) as RedisSessionPayload;
  } catch {
    return null;
  }
}

async function setRedisSession(tokenHash: string, payload: RedisSessionPayload): Promise<void> {
  try {
    await getRedis().setex(`session:${tokenHash}`, REDIS_TTL_SECS, JSON.stringify(payload));
  } catch {
    // non-fatal
  }
}

// ── Cache invalidation ────────────────────────────────────────────────────────

/**
 * Call this when a session is explicitly logged out or revoked so caches do
 * not continue serving a stale authenticated context.
 */
export async function invalidateSessionCache(tokenHash: string): Promise<void> {
  sessionCache.delete(tokenHash);
  try {
    await getRedis().del(`session:${tokenHash}`);
  } catch {
    // non-fatal
  }
}

// ── L1½: Request coalescing ───────────────────────────────────────────────────
//
// Problem: at 10 K concurrent sessions, hundreds of requests for the same
// token can miss L1 at the exact same millisecond (process start, post-eviction
// burst, etc.).  Without coalescing they ALL hit Redis and/or DB simultaneously,
// creating a thundering-herd that saturates the connection pool.
//
// Fix: store one Promise per in-flight token resolution.  Any request that
// arrives while a lookup is already running just awaits the same Promise — only
// a single Redis + DB round-trip happens regardless of concurrency.

type ResolvedSession = {
  user: Context["user"];
  org:  Record<string, unknown> | null;
  /** ISO string of session expiry from DB; null for invalid sessions. */
  sessionExpiresAt: string | null;
};

/** Active resolution promises keyed by tokenHash. */
const inflight = new Map<string, Promise<ResolvedSession>>();

/**
 * Clears ALL entries from the L1 in-process session cache and the request-
 * coalescing inflight map.
 *
 * Safe to call at any time — subsequent callers fall through to Redis /
 * PostgreSQL for their next session lookup, then re-populate L1.
 *
 * Called by the API startup sequence to ensure a clean slate before a stress
 * test or after a hot-reload event.
 *
 * Returns the number of L1 entries that were evicted.
 */
export function clearSessionCache(): number {
  const evicted = sessionCache.size;
  sessionCache.clear();
  inflight.clear();
  return evicted;
}

/**
 * Performs the L2 (Redis) → L3 (PostgreSQL) lookup for a session token.
 * Strictly READ-ONLY: no writes, no SELECT FOR UPDATE, no lastActiveAt updates.
 */
async function fetchSession(
  db: ReturnType<typeof getDb>,
  tokenHash: string,
): Promise<ResolvedSession> {
  // L2: Redis
  const redisEntry = await getRedisSession(tokenHash);
  if (redisEntry) {
    if (new Date(redisEntry.sessionExpiresAt) > new Date()) {
      return {
        user: redisEntry.user,
        org:  redisEntry.org,
        sessionExpiresAt: redisEntry.sessionExpiresAt,
      };
    }
    // Redis entry is stale (session expired while Redis TTL was still live).
    invalidateSessionCache(tokenHash).catch(() => {});
    return { user: null, org: null, sessionExpiresAt: null };
  }

  // L3: PostgreSQL (READ-ONLY — no UPDATE, no SELECT FOR UPDATE)
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(
      eq(sessions.id, tokenHash),
      sql`${sessions.expiresAt} > NOW()`,
    ))
    .limit(1);

  if (!session) return { user: null, org: null, sessionExpiresAt: null };

  const [rawUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const user = withoutPasswordHash(rawUser);
  let org: Record<string, unknown> | null = null;

  if (user) {
    const [rawOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, user.orgId as string))
      .limit(1);
    org = rawOrg ?? null;
  }

  const sessionExpiresAt =
    session.expiresAt instanceof Date
      ? session.expiresAt.toISOString()
      : String(session.expiresAt);

  // Back-fill Redis so the next L1 eviction falls through to Redis, not DB.
  if (user && org) {
    setRedisSession(tokenHash, {
      user: user as Record<string, unknown>,
      org,
      sessionExpiresAt,
    }).catch(() => {});
  }

  return { user, org, sessionExpiresAt };
}

// ── Context factory ───────────────────────────────────────────────────────────

/**
 * Resolves tRPC context for every request.
 *
 * Session lookup order (fastest → slowest):
 *   L1   In-process Map  (0 I/O, 5 min TTL, capped at session expiry)
 *   L1½  Coalescing      if another request is already resolving this token,
 *                        await its Promise — no extra I/O at all
 *   L2   Redis           (< 1 ms, 5 min TTL)
 *   L3   PostgreSQL      (first miss per token only; strictly READ-ONLY)
 *
 * IMPORTANT: This function is strictly READ-ONLY with respect to the sessions
 * table — no UPDATEs, no SELECT FOR UPDATE, no lastActiveAt writes.
 */
export async function createContext(req: FastifyRequest): Promise<Context> {
  const db = getDb();
  let user: Context["user"] = null;
  let org: Record<string, unknown> | null = null;
  let sessionId: string | null = null;

  const rawHeaders = req.headers as Record<string, string | string[] | undefined>;

  const authHeader =
    (rawHeaders["authorization"] as string | undefined) ||
    (rawHeaders["Authorization"] as string | undefined) ||
    (rawHeaders["AUTHORIZATION"] as string | undefined) ||
    // Accept proxied auth header (some reverse-proxy setups forward under this key)
    (rawHeaders["x-forwarded-authorization"] as string | undefined) ||
    null;

  const cookieHeader = (rawHeaders["cookie"] as string | undefined) || null;

  let sessionCookie: string | null = null;
  if (cookieHeader) {
    const match = cookieHeader.match(/nexusops_session=([^;]+)/);
    sessionCookie = match ? match[1]!.trim() : null;
  }

  const bearerToken =
    authHeader && authHeader.trimStart().startsWith("Bearer ")
      ? authHeader.trimStart().slice(7).trim()
      : null;

  const token = bearerToken || sessionCookie || null;

  // X-Idempotency-Key header — passed through to procedures that need it
  const idempotencyKeyHeader = rawHeaders["x-idempotency-key"] as string | undefined;
  const headerIdempotencyKey =
    typeof idempotencyKeyHeader === "string" && idempotencyKeyHeader.length > 0 && idempotencyKeyHeader.length <= 128
      ? idempotencyKeyHeader
      : null;

  if (!token) {
    return {
      db, user: null, org: null, orgId: null, sessionId: null,
      requestId: (req.id as string) ?? null,
      ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null,
      idempotencyKey: headerIdempotencyKey,
    };
  }

  // ── API key path ─────────────────────────────────────────────────────────
  if (token.startsWith("nxo_")) {
    const keyHash = createHash("sha256").update(token).digest("hex");
    const { apiKeys } = await import("@nexusops/db");
    const [apiKey] = await db
      .select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.keyHash, keyHash),
        sql`(${apiKeys.expiresAt} IS NULL OR ${apiKeys.expiresAt} > NOW())`,
      ))
      .limit(1);

    if (apiKey) {
      const [u] = await db.select().from(users).where(eq(users.id, apiKey.createdById)).limit(1);
      user = withoutPasswordHash(u);
      if (user) {
        const [rawApiOrg] = await db.select().from(organizations).where(eq(organizations.id, apiKey.orgId)).limit(1);
        org = (rawApiOrg ?? null) as Record<string, unknown> | null;
      }
    }

    return {
      db, user: user ?? null, org: org ?? null, orgId: (org?.id as string | undefined) ?? null, sessionId: null,
      requestId: (req.id as string) ?? null,
      ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null,
      idempotencyKey: headerIdempotencyKey,
    };
  }

  // ── Session token path ───────────────────────────────────────────────────
  const tokenHash = hashSessionToken(token);
  sessionId = tokenHash;

  // L1: In-process cache (hot path — zero I/O)
  const l1 = getL1(tokenHash);
  if (l1) {
    return {
      db, user: l1.user, org: l1.org, orgId: (l1.org?.id as string | undefined) ?? null, sessionId,
      requestId: (req.id as string) ?? null,
      ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null,
      idempotencyKey: headerIdempotencyKey,
    };
  }

  // L1½ + L2 + L3: Coalesced lookup.
  // If a concurrent request is already resolving this token, await its Promise
  // instead of spawning a parallel DB query.
  let pending = inflight.get(tokenHash);
  if (!pending) {
    pending = fetchSession(db, tokenHash).finally(() => {
      inflight.delete(tokenHash);
    });
    inflight.set(tokenHash, pending);
  }

  const resolved = await pending;
  user = resolved.user;
  org  = resolved.org;

  // Populate L1 — all co-waiters write the same value; idempotent.
  setL1(tokenHash, user, org, resolved.sessionExpiresAt);

  return {
    db,
    user:           user ?? null,
    org:            org  ?? null,
    orgId:          (org?.id as string | undefined) ?? null,
    sessionId,
    requestId:      (req.id as string) ?? null,
    ipAddress:      req.ip ?? null,
    userAgent:      req.headers["user-agent"] ?? null,
    idempotencyKey: headerIdempotencyKey,
  };
}
