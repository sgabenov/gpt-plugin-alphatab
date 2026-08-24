import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(resolve("web", "component.ts"), "utf8");

describe("the production score component", () => {
  it("exposes the complete playback and track control surface", () => {
    for (const control of [
      "play", "stop", "loop", "metronome", "mute", "solo", "export-gp", "fullscreen"
    ]) {
      expect(component).toContain(`data-action="${control}"`);
    }
    for (const control of ["track", "seek", "tempo", "volume", "file"]) {
      expect(component).toContain(`data-control="${control}"`);
    }
  });

  it("uses standard MCP Apps capabilities with compatibility fallbacks", () => {
    expect(component).toContain("updateModelContext");
    expect(component).toContain("downloadFile");
    expect(component).toContain("requestDisplayMode");
    expect(component).toContain("onteardown");
    expect(component).toContain("window.openai");
    expect(component).toContain("downloadBlob");
  });

  it("labels interactive controls for assistive technology", () => {
    expect(component).toContain('aria-label="Playback controls"');
    expect(component).toContain('aria-label="Playback position"');
    expect(component).toContain('aria-live="polite"');
    expect(component).toContain('aria-pressed="false"');
  });
});
