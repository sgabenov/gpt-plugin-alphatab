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
    expect(UI_RESOURCE_URI).toContain("v16.html");
    const assets = buildAssetUrls("http://127.0.0.1:9000/path-is-ignored");
    expect(assets.runtimeUrl).toBe(
      `http://127.0.0.1:9000/assets/alphatab/${ALPHATAB_VERSION}/runtime/alphaTab.min.js`
    );
    expect(assets.soundFontUrl).toContain(`/alphatab/${ALPHATAB_VERSION}/soundfont/sonivox.sf2`);
  });

  it("embeds the UI module and escapes closing script tags", () => {
    const html = buildUiHtml(
      'console.log("ok");</script>',
      "http://127.0.0.1:9000",
      undefined,
      'window.alphaTab = {};</script>',
      {
        smuflFontWoff2Base64: "Zm9udA==",
        soundFontBase64: "c291bmRmb250"
      }
    );
    expect(html).toContain('console.log("ok")');
    expect(html).toContain("window.alphaTab = {}");
    expect(html).toContain("<\\/script>");
    expect(html).toContain("http://127.0.0.1:9000/assets/alphatab/1.8.4/runtime/alphaTab.min.js");
    expect(html).not.toContain('<script src="http://127.0.0.1:9000');
    expect(html).not.toContain("cdn.jsdelivr.net");
    expect(html).toContain('"smuflFontWoff2Base64":"Zm9udA=="');
    expect(html).toContain('"alphaTabRuntimeBase64":"d2luZG93LmFscGhhVGFiID0ge307PC9zY3JpcHQ+"');
    expect(html).toContain('"soundFontBase64":"c291bmRmb250"');
  });

  it("injects preview score data only when requested", () => {
    const embeddedAssets = {
      smuflFontWoff2Base64: "Zm9udA==",
      soundFontBase64: "c291bmRmb250"
    };
    const standardHtml = buildUiHtml("", "http://127.0.0.1:9000", undefined, "", embeddedAssets);
    const previewHtml = buildUiHtml("", "http://127.0.0.1:9000", {
      title: "Preview </script> score"
    }, "", embeddedAssets);

    expect(standardHtml).not.toContain("__ALPHATAB_PREVIEW_SCORE__");
    expect(previewHtml).toContain("__ALPHATAB_PREVIEW_SCORE__");
    expect(previewHtml).toContain("Preview \\u003c/script> score");
  });

  it("builds a restrictive preview CSP for local alphaTab resources", () => {
    const csp = buildPreviewCsp("http://127.0.0.1:9000");

    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'unsafe-inline' blob:");
    expect(csp).not.toContain("script-src 'unsafe-inline' blob: data:");
    expect(csp).toContain("worker-src http://127.0.0.1:9000 blob:");
    expect(csp).toContain("font-src 'self' blob:");
    expect(csp).not.toContain("https://cdn.jsdelivr.net");
  });
});
