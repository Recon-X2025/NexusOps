/**
 * Guards the MAC (platform super-admin / Mission-and-Admin-Control) surface
 * (Phase 1 / Item 5).
 *
 * `mac.*` performs CROSS-TENANT privileged operations (org create/suspend,
 * session revocation, operator impersonation, billing, feature flags) and must
 * never be exposed without authentication. Every MAC procedure must use
 * `macProcedure` (which verifies a `MAC_JWT_SECRET`-signed operator token) — the
 * ONLY allowed `publicProcedure` is `mac.login`, which issues that token and
 * therefore cannot require it.
 *
 * This test fails if any new `publicProcedure` is added to mac.ts, preventing a
 * regression of the unauthenticated-admin vulnerability that this item fixed.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAC_FILE = join(__dirname, "../routers/mac.ts");

/** Endpoints permitted to remain `publicProcedure` (no operator token yet). */
const ALLOWED_PUBLIC = new Set<string>(["login"]);

describe("Item 5: the MAC super-admin surface is authenticated", () => {
  const raw = readFileSync(MAC_FILE, "utf8");

  it("only `mac.login` uses publicProcedure; all others use macProcedure", () => {
    // Match `<name>: publicProcedure` router entries (ignores the import line,
    // which is `{ ..., publicProcedure, ... }` and has no leading `name:`).
    const entryRe = /(\w+)\s*:\s*publicProcedure\b/g;
    const offenders: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(raw)) !== null) {
      const name = m[1]!;
      if (!ALLOWED_PUBLIC.has(name)) offenders.push(name);
    }

    if (offenders.length > 0) {
      throw new Error(
        `MAC procedure(s) using publicProcedure (must use macProcedure): ` +
          `${offenders.join(", ")}.\n` +
          `mac.* performs cross-tenant super-admin actions and must require a ` +
          `MAC_JWT_SECRET-signed operator token. Only \`login\` may be public.`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it("references macProcedure (the gate is actually wired in)", () => {
    expect(raw).toMatch(/\bmacProcedure\b/);
  });
});
