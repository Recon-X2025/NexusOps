import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, surveys, surveyInvites, surveyResponses, tickets, users } from "@nexusops/db";

function sha256(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function registerPublicSurveyRoutes(app: FastifyInstance) {
  // GET invite metadata (used by public Next.js page)
  app.get<{
    Params: { token: string };
  }>("/public/surveys/:token", async (req, reply) => {
    const db = getDb();
    const tokenHash = sha256(req.params.token);

    const [invite] = await db
      .select()
      .from(surveyInvites)
      .where(eq(surveyInvites.tokenHash, tokenHash))
      .limit(1);

    if (!invite) return reply.status(404).send({ error: "not_found" });
    if (invite.expiresAt.getTime() < Date.now()) return reply.status(410).send({ error: "expired" });
    if (invite.status !== "sent") return reply.status(409).send({ error: "already_used" });

    const [survey] = await db
      .select({ id: surveys.id, title: surveys.title, description: surveys.description, type: surveys.type })
      .from(surveys)
      .where(and(eq(surveys.id, invite.surveyId), eq(surveys.orgId, invite.orgId)))
      .limit(1);

    if (!survey) return reply.status(404).send({ error: "survey_not_found" });

    // Optional ticket context
    let ticketNumber: string | null = null;
    let ticketTitle: string | null = null;
    if (invite.ticketId) {
      const [t] = await db
        .select({ number: tickets.number, title: tickets.title })
        .from(tickets)
        .where(and(eq(tickets.id, invite.ticketId), eq(tickets.orgId, invite.orgId)))
        .limit(1);
      ticketNumber = t?.number ?? null;
      ticketTitle = t?.title ?? null;
    }

    return {
      survey,
      ticket: invite.ticketId ? { id: invite.ticketId, number: ticketNumber, title: ticketTitle } : null,
      expiresAt: invite.expiresAt.toISOString(),
    };
  });

  // POST response submission (public; token-based)
  app.post<{
    Params: { token: string };
    Body: { score: number; comments?: string };
  }>("/public/surveys/:token/submit", async (req, reply) => {
    const db = getDb();
    const tokenHash = sha256(req.params.token);

    const score = Number((req.body as any)?.score);
    const comments = typeof (req.body as any)?.comments === "string" ? (req.body as any).comments : undefined;
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      return reply.status(400).send({ error: "invalid_score" });
    }

    const [invite] = await db
      .select()
      .from(surveyInvites)
      .where(eq(surveyInvites.tokenHash, tokenHash))
      .limit(1);

    if (!invite) return reply.status(404).send({ error: "not_found" });
    if (invite.expiresAt.getTime() < Date.now()) return reply.status(410).send({ error: "expired" });
    if (invite.status !== "sent") return reply.status(409).send({ error: "already_used" });

    await db.transaction(async (tx) => {
      await tx.insert(surveyResponses).values({
        surveyId: invite.surveyId,
        respondentId: invite.requesterId ?? null,
        score: String(score),
        comments,
        answers: {},
      });
      await tx
        .update(surveyInvites)
        .set({ status: "submitted", submittedAt: new Date() })
        .where(eq(surveyInvites.id, invite.id));
    });

    return { ok: true };
  });
}

