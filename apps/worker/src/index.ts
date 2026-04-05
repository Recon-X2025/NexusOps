import "dotenv/config";
import { Worker, NativeConnection } from "@temporalio/worker";
import { Pool } from "pg";
import { createActivities } from "./activities/workflow-activities";

async function run() {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });

  const address = process.env["TEMPORAL_ADDRESS"] ?? "localhost:7233";
  const connection = await NativeConnection.connect({ address });

  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows/nexusWorkflow"),
    activities: createActivities(pool),
    taskQueue: "nexusops-workflow",
    connection,
  });

  console.log(`[worker] Listening on task queue 'nexusops-workflow' → ${address}`);
  await worker.run();
}

run().catch((err) => {
  console.error("[worker] Fatal error", err);
  process.exit(1);
});
