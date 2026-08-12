DO $$ BEGIN
  CREATE TYPE video_status AS ENUM ('uploaded', 'chunking', 'chunked', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_key TEXT NOT NULL,
  status video_status NOT NULL DEFAULT 'uploaded',
  duration_sec DOUBLE PRECISION,
  resolution TEXT,
  codec TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  "index" INTEGER NOT NULL CHECK ("index" >= 0),
  s3_key TEXT NOT NULL,
  byte_size BIGINT CHECK (byte_size >= 0),
  start_sec DOUBLE PRECISION NOT NULL CHECK (start_sec >= 0),
  end_sec DOUBLE PRECISION NOT NULL CHECK (end_sec >= start_sec),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (video_id, "index")
);

CREATE INDEX IF NOT EXISTS chunks_video_id_idx ON chunks(video_id);
CREATE INDEX IF NOT EXISTS videos_status_idx ON videos(status);
