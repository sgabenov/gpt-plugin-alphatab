import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileMusicScoreSpec,
  exportMusicScoreSpecAsGp,
  importScoreBytes,
  MAX_IMPORT_BYTES
} from "../src/alphatab-conversion.js";

function fixture(): unknown {
  return JSON.parse(
    readFileSync(resolve("test", "fixtures", "music-score-v1-valid.json"), "utf8")
  );
}

describe("MusicScoreSpec alphaTab conversion", () => {
  it("compiles deterministically to playable alphaTex", () => {
    const first = compileMusicScoreSpec(fixture());
    const second = compileMusicScoreSpec(fixture());

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) return;
    expect(first.payload.alphaTex).toBe(second.payload.alphaTex);
    expect(first.payload).toMatchObject({
      id: "drop-d-study",
      title: "Drop D Study",
      tempo: 120,
      timeSignature: "4/4",
      bars: 1
    });
    expect(first.payload.tuning).toEqual(["D2", "A2", "D3", "G3", "B3", "E4"]);
    expect(first.payload.alphaTex).toContain("\\tuning (E4 B3 G3 D3 A2 D2)");
    expect(first.payload.alphaTex).toContain("(0.6{pm} 0.5)");
    expect(first.nativeScore.tracks[0]?.staves[0]?.bars).toHaveLength(1);
  });

  it("exports GP7 and re-imports it without critical structural loss", () => {
    const bytes = exportMusicScoreSpecAsGp(fixture());
    const imported = importScoreBytes("drop-d-study.gp", bytes);

    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect(imported.success).toBe(true);
    if (!imported.success) return;
    expect(imported.score.metadata.title).toBe("Drop D Study");
    expect(imported.score.tracks).toHaveLength(1);
    expect(imported.score.tracks[0]?.bars).toHaveLength(1);
    expect(imported.score.tracks[0]?.tuning).toHaveLength(6);
    expect(imported.score.tracks[0]?.bars[0]?.voices[0]?.events).toHaveLength(4);
  });

  it("imports alphaTex through the same validated boundary", () => {
    const compiled = compileMusicScoreSpec(fixture());
    if (!compiled.success) throw new Error("Compilation failed.");
    const imported = importScoreBytes(
      "drop-d-study.alphatex",
      new TextEncoder().encode(compiled.payload.alphaTex)
    );

    expect(imported.success).toBe(true);
    if (!imported.success) return;
    expect(imported.sourceFormat).toBe("alphatex");
    expect(imported.score.metadata.title).toBe("Drop D Study");
  });

  it("imports MusicXML into the canonical score contract", () => {
    const imported = importScoreBytes(
      "simple.musicxml",
      readFileSync(resolve("test", "fixtures", "simple.musicxml"))
    );

    expect(imported.success).toBe(true);
    if (!imported.success) return;
    expect(imported.sourceFormat).toBe("musicxml");
    expect(imported.score.metadata.title).toBe("MusicXML Import Study");
    expect(imported.score.tracks[0]?.bars[0]?.voices[0]?.events).toHaveLength(4);
  });

  it("rejects unsafe filenames, unsupported formats, and oversized files", () => {
    expect(importScoreBytes("../score.gp", new Uint8Array())).toMatchObject({
      success: false,
      code: "FILE_INVALID"
    });
    expect(importScoreBytes("score.exe", new Uint8Array())).toMatchObject({
      success: false,
      code: "FORMAT_UNSUPPORTED"
    });
    expect(importScoreBytes("score.gp", new Uint8Array(MAX_IMPORT_BYTES + 1))).toMatchObject({
      success: false,
      code: "FILE_TOO_LARGE"
    });
  });
});
