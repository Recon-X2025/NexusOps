/**
 * A2 — Knowledge Base thumbs-down must be counted.
 *
 * `knowledge.recordFeedback` incremented helpfulCount under `if (input.helpful)`
 * and had no else branch, so every negative rating was written to kb_feedback
 * and then silently dropped from the article counter. Two UI sites read
 * notHelpfulCount and therefore always showed 0.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedTestOrg, seedUser, testDb, cleanupOrg, createMockContext } from "./helpers";
import { kbArticles, eq } from "@coheronconnect/db";
import { knowledgeRouter } from "../routers/knowledge";

describe("KB feedback counters", () => {
  let orgId: string;
  let caller: ReturnType<typeof knowledgeRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    const { userId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" });
    caller = knowledgeRouter.createCaller(createMockContext(userId, orgId));
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  async function counters(articleId: string) {
    const [row] = await testDb()
      .select({ helpful: kbArticles.helpfulCount, notHelpful: kbArticles.notHelpfulCount })
      .from(kbArticles)
      .where(eq(kbArticles.id, articleId));
    return row!;
  }

  it("helpful:true increments helpfulCount only", async () => {
    const article = await caller.create({ title: "Reset your VPN password", content: "…" });
    await caller.recordFeedback({ articleId: article.id, helpful: true });

    const after = await counters(article.id);
    expect(after.helpful).toBe(1);
    expect(after.notHelpful).toBe(0);
  });

  it("helpful:false increments notHelpfulCount only (the defect: it counted nothing)", async () => {
    const article = await caller.create({ title: "Connect to the office wifi", content: "…" });
    await caller.recordFeedback({ articleId: article.id, helpful: false });

    const after = await counters(article.id);
    expect(after.notHelpful).toBe(1);
    expect(after.helpful).toBe(0);
  });
});
