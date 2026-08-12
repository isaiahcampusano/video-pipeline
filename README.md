# Video Pipeline

A TypeScript service that accepts video uploads, stores originals in S3-compatible object storage, and uses a Redis-backed worker to split each video into time-based MPEG-TS chunks. PostgreSQL tracks video metadata, processing state, and every generated chunk.

## What is included

- API-key-protected upload and status endpoints
- Disk-backed multipart uploads with a configurable 5 GB limit
- S3/MinIO original and chunk storage
- BullMQ job retries and progress reporting
- FFmpeg/ffprobe metadata extraction and stream-copy chunking
- Idempotent chunk records for safe job retries
- PostgreSQL migrations on API startup
- API and worker graceful shutdown
- Docker Compose local environment

## Run locally

Requirements: Docker with Compose.

```bash
cp .env.example .env
docker compose up --build
```

The API is available at `http://localhost:3000`. The MinIO console is at `http://localhost:9001` using `minioadmin` / `minioadmin`.

Check service health:

```bash
curl http://localhost:3000/health
```

Upload a video:

```bash
curl -X POST http://localhost:3000/api/videos/upload \
  -H "x-api-key: dev-secret-key-123" \
  -F "video=@./sample.mp4"
```

The upload response contains the video ID. Use it to follow processing:

```bash
curl -H "x-api-key: dev-secret-key-123" \
  http://localhost:3000/api/videos/VIDEO_ID/status

curl -H "x-api-key: dev-secret-key-123" \
  http://localhost:3000/api/videos/VIDEO_ID
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Check PostgreSQL, Redis, and storage |
| `POST` | `/api/videos/upload` | Upload multipart field `video` |
| `GET` | `/api/videos/:id/status` | Get status, progress, and chunk count |
| `GET` | `/api/videos/:id` | Get video metadata and ordered chunks |

All `/api/videos` routes require `x-api-key`. Uploads over `MAX_FILE_SIZE_BYTES` receive HTTP 413.

## Development without Docker for Node

Start PostgreSQL, Redis, MinIO, and FFmpeg locally, then point `.env` at them. Install and run:

```bash
npm install
npm run migrate
npm run dev
```

In a second terminal:

```bash
npm run dev:worker
```

Build and test:

```bash
npm run build
npm test
```

## Processing lifecycle

1. The API writes the multipart upload to a bounded temporary file, streams it to object storage, creates a PostgreSQL row, and enqueues `chunk-video`.
2. The worker downloads the original, probes it, and changes status to `chunking`.
3. FFmpeg stream-copies configurable segments (10 seconds by default) into `.ts` files. Each file is uploaded and recorded before progress advances.
4. The worker sets status to `chunked`. A failed job is retried three times after 5, 25, and 125 seconds; after the last attempt, status becomes `failed` with a diagnostic message.
5. Temporary upload, input, and chunk files are removed in `finally` blocks.

Chunk objects use `videos/{id}/chunks/chunk_0000.ts`. The original uses `videos/{id}/original.{extension}`.

## Production notes

For AWS, point the same S3 client at S3 (and normally omit the custom endpoint), run the API and worker as separate ECS/Fargate services, use RDS PostgreSQL and ElastiCache Redis, inject secrets from Secrets Manager, and place the API behind a TLS-enabled load balancer/API gateway. Scale workers independently and give each task enough ephemeral disk for an original video plus one chunk.
