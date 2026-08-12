import { describe, expect, it } from "vitest";
import { calculateChunkBounds } from "../../src/services/chunkService.js";

describe("calculateChunkBounds", () => {
  it("splits a video into time-based chunks and shortens the final chunk", () => {
    expect(calculateChunkBounds(25.5, 10)).toEqual([
      { index: 0, startSec: 0, endSec: 10, durationSec: 10 },
      { index: 1, startSec: 10, endSec: 20, durationSec: 10 },
      { index: 2, startSec: 20, endSec: 25.5, durationSec: 5.5 },
    ]);
  });

  it("returns no chunks for invalid durations", () => {
    expect(calculateChunkBounds(0, 10)).toEqual([]);
    expect(calculateChunkBounds(10, 0)).toEqual([]);
  });
});
