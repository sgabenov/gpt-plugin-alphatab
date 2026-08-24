import { describe, expect, it } from "vitest";
import {
  ALPHATAB_VERSION,
  buildAssetUrls,
  buildUiHtml,
  buildPreviewCsp,
  UI_RESOURCE_URI
} from "../src/ui-resource.js";

describe("the MCP Apps UI resource", () => {
  it("uses a versioned URI and pinned local alphaTab resources", () => {
    expect(UI_RESOURCE_URI).toContain("v1.html");
    const assets = buildAssetUrls("http://127.0.0.1:9000/path-is-ignored");
    expect(assets.runtimeUrl).toBe(
      `http://127.0.0.1:9000/assets/alphatab/${ALPHATAB_VERSION}/runtime/alphaTab.min.js`
    );
    expect(assets.soundFontUrl).toContain(`/alphatab/${ALPHATAB_VERSION}/soundfont/sonivox.sf2`);
  });

  it("embeds the UI module and escapes closing script tags", () => {
    const html = buildUiHtml('console.log("ok");</script>', "http://127.0.0.1:9000");
    expect(html).toContain('console.log("ok")');
    expect(html).toContain("<\\/script>");
    expect(html).toContain("http://127.0.0.1:9000/assets/alphatab/1.8.4/runtime/alphaTab.min.js");
    expect(html).not.toContain("cdn.jsdelivr.net");
  });

  it("injects preview score data only when requested", () => {
    const standardHtml = buildUiHtml("", "http://127.0.0.1:9000");
    const previewHtml = buildUiHtml("", "http://127.0.0.1:9000", {
      title: "Preview </script> score"
    });

    expect(standardHtml).not.toContain("__ALPHATAB_PREVIEW_SCORE__");
    expect(previewHtml).toContain("__ALPHATAB_PREVIEW_SCORE__");
    expect(previewHtml).toContain("Preview \\u003c/script> score");
  });

  it("builds a restrictive preview CSP for local alphaTab resources", () => {
    const csp = buildPreviewCsp("http://127.0.0.1:9000");

    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'unsafe-inline' http://127.0.0.1:9000");
    expect(csp).toContain("worker-src http://127.0.0.1:9000 blob:");
    expect(csp).toContain("font-src http://127.0.0.1:9000");
    expect(csp).not.toContain("https://cdn.jsdelivr.net");
  });
});
