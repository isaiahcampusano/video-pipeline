import { describe, expect, it } from "vitest";
import { videoRetryDelay } from "../../src/services/queueService.js";

describe("videoRetryDelay", () => {
  it("uses the requested fivefold retry schedule", () => {
    expect(videoRetryDelay(1)).toBe(5_000);
    expect(videoRetryDelay(2)).toBe(25_000);
    expect(videoRetryDelay(3)).toBe(125_000);
  });
});
