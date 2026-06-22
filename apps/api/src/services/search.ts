import { MeiliSearch } from "meilisearch";

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_URL || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_KEY || "",
});

const INDEXES = ["tickets", "assets", "ci_items", "kb_articles", "employees", "contracts", "crm_deals", "crm_accounts"];

export async function initSearchIndexes() {
  if (!process.env.MEILISEARCH_URL) return;
  for (const idx of INDEXES) {
    try {
      await client.index(idx).updateFilterableAttributes(["org_id", "status", "type"]);
      await client.index(idx).updateSearchableAttributes(["title", "name", "description", "content", "number"]);
    } catch { /* graceful */ }
  }
}

export async function indexDocument(indexName: string, doc: {
  id: string; org_id: string; title?: string; name?: string;
  description?: string; number?: string; type?: string; status?: string;
}) {
  if (!process.env.MEILISEARCH_URL) return;
  try {
    await client.index(indexName).addDocuments([doc], { primaryKey: "id" });
  } catch { /* graceful */ }
}

export async function globalSearch(query: string, orgId: string, entityTypes?: string[], limit = 20) {
  if (!process.env.MEILISEARCH_URL) return [];
  try {
    const indexes = entityTypes?.length ? entityTypes : INDEXES;
    const results = await Promise.all(
      indexes.map(idx =>
        client.index(idx).search(query, {
          filter: `org_id = "${orgId}"`,
          limit: Math.ceil(limit / indexes.length),
        }).then(r => r.hits.map(h => ({ ...h, _index: idx })))
          .catch(() => [])
      )
    );
    return results.flat().slice(0, limit);
  } catch { return []; }
}

function getHref(index: string, id: string): string {
  const MAP: Record<string, string> = {
    tickets: `/app/tickets/${id}`,
    assets: `/app/ham`,
    ci_items: `/app/cmdb`,
    kb_articles: `/app/knowledge`,
    employees: `/app/hr`,
    contracts: `/app/contracts`,
    crm_deals: `/app/crm`,
    crm_accounts: `/app/crm`,
  };
  return MAP[index] ?? "/app/dashboard";
}

export async function searchGlobal(query: string, orgId: string, entityTypes?: string[], limit?: number) {
  const hits = await globalSearch(query, orgId, entityTypes, limit);
  return hits.map((h: any) => ({
    id: h.id,
    type: h._index,
    title: h.title ?? h.name ?? h.number ?? "Item",
    description: h.description?.slice(0, 120) ?? "",
    href: getHref(h._index, h.id),
  }));
}
