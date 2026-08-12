import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({ error: "Route not found" });
};

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    response.status(status).json({ error: error.message, code: error.code });
    return;
  }
  if (error instanceof AppError) {
    response
      .status(error.statusCode)
      .json({ error: error.message, code: error.code });
    return;
  }
  logger.error(error, "Unhandled request error");
  response.status(500).json({ error: "Internal server error" });
};
