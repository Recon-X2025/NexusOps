import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { integrations, integrationSyncLogs, tickets, ticketStatuses, users, organizations, eq, and } from "@nexusops/db";
import { decryptIntegrationConfig } from "./encryption";

export { decryptIntegrationConfig };

interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
}

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string | { content?: Array<{ content?: Array<{ text?: string }> }> } | null;
    status: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string } | null;
    created: string;
    updated: string;
    resolutiondate?: string | null;
    resolution?: { name: string } | null;
  };
}

export async function fetchJiraIssues(config: JiraConfig): Promise<JiraIssue[]> {
  const url = `${config.baseUrl}/rest/api/3/search?jql=${encodeURIComponent(`project=${config.projectKey}`)}&maxResults=50`;
  const credentials = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { issues: JiraIssue[] };
  return data.issues ?? [];
}

export async function pushTicketToJira(
  config: JiraConfig,
  ticket: { title: string; description?: string; priority?: string },
): Promise<{ key: string }> {
  const url = `${config.baseUrl}/rest/api/3/issue`;
  const credentials = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");

  const priorityMap: Record<string, string> = {
    critical: "Highest",
    high: "High",
    medium: "Medium",
    low: "Low",
  };

  const body = {
    fields: {
      project: { key: config.projectKey },
      summary: ticket.title,
      description: ticket.description
        ? {
            type: "doc",
            version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text: ticket.description }] }],
          }
        : undefined,
      issuetype: { name: "Bug" },
      priority: ticket.priority ? { name: priorityMap[ticket.priority] ?? "Medium" } : undefined,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Jira create issue error: ${response.status} ${err}`);
  }

  return response.json() as Promise<{ key: string }>;
}

function extractJiraDescription(
  desc: JiraIssue["fields"]["description"],
): string {
  if (!desc) return "";
  if (typeof desc === "string") return desc;
  try {
    return (
      desc.content
        ?.flatMap((block) => block.content?.map((inline) => inline.text ?? "") ?? [])
        .join(" ") ?? ""
    );
  } catch {
    return "";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncJiraToNexus(db: NodePgDatabase<any>, orgId: string, integrationId: string): Promise<number> {
  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.orgId, orgId)));

  if (!integration?.configEncrypted) throw new Error("Integration not found or missing config");

  const config = decryptIntegrationConfig(integration.configEncrypted) as unknown as JiraConfig;
  const issues = await fetchJiraIssues(config);

  const [defaultStatus] = await db
    .select({ id: ticketStatuses.id })
    .from(ticketStatuses)
    .where(eq(ticketStatuses.orgId, orgId))
    .limit(1);

  if (!defaultStatus) throw new Error("No ticket status found for org");

  const [requester] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.orgId, orgId))
    .limit(1);

  if (!requester) throw new Error("No user found for org");

  const [orgRow] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const slug = (orgRow?.slug ?? "EXT").toUpperCase();

  let synced = 0;
  const errors: Array<{ message: string; data?: unknown }> = [];

  for (const issue of issues) {
    try {
      const externalId = issue.key;
      const title = issue.fields.summary ?? "(no summary)";
      const description = extractJiraDescription(issue.fields.description);

      const existing = await db
        .select({ id: tickets.id })
        .from(tickets)
        .where(and(eq(tickets.orgId, orgId), eq(tickets.externalId, externalId)))
        .limit(1);

      if (existing[0]) {
        await db
          .update(tickets)
          .set({ title, description, updatedAt: new Date() })
          .where(eq(tickets.id, existing[0].id));
      } else {
        const countRows = await db
          .select({ id: tickets.id })
          .from(tickets)
          .where(eq(tickets.orgId, orgId));
        const number = `${slug}-${String(countRows.length + 1).padStart(4, "0")}`;

        await db.insert(tickets).values({
          orgId,
          number,
          title,
          description,
          statusId: defaultStatus.id,
          requesterId: requester.id,
          externalId,
          externalSource: "jira",
        });
      }
      synced++;
    } catch (e) {
      errors.push({ message: (e as Error).message, data: { key: issue.key } });
    }
  }

  await db.insert(integrationSyncLogs).values({
    integrationId,
    direction: "inbound",
    entityType: "ticket",
    recordCount: synced,
    errorCount: errors.length,
    errors: errors.length > 0 ? errors : undefined,
  });

  await db
    .update(integrations)
    .set({ lastSyncAt: new Date(), updatedAt: new Date() })
    .where(eq(integrations.id, integrationId));

  return synced;
}
