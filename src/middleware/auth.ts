import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

function keysMatch(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export function requireApiKey(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const apiKey = request.header("x-api-key");
  if (!apiKey || !keysMatch(apiKey, config.apiKey)) {
    response.status(401).json({ error: "Invalid or missing API key" });
    return;
  }
  next();
}
