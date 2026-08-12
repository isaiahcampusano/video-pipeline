import { mkdir, mkdtemp, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { Worker, type Job } from "bullmq";
import { config } from "./config.js";
import { closeDatabase } from "./db.js";
import {
  getVideo,
  updateVideoMetadata,
  updateVideoStatus,
  upsertChunk,
} from "./models/videoModel.js";
import {
  calculateChunkBounds,
  createChunk,
  probeVideo,
} from "./services/chunkService.js";
import {
  closeQueue,
  getRedisConnection,
  queueName,
  videoRetryDelay,
} from "./services/queueService.js";
import { downloadFile, ensureBucket, uploadFile } from "./services/s3Service.js";
import { logger } from "./utils/logger.js";

interface ChunkVideoPayload {
  videoId: string;
}

async function processChunkVideo(job: Job<ChunkVideoPayload>): Promise<void> {
  const { videoId } = job.data;
  const video = await getVideo(videoId);
  if (!video) throw new Error(`Video not found: ${videoId}`);

  await updateVideoStatus(videoId, "chunking");
  const jobDir = await mkdtemp(path.join(config.tempDir, `${videoId}-`));
  const inputPath = path.join(jobDir, "original");

  try {
    await downloadFile(video.original_key, inputPath);
    const metadata = await probeVideo(inputPath);
    await updateVideoMetadata(videoId, metadata);
    const chunks = calculateChunkBounds(
      metadata.durationSec,
      config.chunkDurationSec,
    );

    for (const bounds of chunks) {
      const paddedIndex = bounds.index.toString().padStart(4, "0");
      const chunkPath = path.join(jobDir, `chunk_${paddedIndex}.ts`);
      const s3Key = `videos/${videoId}/chunks/chunk_${paddedIndex}.ts`;
      try {
        await createChunk(inputPath, chunkPath, bounds);
        const byteSize = await uploadFile(s3Key, chunkPath, "video/mp2t");
        await upsertChunk({
          videoId,
          index: bounds.index,
          s3Key,
          byteSize,
          startSec: bounds.startSec,
          endSec: bounds.endSec,
        });
        await job.updateProgress(
          Math.round(((bounds.index + 1) / chunks.length) * 100),
        );
      } finally {
        await unlink(chunkPath).catch(() => {});
      }
    }
    await updateVideoStatus(videoId, "chunked");
  } finally {
    await rm(jobDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await mkdir(config.tempDir, { recursive: true });
  await ensureBucket();
  const worker = new Worker<ChunkVideoPayload>(queueName, processChunkVideo, {
    connection: getRedisConnection(),
    concurrency: config.workerConcurrency,
    settings: {
      backoffStrategy: (attemptsMade, type) => {
        if (type !== "video-exponential") {
          throw new Error(`Unknown backoff strategy: ${type}`);
        }
        return videoRetryDelay(attemptsMade);
      },
    },
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, videoId: job.data.videoId }, "Video chunked");
  });
  worker.on("failed", async (job, error) => {
    logger.error({ jobId: job?.id, error }, "Chunking attempt failed");
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await updateVideoStatus(
        job.data.videoId,
        "failed",
        error.message.slice(0, 2000),
      ).catch((updateError) => logger.error(updateError, "Could not mark video failed"));
    }
  });
  worker.on("error", (error) => logger.error(error, "Worker error"));
  logger.info({ concurrency: config.workerConcurrency }, "Video worker started");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down worker");
    await worker.close();
    await Promise.allSettled([closeQueue(), closeDatabase()]);
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.fatal(error, "Worker failed to start");
  process.exit(1);
});
