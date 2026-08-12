import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";

export const queueName = "video-processing";

export function videoRetryDelay(attemptsMade: number): number {
  return 5_000 * 5 ** Math.max(0, attemptsMade - 1);
}

let connection: Redis | undefined;
let queue: Queue | undefined;

export function getRedisConnection(): Redis {
  connection ??= new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  return connection;
}

export function getVideoQueue(): Queue {
  queue ??= new Queue(queueName, { connection: getRedisConnection() });
  return queue;
}

export async function enqueueChunkVideo(videoId: string): Promise<void> {
  await getVideoQueue().add(
    "chunk-video",
    { videoId },
    {
      jobId: `chunk-video-${videoId}`,
      attempts: 4,
      backoff: { type: "video-exponential" },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  );
}

export async function checkQueue(): Promise<void> {
  await getRedisConnection().ping();
}

export async function closeQueue(): Promise<void> {
  if (queue) await queue.close();
  if (connection) await connection.quit();
}
