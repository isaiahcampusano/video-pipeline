import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { requireApiKey } from "../../src/middleware/auth.js";

const app = express();
app.get("/protected", requireApiKey, (_request, response) => {
  response.json({ ok: true });
});

describe("API key middleware", () => {
  it("rejects missing credentials", async () => {
    const response = await request(app).get("/protected");
    expect(response.status).toBe(401);
  });

  it("accepts the configured API key", async () => {
    const response = await request(app)
      .get("/protected")
      .set("x-api-key", "dev-secret-key-123");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
