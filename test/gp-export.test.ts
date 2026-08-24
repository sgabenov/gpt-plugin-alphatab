import { importer } from "@coderline/alphatab";
import { describe, expect, it } from "vitest";
import { DEMO_SCORE } from "../src/demo-score.js";
import { DEMO_GP_FILENAME, exportDemoGp } from "../src/gp-export.js";

describe("the Phase 0 Guitar Pro export", () => {
  it("produces a deterministic Guitar Pro 7+ archive", () => {
    const first = exportDemoGp();
    const second = exportDemoGp();

    expect(DEMO_GP_FILENAME).toMatch(/\.gp$/);
    expect(first.slice(0, 4)).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
    expect(first).toEqual(second);
  });

  it("round-trips through the pinned alphaTab importer", () => {
    const score = importer.ScoreLoader.loadScoreFromBytes(exportDemoGp());

    expect(score.title).toBe(DEMO_SCORE.title);
    expect(score.masterBars).toHaveLength(DEMO_SCORE.bars);
    expect(score.tracks).toHaveLength(1);
  });
});
