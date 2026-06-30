/**
 * India statutory identifier validators.
 * Canonical implementation now lives in `@coheronconnect/payroll-math`.
 * This module re-exports it to preserve existing `apps/api` import paths
 * (including dynamic `import("../lib/india/validators.js")` call sites).
 */
export * from "@coheronconnect/payroll-math";
