/**
 * @nexusops/validators — Package Entry Point
 *
 * Re-exports all domain validators from a single import:
 *
 *   import { CreateAccountSchema, DealStageEnum } from "@nexusops/validators";
 *   import { CreateCoaAccountSchema } from "@nexusops/validators/accounting";
 *   import { CreateEmployeeSchema } from "@nexusops/validators/hr";
 */

// CRM
export * from "./crm";

// Finance / Accounting
export * from "./accounting";

// Human Resources
export * from "./hr";

// Re-export zod for convenience (avoids duplicate zod versions in consumers)
export { z } from "zod";
