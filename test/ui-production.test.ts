import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(resolve("web", "component.ts"), "utf8");

describe("the production score component", () => {
  it("exposes the complete playback and track control surface", () => {
    for (const control of [
      "play", "stop", "count-in", "loop", "metronome", "mute", "solo",
      "export-svg", "export-gp", "fullscreen"
    ]) {
      expect(component).toContain(`data-action="${control}"`);
    }
    for (const control of ["tracks", "speed", "zoom", "layout", "notation", "file"]) {
      expect(component).toContain(`data-control="${control}"`);
    }
    expect(component).not.toContain('data-control="seek"');
    expect(component).not.toContain('data-control="volume"');
    expect(component).not.toContain("masterVolume");
    expect(component).toContain('.controls-right { flex: 0 0 auto; overflow: visible; }');
  });

  it("mirrors the official alphaTab player layout and behavior", () => {
    expect(component).toContain('class="player-bar"');
    expect(component).toContain('class="drawer"');
    expect(component).toContain('data-action="tracks-panel"');
    expect(component).toContain('data-action="settings-panel"');
    expect(component).toContain('data-panel="tracks"');
    expect(component).toContain('data-panel="settings"');
    expect(component).not.toContain('class="sidebar"');
    expect(component).not.toContain("Media Sync");
    expect(component).toContain("playerPositionChanged");
    expect(component).toContain("countInVolume");
    expect(component).not.toContain("alphaTabApi.print()");
    expect(component).toContain("buildScoreSvg");
    expect(component).toContain('mimeType: "image/svg+xml"');
    expect(component).toContain("settings.display.scale");
    expect(component).toContain("settings.display.layoutMode");
    expect(component).toContain('shell.classList.toggle("horizontal-layout", isHorizontal)');
    expect(component).toContain('.shell.horizontal-layout .viewport { overflow-x: auto; }');
    expect(component).toContain('overflow-x: hidden; overflow-y: auto;');
    expect(component).toContain("showStandardNotation");
    expect(component).toContain("showTablature");
    expect(component).toContain("Notes + TAB");
  });

  it("uses host-backed export without sandbox navigation fallbacks", () => {
    expect(component).toContain("updateModelContext");
    expect(component).toContain("downloadFile");
    expect(component).toContain("requestDisplayMode");
    expect(component).toContain('availableDisplayModes: ["inline", "fullscreen"]');
    expect(component).toContain("onhostcontextchanged");
    expect(component).toContain("autoResize: false");
    expect(component).toContain("sendSizeChanged({ height })");
    expect(component).toContain("event.stopPropagation()");
    expect(component).toContain('currentDisplayMode === "fullscreen" ? "inline" : "fullscreen"');
    expect(component).toContain("onteardown");
    expect(component).toContain("window.openai");
    expect(component).not.toContain("downloadBlob");
    expect(component).toContain("getHostCapabilities()?.downloadFile");
    expect(component).toContain("downloadWithMcpHost");
    expect(component).toContain("getHostCapabilities()?.message?.image");
    expect(component).toContain("getHostCapabilities()?.message?.text");
    expect(component).toContain("sendMessage");
    expect(component).toContain("sendFollowUpMessage");
    expect(component).toContain('name: "store_svg_export"');
    expect(component).toContain("navigator.clipboard.writeText");
    expect(component).toContain("presentDownloadFallback");
    expect(component).toContain("requestScoreExportInChat");
    expect(component).toContain("call export_score for scoreId");
    expect(component).toContain("embed the returned file directly in chat as one Markdown image");
    expect(component).toContain("![SVG score](/absolute/path/from-localPath.svg)");
    expect(component).toContain("exactly one clickable Markdown link to the Guitar Pro file");
    expect(component).toContain("Do not regenerate or rerender the score");
    expect(component).toContain("Send SVG to chat");
    expect(component).toContain("Send GP to chat");
    expect(component).toContain("showExportLink");
    expect(component).toContain("openLink");
    expect(component).toContain("uploadFile");
    expect(component).toContain("getFileDownloadUrl");
    expect(component).not.toContain("deliverServerArtifact");
    expect(component).toContain("!appBridge && !window.openai");
    expect(component).not.toContain("SVG export is unavailable in this host version");
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
    expect(component).toContain("startRenderTimeout(api)");
    expect(component).toContain("The score is taking too long to render.");
    expect(component).toContain('data-action="retry-render"');
  });

  it("keeps unrelated nested tool results from replacing the score UI", () => {
    expect(component).toContain('app.addEventListener("toolresult"');
    expect(component).toContain("if (isScorePayload(result.structuredContent))");
    expect(component).not.toContain("The host returned invalid score data.");
    expect(component).not.toContain("Invalid score data");
  });

  it("resynchronizes iframe size and display mode after host lifecycle changes", () => {
    expect(component).toContain("hostResizeObserver = new ResizeObserver(syncHostFrameHeight)");
    expect(component).toContain('window.addEventListener("focus", syncDisplayModeFromHost)');
    expect(component).toContain('document.addEventListener("visibilitychange"');
    expect(component).toContain("window.setTimeout(syncDisplayModeFromHost, 0)");
    expect(component).toContain('currentDisplayMode !== "inline"');
  });

  it("labels interactive controls for assistive technology", () => {
    expect(component).toContain('aria-label="Playback controls"');
    expect(component).toContain('aria-live="polite"');
    expect(component).toContain('aria-pressed="false"');
    expect(component).toContain('aria-expanded="false"');
  });
});
