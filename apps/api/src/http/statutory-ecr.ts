/**
 * Authenticated download of the EPFO ECR text file.
 *
 * The product prepares statutory returns; it does not file them. This is the
 * hand-off point: the customer downloads the `#~#` body and uploads it to the
 * EPFO employer portal themselves, then records the acknowledgement against
 * the submission. The body is regenerated from the payroll run on every
 * request, so a download is always current rather than a stored snapshot.
 *
 * Browser opens `/api/statutory/ecr?month=4&year=2026`; the Next.js proxy at
 * apps/web/src/app/api/statutory/ecr/route.ts forwards to this Fastify route.
 */
import type { FastifyInstance } from "fastify";
import { createContext } from "../middleware/auth";
import { checkDbUserPermission } from "../lib/rbac-db";
import { buildEcrBodyForPeriod, ecrFileName, EcrBuildError } from "../lib/india/ecr-build";

export function registerStatutoryEcrRoute(fastify: FastifyInstance): void {
  fastify.get<{ Querystring: { month?: string; year?: string; force?: string } }>(
    "/statutory/ecr",
    async (req, reply) => {
      const ctx = await createContext(req);
      if (!ctx.user?.id || !ctx.orgId) {
        return reply.status(401).send("Unauthorized");
      }

      // Same gate the tRPC layer applies to payroll reads, so the download
      // cannot be used to sidestep the permission matrix.
      const role = String((ctx.user as { role?: string }).role ?? "");
      const matrixRole = (ctx.user as { matrixRole?: string | null }).matrixRole;
      const customPermissions = (ctx.user as { customPermissions?: unknown }).customPermissions;
      if (!checkDbUserPermission(role, "payroll", "read", matrixRole as never, customPermissions as never)) {
        return reply.status(403).send("Permission denied: payroll.read");
      }

      const month = Number(req.query.month);
      const year = Number(req.query.year);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return reply.status(400).send("Invalid month (expected 1-12)");
      }
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return reply.status(400).send("Invalid year");
      }

      let built: Awaited<ReturnType<typeof buildEcrBodyForPeriod>>;
      try {
        built = await buildEcrBodyForPeriod(ctx.db, ctx.orgId, month, year);
      } catch (err) {
        if (err instanceof EcrBuildError) {
          // These messages name the field to fix and are safe to show verbatim.
          return reply.status(400).send(err.message);
        }
        req.log.error({ err }, "[statutory-ecr] build failed");
        return reply.status(500).send("Could not build the ECR file");
      }

      // EPFO rejects an upload outright when a member has no UAN or an
      // incomplete PF KYC. Blocking the download is kinder than letting the
      // customer discover it on the portal — but `force=1` still lets them
      // take the file for inspection.
      if (built.blockers.length > 0 && req.query.force !== "1") {
        const detail = built.blockers
          .map((b) => `${b.employeeCode || b.employeeId}: ${b.reason}`)
          .join("\n");
        return reply
          .status(409)
          .header("content-type", "text/plain; charset=utf-8")
          .send(
            `EPFO would reject this upload for ${built.blockers.length} employee(s). ` +
              `Fix these, or re-request with force=1 to download anyway:\n\n${detail}`,
          );
      }

      return reply
        .status(200)
        .header("content-type", "text/plain; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="${ecrFileName(built.establishmentId, month, year)}"`,
        )
        .header("cache-control", "private, no-store")
        .send(built.ecrBody);
    },
  );
}
