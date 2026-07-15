import "dotenv/config";
import { Worker, NativeConnection } from "@temporalio/worker";
import { Connection } from "@temporalio/client";
import { Pool } from "pg";
import { createActivities } from "./activities/workflow-activities";
import { createDpdpSweepActivities } from "./activities/dpdp-sweep-activities";
import { registerDpdpSweepSchedule } from "./schedules/dpdp-sweep-schedule";

async function run() {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });

  const address = process.env["TEMPORAL_ADDRESS"] ?? "localhost:7233";
  const connection = await NativeConnection.connect({ address });

  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: { ...createActivities(pool), ...createDpdpSweepActivities() },
    taskQueue: "coheronconnect-workflow",
    connection,
  });

  // Register the recurring DPDP sweep schedule. Uses a separate gRPC client
  // connection (the worker's NativeConnection is not a client). Non-fatal:
  // a failure here should not stop the worker from processing other work.
  try {
    const clientConnection = await Connection.connect({ address });
    await registerDpdpSweepSchedule(clientConnection);
  } catch (err) {
    console.error("[worker] Failed to register DPDP sweep schedule (non-fatal)", err);
  }

  console.log(`[worker] Listening on task queue 'coheronconnect-workflow' → ${address}`);
  await worker.run();
}

run().catch((err) => {
  console.error("[worker] Fatal error", err);
  process.exit(1);
});
