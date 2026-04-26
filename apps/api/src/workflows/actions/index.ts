import type { WorkflowAction } from "./types";
import { notifyViaWhatsAppAction } from "./notify-via-whatsapp";
import { notifyViaEmailAction } from "./notify-via-email";
import { escalateOnSlaBreachAction } from "./escalate-on-sla-breach";
import { gstFilingReminderAction } from "./gst-filing-reminder";
import { dir3KycReminderAction } from "./dir3-kyc-reminder";
import { contractRenewalReminderAction } from "./contract-renewal-reminder";
import { staleLeadNudgeAction } from "./stale-lead-nudge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const allActions: WorkflowAction<any>[] = [
  notifyViaWhatsAppAction,
  notifyViaEmailAction,
  escalateOnSlaBreachAction,
  gstFilingReminderAction,
  dir3KycReminderAction,
  contractRenewalReminderAction,
  staleLeadNudgeAction,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byName = new Map<string, WorkflowAction<any>>(allActions.map((a) => [a.name, a]));

export function listWorkflowActions(): Array<{
  name: string;
  category: string;
  displayName: string;
  description: string;
  inputs: WorkflowAction["inputs"];
}> {
  return allActions.map((a) => ({
    name: a.name,
    category: a.category,
    displayName: a.displayName,
    description: a.description,
    inputs: a.inputs,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getWorkflowAction(name: string): WorkflowAction<any> | null {
  return byName.get(name) ?? null;
}

export type { WorkflowAction } from "./types";
