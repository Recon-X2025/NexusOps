import type { WorkflowAction } from "./types";

export const blankStepAction: WorkflowAction<any> = {
  name: "blank_step",
  category: "automation",
  displayName: "Blank Custom Step",
  description: "A blank workflow step that you can name and configure from scratch.",
  inputs: [],
  async handler() {
    return { ok: true, message: "Blank step executed" };
  },
};
