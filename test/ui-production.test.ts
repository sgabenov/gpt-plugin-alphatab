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
    for (const control of ["track", "tempo", "file"]) {
      expect(component).toContain(`data-control="${control}"`);
    }
    expect(component).not.toContain('data-control="seek"');
    expect(component).not.toContain('data-control="volume"');
    expect(component).not.toContain("masterVolume");
  });

  it("uses standard MCP Apps capabilities with compatibility fallbacks", () => {
    expect(component).toContain("updateModelContext");
    expect(component).toContain("downloadFile");
    expect(component).toContain("requestDisplayMode");
    expect(component).toContain('availableDisplayModes: ["inline", "fullscreen"]');
    expect(component).toContain("onhostcontextchanged");
    expect(component).toContain('currentDisplayMode === "fullscreen" ? "inline" : "fullscreen"');
    expect(component).toContain("onteardown");
    expect(component).toContain("window.openai");
    expect(component).toContain("downloadBlob");
  });

  it("uses the inline alphaTab runtime without a rendering worker", () => {
    expect(component).toContain("new window.alphaTab.AlphaTabApi");
    expect(component).toContain("useWorkers: false");
    expect(component).toContain("alphaTabRuntimeBase64");
    expect(component).toContain("smuflFontWoff2Base64");
    expect(component).toContain("soundFontBase64");
    expect(component).toContain("WebAudioScriptProcessor");
    expect(component).not.toContain("outputMode: window.alphaTab.PlayerOutputMode.WebAudioAudioWorklets");
    expect(component).toContain('URL.createObjectURL(new Blob(');
    expect(component).not.toContain('data:application/javascript;base64');
    expect(component).toContain('type: "font/woff2"');
    expect(component).toContain("loadSoundFont(base64ToBytes");
  });

  it("rerenders when the MCP Apps host assigns the iframe its final width", () => {
    expect(component).toContain("new ResizeObserver");
    expect(component).toContain("api.render()");
    expect(component).toContain("Score ready — press Play to initialize audio");
    expect(component).toContain("Audio initialization timed out — press Play to retry");
    expect(component).toContain("startPlaybackTimeout(alphaTabApi)");
  });

  it("labels interactive controls for assistive technology", () => {
    expect(component).toContain('aria-label="Playback controls"');
    expect(component).toContain('aria-live="polite"');
    expect(component).toContain('aria-pressed="false"');
  });
});
