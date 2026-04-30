import type { WorkflowAction } from "./types";

interface Input {
  code: string;
  payload?: Record<string, any>;
}

export const customJsScriptAction: WorkflowAction<Input> = {
  name: "custom_js_script",
  category: "automation",
  displayName: "Custom JavaScript Script",
  description: "Executes a custom JavaScript snippet for complex logic, data transformation, or custom rules.",
  inputs: [
    { key: "code", label: "JavaScript Code", type: "string", required: true },
    { key: "payload", label: "Initial Payload (JSON)", type: "json" },
  ],
  async handler(_ctx, input) {
    try {
      // In a production environment, this should run in a secure sandbox (e.g. isolated-vm or vm2)
      // For the purposes of this platform demo, we use a controlled function constructor.
      const fn = new Function("payload", "context", `
        try {
          ${input.code}
        } catch (e) {
          return { error: e.message };
        }
      `);
      
      const result = await fn(input.payload || {}, { orgId: _ctx.orgId, actorId: _ctx.actorId });
      return { ok: true, result };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
};
