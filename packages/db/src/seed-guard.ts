/**
 * Production seed guard.
 *
 * The base seed provisions `admin@coheron.com` with role `owner` and the
 * password `demo1234!`, and — when the org slug already exists — it *updates the
 * existing users' passwords* rather than skipping them (see `seed.ts`). Run
 * against a tenant database that would reset a real owner account to a password
 * published in this repository.
 *
 * Nothing stopped that: none of the three seed entrypoints checked NODE_ENV or
 * the database host, and `scripts/vultr-remote-deploy.sh` invokes a seed inside
 * the production api container on every deploy.
 *
 * So every seed entrypoint asserts this first. The refusal is deliberate and
 * loud; the only way past it is an explicit `ALLOW_PRODUCTION_SEED=true`, which
 * exists so a genuine first-run provisioning can still be performed by hand.
 *
 * Mirrors the fail-fast shape of the `PII_HASH_PEPPER` boot guard in
 * `apps/api/src/index.ts:197-209`: assert throws, the entrypoint exits 1.
 */

export const ALLOW_PRODUCTION_SEED_ENV = "ALLOW_PRODUCTION_SEED";

export class ProductionSeedRefusedError extends Error {
  constructor(seedName: string) {
    super(
      `Refusing to run "${seedName}" with NODE_ENV=production.\n` +
        "This seed creates or resets the demo owner account (admin@coheron.com / demo1234!) " +
        "and would overwrite real tenant credentials.\n" +
        `If this is genuinely a first-run provisioning, re-run with ${ALLOW_PRODUCTION_SEED_ENV}=true.`,
    );
    this.name = "ProductionSeedRefusedError";
  }
}

/**
 * Throws when a seed is invoked in a production environment without an explicit
 * override. Pure and side-effect free so it can be unit tested; the entrypoints
 * turn the throw into `process.exit(1)`.
 */
export function assertSeedAllowed(
  seedName: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env["NODE_ENV"] !== "production") return;
  if (env[ALLOW_PRODUCTION_SEED_ENV] === "true") return;
  throw new ProductionSeedRefusedError(seedName);
}
