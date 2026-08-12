import ffmpeg from "fluent-ffmpeg";

export interface VideoMetadata {
  durationSec: number;
  resolution: string;
  codec: string;
}

export interface ChunkBounds {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
}

export function calculateChunkBounds(
  durationSec: number,
  chunkDurationSec: number,
): ChunkBounds[] {
  if (durationSec <= 0 || chunkDurationSec <= 0) return [];
  const count = Math.ceil(durationSec / chunkDurationSec);
  return Array.from({ length: count }, (_, index) => {
    const startSec = index * chunkDurationSec;
    const endSec = Math.min(startSec + chunkDurationSec, durationSec);
    return { index, startSec, endSec, durationSec: endSec - startSec };
  });
}

export function probeVideo(inputPath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, data) => {
      if (error) return reject(error);
      const videoStream = data.streams.find(
        (stream) => stream.codec_type === "video",
      );
      const durationSec = Number(data.format.duration);
      if (!videoStream || !Number.isFinite(durationSec) || durationSec <= 0) {
        return reject(new Error("The uploaded file does not contain a readable video stream"));
      }
      resolve({
        durationSec,
        resolution: `${videoStream.width ?? 0}x${videoStream.height ?? 0}`,
        codec: videoStream.codec_name ?? "unknown",
      });
    });
  });
}

export function createChunk(
  inputPath: string,
  outputPath: string,
  bounds: ChunkBounds,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      // Output-side seeking is important with stream copy. Input-side seeking
      // rewinds to the previous keyframe and can make later chunks contain
      // all preceding video instead of only the requested time range.
      .seek(bounds.startSec)
      .duration(bounds.durationSec)
      .outputOptions(["-c copy", "-f mpegts", "-avoid_negative_ts make_zero"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}
