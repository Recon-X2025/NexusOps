import { sendNotification } from "../../services/notifications";
import type { WorkflowAction } from "./types";

interface Input {
  userId: string;
  title: string;
  body: string;
  link?: string;
  sourceType?: string;
  sourceId?: string;
}

export const notifyViaEmailAction: WorkflowAction<Input> = {
  name: "notify_via_email",
  category: "comms",
  displayName: "Send in-app + email notification",
  description:
    "Sends a notification to a user via email (if configured) and writes an in-platform notification row.",
  inputs: [
    { key: "userId", label: "Recipient user id", type: "uuid", required: true },
    { key: "title", label: "Title", type: "string", required: true },
    { key: "body", label: "Body", type: "string", required: true },
    { key: "link", label: "Link (deep-link path)", type: "string" },
    { key: "sourceType", label: "Source resource type", type: "string" },
    { key: "sourceId", label: "Source resource id", type: "uuid" },
  ],
  async handler(ctx, input) {
    await sendNotification({
      orgId: ctx.orgId,
      userId: input.userId,
      title: input.title,
      body: input.body,
      ...(input.link !== undefined ? { link: input.link } : {}),
      ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
      ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
    });
    return { ok: true };
  },
};
