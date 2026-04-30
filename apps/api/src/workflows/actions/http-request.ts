import type { WorkflowAction } from "./types";
import axios from "axios";

interface Input {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: Record<string, any>;
}

export const httpRequestAction: WorkflowAction<Input> = {
  name: "http_request",
  category: "automation",
  displayName: "External HTTP Request (Webhook)",
  description: "Sends an HTTP request to an external service or API endpoint.",
  inputs: [
    { key: "url", label: "Endpoint URL", type: "string", required: true },
    { key: "method", label: "HTTP Method", type: "string", required: true },
    { key: "headers", label: "Custom Headers (JSON)", type: "json" },
    { key: "body", label: "Request Body (JSON)", type: "json" },
  ],
  async handler(_ctx, input) {
    try {
      const response = await axios({
        url: input.url,
        method: input.method,
        headers: input.headers,
        data: input.body,
      });
      return { status: response.status, data: response.data };
    } catch (err: any) {
      return { 
        ok: false, 
        error: err.message, 
        status: err.response?.status, 
        data: err.response?.data 
      };
    }
  },
};
