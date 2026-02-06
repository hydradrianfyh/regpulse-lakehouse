import IORedis from "ioredis";
import { Queue } from "bullmq";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
export const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });

export const SCAN_QUEUE = "regpulse-scan";
export const MERGE_QUEUE = "regpulse-merge";

export const scanQueue = new Queue(SCAN_QUEUE, { connection: redis });
export const mergeQueue = new Queue(MERGE_QUEUE, { connection: redis });

export async function enqueueScanJob(payload: Record<string, unknown>) {
  return scanQueue.add("scan", payload, { removeOnComplete: 100, removeOnFail: 100 });
}

export async function enqueueMergeJob(payload: Record<string, unknown>) {
  return mergeQueue.add("merge", payload, { removeOnComplete: 100, removeOnFail: 100 });
}
