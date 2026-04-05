import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { integrations, integrationSyncLogs, tickets, ticketStatuses, users, organizations, eq, and } from "@nexusops/db";
import { decryptIntegrationConfig } from "./jira";

interface SapConfig {
  baseUrl: string;
  username: string;
  password: string;
  systemId: string;
}

interface SapServiceRequest {
  ServiceRequest: string;
  Name: string;
  Description?: string;
  ProcessingStatus?: string;
  Priority?: string;
  CreationDateTime?: string;
  LastChangeDateTime?: string;
}

interface SapODataResponse {
  d?: {
    results?: SapServiceRequest[];
  };
}

export async function fetchSapIncidents(config: SapConfig): Promise<SapServiceRequest[]> {
  const url = `${config.baseUrl}/sap/opu/odata/sap/API_SERVICEREQUESTHDR_SRV/A_ServiceRequest?$format=json&$top=50`;
  const credentials = Buffer.from(`${config.username}:${config.password}`).toString("base64");

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
      "sap-client": config.systemId,
    },
  });

  if (!response.ok) {
    throw new Error(`SAP API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as SapODataResponse;
  return data.d?.results ?? [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncSapToNexus(db: NodePgDatabase<any>, orgId: string, integrationId: string): Promise<number> {
  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.id, integrationId), eq(integrations.orgId, orgId)));

  if (!integration?.configEncrypted) throw new Error("Integration not found or missing config");

  const config = decryptIntegrationConfig(integration.configEncrypted) as unknown as SapConfig;
  const incidents = await fetchSapIncidents(config);

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

  const slug = (orgRow?.slug ?? "SAP").toUpperCase();

  let synced = 0;
  const errors: Array<{ message: string; data?: unknown }> = [];

  for (const incident of incidents) {
    try {
      const externalId = `SAP-${incident.ServiceRequest}`;
      const title = incident.Name ?? "(no name)";
      const description = incident.Description ?? "";

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
          externalSource: "sap",
        });
      }
      synced++;
    } catch (e) {
      errors.push({ message: (e as Error).message, data: { id: incident.ServiceRequest } });
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
