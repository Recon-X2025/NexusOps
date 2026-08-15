import { describe, it, expect } from "vitest";
import {
  assertSeedAllowed,
  ProductionSeedRefusedError,
  ALLOW_PRODUCTION_SEED_ENV,
} from "../seed-guard";

/**
 * The seed provisions admin@coheron.com / demo1234! as `owner` and resets the
 * password of that user when the org already exists. Seven production tenants
 * onboard within days, and the production deploy script calls a seed inside the
 * api container — so the refusal is the safety property under test here.
 */
describe("seed guard", () => {
  it("refuses to seed when NODE_ENV=production", () => {
    expect(() => assertSeedAllowed("db:seed", { NODE_ENV: "production" })).toThrow(
      ProductionSeedRefusedError,
    );
  });

  it("names the seed and the override in the refusal message", () => {
    expect(() => assertSeedAllowed("db:seed:modules", { NODE_ENV: "production" })).toThrow(
      /db:seed:modules/,
    );
    expect(() => assertSeedAllowed("db:seed:smb", { NODE_ENV: "production" })).toThrow(
      new RegExp(ALLOW_PRODUCTION_SEED_ENV),
    );
  });

  it("allows the seed in production only with an explicit override", () => {
    expect(() =>
      assertSeedAllowed("db:seed", {
        NODE_ENV: "production",
        [ALLOW_PRODUCTION_SEED_ENV]: "true",
      }),
    ).not.toThrow();
  });

  it("does not accept a non-'true' override value", () => {
    for (const value of ["1", "yes", "TRUE", ""]) {
      expect(() =>
        assertSeedAllowed("db:seed", {
          NODE_ENV: "production",
          [ALLOW_PRODUCTION_SEED_ENV]: value,
        }),
      ).toThrow(ProductionSeedRefusedError);
    }
  });

  it("permits development and test environments unchanged", () => {
    expect(() => assertSeedAllowed("db:seed", { NODE_ENV: "development" })).not.toThrow();
    expect(() => assertSeedAllowed("db:seed", { NODE_ENV: "test" })).not.toThrow();
    expect(() => assertSeedAllowed("db:seed", {})).not.toThrow();
  });
});
