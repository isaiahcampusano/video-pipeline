import { mkdir } from "node:fs/promises";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { closeDatabase } from "./db.js";
import { runMigrations } from "./migrate.js";
import { closeQueue } from "./services/queueService.js";
import { ensureBucket } from "./services/s3Service.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  await mkdir(config.tempDir, { recursive: true });
  await runMigrations();
  await ensureBucket();

  const server = createApp().listen(config.port, () => {
    logger.info({ port: config.port }, "Video pipeline API listening");
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down API");
    server.close(async () => {
      await Promise.allSettled([closeQueue(), closeDatabase()]);
      process.exit(0);
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.fatal(error, "API failed to start");
  process.exit(1);
});
