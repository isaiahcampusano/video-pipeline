import { randomUUID } from "node:crypto";
import { pool } from "../db.js";

export type VideoStatus = "uploaded" | "chunking" | "chunked" | "failed";

export interface VideoRecord {
  id: string;
  original_key: string;
  status: VideoStatus;
  duration_sec: number | null;
  resolution: string | null;
  codec: string | null;
  chunk_count: number;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ChunkRecord {
  id: string;
  video_id: string;
  index: number;
  s3_key: string;
  byte_size: string | null;
  start_sec: number;
  end_sec: number;
  created_at: Date;
}

export async function createVideo(originalKey: string): Promise<VideoRecord> {
  const result = await pool.query<VideoRecord>(
    `INSERT INTO videos (id, original_key)
     VALUES ($1, $2)
     RETURNING *`,
    [randomUUID(), originalKey],
  );
  return result.rows[0];
}

export async function getVideo(id: string): Promise<VideoRecord | null> {
  const result = await pool.query<VideoRecord>(
    "SELECT * FROM videos WHERE id = $1",
    [id],
  );
  return result.rows[0] ?? null;
}

export async function getVideoWithChunks(
  id: string,
): Promise<{ video: VideoRecord; chunks: ChunkRecord[] } | null> {
  const video = await getVideo(id);
  if (!video) return null;
  const chunks = await pool.query<ChunkRecord>(
    'SELECT * FROM chunks WHERE video_id = $1 ORDER BY "index" ASC',
    [id],
  );
  return { video, chunks: chunks.rows };
}

export async function updateVideoStatus(
  id: string,
  status: VideoStatus,
  errorMessage: string | null = null,
): Promise<void> {
  await pool.query(
    `UPDATE videos
     SET status = $2, error_message = $3, updated_at = now()
     WHERE id = $1`,
    [id, status, errorMessage],
  );
}

export async function updateVideoMetadata(
  id: string,
  metadata: { durationSec: number; resolution: string; codec: string },
): Promise<void> {
  await pool.query(
    `UPDATE videos
     SET duration_sec = $2, resolution = $3, codec = $4,
         chunk_count = 0, error_message = NULL, updated_at = now()
     WHERE id = $1`,
    [id, metadata.durationSec, metadata.resolution, metadata.codec],
  );
}

export async function upsertChunk(input: {
  videoId: string;
  index: number;
  s3Key: string;
  byteSize: number;
  startSec: number;
  endSec: number;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO chunks (video_id, "index", s3_key, byte_size, start_sec, end_sec)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (video_id, "index") DO UPDATE SET
         s3_key = EXCLUDED.s3_key,
         byte_size = EXCLUDED.byte_size,
         start_sec = EXCLUDED.start_sec,
         end_sec = EXCLUDED.end_sec`,
      [
        input.videoId,
        input.index,
        input.s3Key,
        input.byteSize,
        input.startSec,
        input.endSec,
      ],
    );
    await client.query(
      `UPDATE videos
       SET chunk_count = (SELECT count(*) FROM chunks WHERE video_id = $1),
           updated_at = now()
       WHERE id = $1`,
      [input.videoId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
