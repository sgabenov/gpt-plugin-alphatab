import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const UI_RESOURCE_URI = "ui://alphatab/score-viewer-v1.html";
export const ALPHATAB_VERSION = "1.8.4";
export const ALPHATAB_CDN_ORIGIN = "https://cdn.jsdelivr.net";
export const ALPHATAB_SCRIPT_URL = `${ALPHATAB_CDN_ORIGIN}/npm/@coderline/alphatab@${ALPHATAB_VERSION}/dist/alphaTab.min.js`;

function escapeInlineModule(source: string): string {
  return source.replaceAll("</script", "<\\/script");
}

export function loadUiBundle(cwd = process.cwd()): string {
  return readFileSync(resolve(cwd, "dist/ui/component.js"), "utf8");
}

export function buildUiHtml(uiBundle: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>alphaTab Score Viewer</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="${ALPHATAB_SCRIPT_URL}"></script>
    <script type="module">${escapeInlineModule(uiBundle)}</script>
  </body>
</html>`;
}
