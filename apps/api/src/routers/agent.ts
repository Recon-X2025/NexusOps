import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../lib/trpc";
import {
  runAgentTurn,
  listConversations,
  getConversation,
} from "../services/agent-copilot";
import { agentConversations, eq, and } from "@coheronconnect/db";

/**
 * agentRouter — single tRPC surface for the CoheronConnect Copilot.
 *
 * All procedures are `protectedProcedure`: any authenticated user may use
 * the chat interface, but the agent-copilot service still enforces
 * per-tool RBAC inside the tool-use loop, so a viewer can't slip a
 * `create_ticket` past the model.
 */
export const agentRouter = router({
  /** Send a message; if `conversationId` is omitted a new thread is created. */
  chat: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid().optional(),
        message: z.string().min(1).max(4000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user || !ctx.org) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      try {
        return await runAgentTurn({
          db: ctx.db,
          orgId: ctx.org.id as string,
          userId: ctx.user.id as string,
          userRole: String(ctx.user.role ?? "member"),
          matrixRole: (ctx.user.matrixRole as string | null | undefined) ?? null,
          conversationId: input.conversationId,
          userMessage: input.message,
        });
      } catch (err) {
        const message = (err as Error).message ?? "Agent failed";
        if (message.includes("ANTHROPIC_API_KEY")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Copilot is not configured for this environment. Ask an admin to set ANTHROPIC_API_KEY.",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),

  /** Recent conversations for the signed-in user. */
  listConversations: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user || !ctx.org) throw new TRPCError({ code: "UNAUTHORIZED" });
    const orgId = ctx.org.id as string;
    const userId = ctx.user.id as string;
    return listConversations(ctx.db, orgId, userId);
  }),

  /** Full transcript for resuming a thread. */
  getConversation: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user || !ctx.org) throw new TRPCError({ code: "UNAUTHORIZED" });
      const result = await getConversation(ctx.db, input.conversationId);
      if (!result) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        result.conversation.orgId !== (ctx.org.id as string) ||
        result.conversation.userId !== (ctx.user.id as string)
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return result;
    }),

  /** Soft-delete a conversation (cascades to messages via FK). */
  deleteConversation: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user || !ctx.org) throw new TRPCError({ code: "UNAUTHORIZED" });
      const [conv] = await ctx.db
        .select()
        .from(agentConversations)
        .where(eq(agentConversations.id, input.conversationId))
        .limit(1);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        conv.orgId !== (ctx.org.id as string) ||
        conv.userId !== (ctx.user.id as string)
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await ctx.db
        .delete(agentConversations)
        .where(
          and(
            eq(agentConversations.id, input.conversationId),
            eq(agentConversations.userId, ctx.user.id as string),
          ),
        );
      return { ok: true };
    }),
});
