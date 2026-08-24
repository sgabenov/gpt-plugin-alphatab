import { describe, expect, it } from "vitest";
import { importer } from "@coderline/alphatab";
import { DEMO_SCORE, summarizeDemoScore } from "../src/demo-score.js";

describe("the Phase 0 demo score", () => {
  it("has a deterministic two-bar alphaTex fixture", () => {
    expect(DEMO_SCORE.id).toBe("phase-0-drop-d-riff");
    expect(DEMO_SCORE.bars).toBe(2);
    expect(DEMO_SCORE.alphaTex).toContain('\\staff {score tabs}');
    expect(DEMO_SCORE.alphaTex.split("|")).toHaveLength(3);
  });

  it("provides a model-readable summary", () => {
    expect(summarizeDemoScore()).toContain("120 BPM");
    expect(summarizeDemoScore()).toContain("D2 A2 D3 G3 B3 E4");
  });

  it("is parsed by the pinned alphaTab importer", () => {
    const score = importer.ScoreLoader.loadScoreFromBytes(new TextEncoder().encode(DEMO_SCORE.alphaTex));

    expect(score.title).toBe(DEMO_SCORE.title);
    expect(score.tracks).toHaveLength(1);
    expect(score.masterBars).toHaveLength(DEMO_SCORE.bars);
  });
});
