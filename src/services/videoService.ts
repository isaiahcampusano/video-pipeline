import path from "node:path";
import {
  createVideo,
  getVideo,
  getVideoWithChunks,
} from "../models/videoModel.js";
import { AppError } from "../utils/errors.js";
import { deleteObject, uploadFile } from "./s3Service.js";
import { enqueueChunkVideo } from "./queueService.js";

export async function acceptUpload(file: Express.Multer.File) {
  const extension = path.extname(file.originalname).toLowerCase() || ".bin";
  let video = await createVideo("pending");
  const originalKey = `videos/${video.id}/original${extension}`;

  // Keep the record and object consistent if either storage or queueing fails.
  try {
    await uploadFile(originalKey, file.path, file.mimetype);
    const { pool } = await import("../db.js");
    const updated = await pool.query(
      "UPDATE videos SET original_key = $2, updated_at = now() WHERE id = $1 RETURNING *",
      [video.id, originalKey],
    );
    video = updated.rows[0];
    await enqueueChunkVideo(video.id);
    return video;
  } catch (error) {
    await deleteObject(originalKey).catch(() => {});
    const { pool } = await import("../db.js");
    await pool.query("DELETE FROM videos WHERE id = $1", [video.id]).catch(() => {});
    throw error;
  }
}

export async function requireVideo(id: string) {
  const video = await getVideo(id);
  if (!video) throw new AppError(404, "Video not found", "VIDEO_NOT_FOUND");
  return video;
}

export async function requireVideoWithChunks(id: string) {
  const result = await getVideoWithChunks(id);
  if (!result) throw new AppError(404, "Video not found", "VIDEO_NOT_FOUND");
  return result;
}
