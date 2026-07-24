import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDb, integrations, eq, and } from "@coheronconnect/db";
import { getIntegrationAdapter } from "../services/integrations/registry";
import { encryptIntegrationConfigEnvelope } from "../services/encryption";
import { randomUUID } from "node:crypto";

export async function registerIntegrationOAuthRoutes(fastify: FastifyInstance): Promise<void> {
  const redirectUriBase = process.env["API_URL"] ?? process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
  const appUrl = process.env["APP_URL"] ?? process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";

  fastify.get("/api/integrations/oauth/:provider/begin", async (req: FastifyRequest<{ Params: { provider: string }; Querystring: { orgId: string } }>, reply: FastifyReply) => {
    const { provider } = req.params;
    const { orgId } = req.query;
    if (!orgId) return reply.status(400).send("Missing orgId");

    const adapter = getIntegrationAdapter(provider);
    if (!adapter) return reply.status(400).send("Unknown provider");
    if (!adapter.beginOAuth) return reply.status(400).send("Provider does not support OAuth");

    const state = randomUUID();
    const redirectUri = `${redirectUriBase}/api/integrations/oauth/${provider}/callback`;

    try {
      const url = adapter.beginOAuth({ orgId, state, redirectUri });
      return reply.redirect(url);
    } catch (err) {
      fastify.log.error({ err }, "beginOAuth failed");
      return reply.redirect(`${appUrl}/app/settings/integrations?error=${encodeURIComponent((err as Error).message)}`);
    }
  });

  fastify.get("/api/integrations/oauth/:provider/callback", async (req: FastifyRequest<{ Params: { provider: string }; Querystring: { code: string; state: string; error?: string } }>, reply: FastifyReply) => {
    const { provider } = req.params;
    const { code, state, error } = req.query;
    
    if (error) {
      return reply.redirect(`${appUrl}/app/settings/integrations?error=${encodeURIComponent(error)}`);
    }
    
    if (!code || !state) {
      return reply.redirect(`${appUrl}/app/settings/integrations?error=MissingCodeOrState`);
    }

    const [orgId] = state.split(":");
    if (!orgId) {
      return reply.redirect(`${appUrl}/app/settings/integrations?error=InvalidState`);
    }

    const adapter = getIntegrationAdapter(provider);
    if (!adapter || !adapter.completeOAuth) {
      return reply.redirect(`${appUrl}/app/settings/integrations?error=InvalidProvider`);
    }

    const redirectUri = `${redirectUriBase}/api/integrations/oauth/${provider}/callback`;
    const db = getDb();

    try {
      const config = await adapter.completeOAuth({ code, redirectUri });
      const encrypted = await encryptIntegrationConfigEnvelope(config as unknown as Record<string, string>);
      
      const [existing] = await db.select({ id: integrations.id }).from(integrations).where(and(eq(integrations.orgId, orgId), eq(integrations.provider, provider)));
      
      if (existing) {
        await db.update(integrations).set({ configEncrypted: encrypted, status: "connected", lastError: null, updatedAt: new Date() }).where(eq(integrations.id, existing.id));
      } else {
        await db.insert(integrations).values({ orgId, provider, configEncrypted: encrypted, status: "connected" });
      }

      return reply.redirect(`${appUrl}/app/settings/integrations?success=true`);
    } catch (err) {
      fastify.log.error({ err }, "completeOAuth failed");
      return reply.redirect(`${appUrl}/app/settings/integrations?error=${encodeURIComponent((err as Error).message)}`);
    }
  });
}
