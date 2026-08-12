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

## Low-cost AWS pilot

The repository also includes a deliberately small pilot deployment in `deploy/pilot-cloudformation.yml`. It creates one `t3.small` EC2 instance, a private S3 bucket, a stable Elastic IP, HTTPS through Caddy, and Systems Manager access without exposing SSH. PostgreSQL and Redis run on the same instance, so this option is suitable for demos and early validation rather than high availability.

The pilot API key is generated during bootstrap and stored as a SecureString at `/video-pipeline/pilot/api-key` in Systems Manager Parameter Store. The S3 client uses the EC2 instance role, so no long-lived AWS access keys are written to disk.

Deploy the stack from an authenticated AWS shell:

```bash
aws cloudformation deploy \
  --region us-east-1 \
  --stack-name video-pipeline-pilot \
  --template-file deploy/pilot-cloudformation.yml \
  --capabilities CAPABILITY_IAM
```

After deployment, read the `HealthUrl` stack output. Initial boot, image builds, and public certificate issuance can take several minutes.

## Current deployment status and next step

The project is intentionally stopping at a **local, Docker-based deployment**. The complete upload-to-chunk pipeline has been integration-tested locally with the API, worker, PostgreSQL, Redis, MinIO, and FFmpeg.

The AWS pilot was prepared but **not deployed**, so this project did not create AWS infrastructure or deployment charges. Deployment was paused after reviewing Free Tier eligibility because the pilot would create recurring compute, storage, and public IPv4 costs.

To resume cloud deployment later:

1. Confirm an AWS credit balance or approve a monthly budget.
2. Deploy `deploy/pilot-cloudformation.yml`, or redesign the worker for a scale-to-zero platform.
3. Run the same upload, metadata, chunk-duration, storage, database, and authentication integration checks used locally.
4. Add cost alerts before leaving cloud resources running.

For now, copy `.env.example` to `.env` and run `docker compose up --build` to use the complete application locally.

### Why GitHub Pages cannot host the complete pipeline

GitHub Pages hosts static HTML, CSS, and browser-side JavaScript. It cannot run the Node.js/Express API, FFmpeg worker, BullMQ, PostgreSQL, Redis, or private object storage required by this project.

GitHub Pages could host a future static landing page, documentation site, or upload interface, but that interface would still need to call a separately hosted backend. The application code can remain on GitHub regardless of where that backend eventually runs.
