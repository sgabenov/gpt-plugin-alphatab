import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const UI_RESOURCE_URI = "ui://alphatab/score-viewer-v1.html";
export const ALPHATAB_VERSION = "1.8.4";
export const ALPHATAB_ASSET_ROUTE = `/assets/alphatab/${ALPHATAB_VERSION}`;

export interface AlphaTabAssetUrls {
  origin: string;
  runtimeUrl: string;
  fontDirectory: string;
  soundFontUrl: string;
}

export function buildAssetUrls(assetBaseUrl: string): AlphaTabAssetUrls {
  const origin = new URL(assetBaseUrl).origin;
  const root = `${origin}${ALPHATAB_ASSET_ROUTE}`;
  return {
    origin,
    runtimeUrl: `${root}/runtime/alphaTab.min.js`,
    fontDirectory: `${root}/font/`,
    soundFontUrl: `${root}/soundfont/sonivox.sf2`
  };
}

export function buildPreviewCsp(assetBaseUrl: string): string {
  const { origin } = buildAssetUrls(assetBaseUrl);
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${origin}`,
    "style-src 'unsafe-inline'",
    `font-src ${origin}`,
    `connect-src ${origin}`,
    `worker-src ${origin} blob:`,
    `media-src ${origin} blob:`,
    `img-src ${origin} data: blob:`
  ].join("; ");
}

function escapeInlineModule(source: string): string {
  return source.replaceAll("</script", "<\\/script");
}

function serializeInlineData(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function loadUiBundle(cwd = process.cwd()): string {
  return readFileSync(resolve(cwd, "dist/ui/component.js"), "utf8");
}

export function buildUiHtml(
  uiBundle: string,
  assetBaseUrl = "http://127.0.0.1:8787",
  previewScore?: unknown
): string {
  const assets = buildAssetUrls(assetBaseUrl);
  const previewScript = previewScore
    ? `<script>window.__ALPHATAB_PREVIEW_SCORE__ = ${serializeInlineData(previewScore)};</script>`
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>alphaTab Score Viewer</title>
  </head>
  <body>
    <div id="app"></div>
    <script>window.__ALPHATAB_ASSETS__ = ${serializeInlineData(assets)};</script>
    ${previewScript}
    <script src="${assets.runtimeUrl}"></script>
    <script type="module">${escapeInlineModule(uiBundle)}</script>
  </body>
</html>`;
}
