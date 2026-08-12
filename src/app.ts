import express from "express";
import { pinoHttp } from "pino-http";
import { requireApiKey } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { videoRouter } from "./routes/videoRoutes.js";
import { checkDatabase } from "./db.js";
import { checkQueue } from "./services/queueService.js";
import { checkStorage } from "./services/s3Service.js";
import { logger } from "./utils/logger.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(pinoHttp({ logger }));

  app.get("/health", async (_request, response) => {
    const checks = await Promise.allSettled([
      checkDatabase(),
      checkQueue(),
      checkStorage(),
    ]);
    const names = ["database", "redis", "storage"] as const;
    const dependencies = Object.fromEntries(
      checks.map((check, index) => [names[index], check.status === "fulfilled" ? "up" : "down"]),
    );
    const healthy = checks.every((check) => check.status === "fulfilled");
    response.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      dependencies,
    });
  });

  app.use("/api/videos", requireApiKey, videoRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
