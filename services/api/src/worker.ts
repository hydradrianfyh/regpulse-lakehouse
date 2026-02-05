import "dotenv/config";
import { Worker } from "bullmq";
import { initDb } from "./db";
import { redis, SCAN_QUEUE, MERGE_QUEUE } from "./queue";
import { processScanJob } from "./jobs/scan";
import { processMergeJob } from "./jobs/merge";
import { loadRuntimeConfig } from "./config/runtime";

async function start() {
  await initDb();
  await loadRuntimeConfig();

  const scanWorker = new Worker(
    SCAN_QUEUE,
    async (job) => {
      await processScanJob(job.data);
    },
    { connection: redis, concurrency: 2 }
  );

  const mergeWorker = new Worker(
    MERGE_QUEUE,
    async (job) => {
      await processMergeJob(job.data);
    },
    { connection: redis, concurrency: 1 }
  );

  scanWorker.on("failed", (job, err) => {
    console.error("Scan job failed", job?.id, err);
  });

  mergeWorker.on("failed", (job, err) => {
    console.error("Merge job failed", job?.id, err);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
