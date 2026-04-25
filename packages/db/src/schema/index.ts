export * from "./counters";
export * from "./auth";
export * from "./legal-entity";
export * from "./tickets";
export * from "./assignment";
export * from "./assets";
export * from "./workflows";
export * from "./hr";
export * from "./procurement";
export * from "./portal";
export * from "./integrations";
export * from "./inventory";
export * from "./work-orders";
// Phase 2 schemas
export * from "./changes";
export * from "./security";
export * from "./grc";
export * from "./financial";
export * from "./contracts";
export * from "./projects";
export * from "./crm";
export * from "./legal";
export * from "./facilities";
export * from "./devops";
export * from "./surveys";
export * from "./knowledge";
export * from "./approvals";
export * from "./notifications";
export * from "./walkup";
export * from "./apm";
export * from "./oncall";
// Phase 4 schemas
export * from "./expenses";
export * from "./performance";
export * from "./catalog";
// India compliance schemas
export * from "./india-compliance";
// Phase 3 schemas
export * from "./recruitment";
export * from "./secretarial";
// Phase 3 — Accounting foundation
export * from "./accounting";
// Phase 7 — Custom Fields Framework
export * from "./custom-fields";
// Business rules engine (admin automation)
export * from "./business-rules";
// Issuer / India legal programme (§3.9 spine)
export * from "./issuer-programme";

// Re-export drizzle operators used in routers.
// Single authoritative source — do NOT also export from packages/db/src/index.ts.
export {
  eq,
  and,
  or,
  not,
  desc,
  asc,
  sql,
  count,
  sum,
  avg,
  min,
  max,
  ne,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  exists,
  notExists,
  like,
  ilike,
  notLike,
  notIlike,
  between,
  lt,
  lte,
  gt,
  gte,
} from "drizzle-orm";
