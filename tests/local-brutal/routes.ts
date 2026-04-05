/**
 * Every in-app URL variant we want to hammer on localhost.
 * Static list + common ?tab= deep links (tabs that are URL-driven).
 */
import { ALL_ROUTES } from "../full-qa/helpers";

const TAB_ROUTES = [
  "/app/catalog?tab=my-requests",
  "/app/catalog?tab=admin",
  "/app/recruitment?tab=requisitions",
  "/app/recruitment?tab=pipeline",
  "/app/recruitment?tab=candidates",
  "/app/recruitment?tab=interviews",
  "/app/recruitment?tab=offers",
  "/app/secretarial?tab=overview",
  "/app/secretarial?tab=board",
  "/app/secretarial?tab=filings",
  "/app/secretarial?tab=share",
  "/app/secretarial?tab=registers",
  "/app/secretarial?tab=calendar",
];

const EXTRA_STATIC = ["/app/workflows/new", "/app"];

/** Deduped, sorted paths (paths only; baseURL from Playwright config). */
export const BRUTAL_ROUTES = [...new Set([...ALL_ROUTES, ...TAB_ROUTES, ...EXTRA_STATIC])].sort();
