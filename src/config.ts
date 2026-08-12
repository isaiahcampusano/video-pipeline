import "dotenv/config";
import path from "node:path";

function stringEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalStringEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function positiveNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${name} must be true or false`);
}

const s3AccessKey = optionalStringEnv("S3_ACCESS_KEY");
const s3SecretKey = optionalStringEnv("S3_SECRET_KEY");
if ((s3AccessKey && !s3SecretKey) || (!s3AccessKey && s3SecretKey)) {
  throw new Error("S3_ACCESS_KEY and S3_SECRET_KEY must be provided together");
}

export const config = Object.freeze({
  port: positiveNumberEnv("PORT", 3000),
  databaseUrl: stringEnv(
    "DATABASE_URL",
    "postgresql://user:pass@localhost:5432/videopipeline",
  ),
  redisUrl: stringEnv("REDIS_URL", "redis://localhost:6379"),
  s3: {
    endpoint: optionalStringEnv("S3_ENDPOINT"),
    bucket: stringEnv("S3_BUCKET", "video-pipeline-dev"),
    accessKey: s3AccessKey,
    secretKey: s3SecretKey,
    region: stringEnv("S3_REGION", "us-east-1"),
    forcePathStyle: booleanEnv("S3_FORCE_PATH_STYLE", true),
  },
  tempDir: path.resolve(stringEnv("TEMP_DIR", path.join(process.cwd(), "tmp"))),
  chunkDurationSec: positiveNumberEnv("CHUNK_DURATION_SEC", 10),
  workerConcurrency: positiveNumberEnv("WORKER_CONCURRENCY", 2),
  apiKey: stringEnv("API_KEY", "dev-secret-key-123"),
  maxFileSizeBytes: positiveNumberEnv("MAX_FILE_SIZE_BYTES", 5 * 1024 ** 3),
  logLevel: stringEnv("LOG_LEVEL", "info"),
});
