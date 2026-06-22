import { router, protectedProcedure } from "../lib/trpc";
import { z } from "zod";
import { searchGlobal } from "../services/search";

export const searchRouter = router({
  global: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(200),
      entityTypes: z.array(z.string()).optional(),
      limit: z.coerce.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      return searchGlobal(input.query, ctx.org!.id, input.entityTypes, input.limit);
    }),
});
