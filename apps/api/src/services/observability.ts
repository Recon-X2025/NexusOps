/**
 * observability.ts — OpenTelemetry instrumentation for CoheronConnect API
 *
 * Traces:
 * - All tRPC requests (via HTTP auto-instrumentation)
 * - All PostgreSQL queries (via pg auto-instrumentation)
 * - All Redis calls (via ioredis auto-instrumentation)
 *
 * Exports to OTLP endpoint (Jaeger, Tempo, Datadog, etc.)
 *
 * Configuration (ENV):
 *   OTEL_EXPORTER_OTLP_ENDPOINT — OTLP receiver URL, e.g. http://otel-collector:4318
 *   OTEL_SERVICE_NAME           — defaults to "coheronconnect-api"
 *   OTEL_TRACES_SAMPLER         — defaults to "always_on"; set "parentbased_traceidratio" + OTEL_TRACES_SAMPLER_ARG for sampling
 *
 * IMPORTANT: This module must be imported BEFORE any other module in the entry point
 * so that instrumentation patches load before the target libraries.
 * In index.ts: import "./services/observability" (or via --require in start command)
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const SERVICE_NAME = process.env["OTEL_SERVICE_NAME"] ?? "coheronconnect-api";
const OTLP_ENDPOINT = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];

let _sdk: NodeSDK | undefined;

/** Initialise OpenTelemetry. Call before any other imports in production. */
export function initObservability(): void {
  if (!OTLP_ENDPOINT) {
    console.info("[observability] OTEL_EXPORTER_OTLP_ENDPOINT not set — tracing disabled");
    return;
  }

  if (_sdk) return; // Already initialised

  const exporter = new OTLPTraceExporter({
    url: `${OTLP_ENDPOINT}/v1/traces`,
  });

  _sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: process.env["npm_package_version"] ?? "0.0.0",
    }),
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Enable HTTP (covers tRPC + Fastify)
        "@opentelemetry/instrumentation-http": { enabled: true },
        // Enable pg (covers Drizzle ORM via pg driver)
        "@opentelemetry/instrumentation-pg": { enabled: true },
        // Enable ioredis
        "@opentelemetry/instrumentation-ioredis": { enabled: true },
        // Disable noisy fs instrumentation
        "@opentelemetry/instrumentation-fs": { enabled: false },
        // Disable DNS
        "@opentelemetry/instrumentation-dns": { enabled: false },
      }),
    ],
  });

  _sdk.start();
  console.info(`[observability] OpenTelemetry started — exporting to ${OTLP_ENDPOINT}`);

  // Graceful shutdown
  process.on("SIGTERM", () => {
    _sdk?.shutdown().catch(console.error);
  });
  process.on("SIGINT", () => {
    _sdk?.shutdown().catch(console.error);
  });
}
