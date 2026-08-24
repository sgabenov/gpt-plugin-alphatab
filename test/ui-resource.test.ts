import { describe, expect, it } from "vitest";
import { ALPHATAB_SCRIPT_URL, buildUiHtml, UI_RESOURCE_URI } from "../src/ui-resource.js";

describe("the MCP Apps UI resource", () => {
  it("uses a versioned URI and pinned alphaTab script", () => {
    expect(UI_RESOURCE_URI).toContain("v1.html");
    expect(ALPHATAB_SCRIPT_URL).toContain("@1.8.4/");
  });

  it("embeds the UI module and escapes closing script tags", () => {
    const html = buildUiHtml('console.log("ok");</script>');
    expect(html).toContain('console.log("ok")');
    expect(html).toContain("<\\/script>");
    expect(html).toContain(ALPHATAB_SCRIPT_URL);
  });
});
