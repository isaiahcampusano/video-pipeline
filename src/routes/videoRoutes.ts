import { unlink } from "node:fs/promises";
import { Router } from "express";
import { config } from "../config.js";
import { videoUpload } from "../middleware/upload.js";
import { AppError } from "../utils/errors.js";
import {
  acceptUpload,
  requireVideo,
  requireVideoWithChunks,
} from "../services/videoService.js";

export const videoRouter = Router();

videoRouter.post("/upload", videoUpload.single("video"), async (request, response) => {
  if (!request.file) {
    throw new AppError(400, 'Multipart field "video" is required', "VIDEO_REQUIRED");
  }
  try {
    const video = await acceptUpload(request.file);
    response.status(201).json({
      id: video.id,
      status: video.status,
      original_key: video.original_key,
    });
  } finally {
    await unlink(request.file.path).catch(() => {});
  }
});

videoRouter.get("/:id/status", async (request, response) => {
  const video = await requireVideo(request.params.id);
  const expectedChunks = video.duration_sec
    ? Math.ceil(video.duration_sec / config.chunkDurationSec)
    : null;
  const progress =
    video.status === "chunked"
      ? 100
      : expectedChunks
        ? Math.min(99, Math.round((video.chunk_count / expectedChunks) * 100))
        : 0;

  response.json({
    id: video.id,
    status: video.status,
    progress,
    duration_sec: video.duration_sec,
    chunk_count: video.chunk_count,
    ...(video.error_message ? { error: video.error_message } : {}),
  });
});

videoRouter.get("/:id", async (request, response) => {
  const { video, chunks } = await requireVideoWithChunks(request.params.id);
  response.json({ ...video, chunks });
});
