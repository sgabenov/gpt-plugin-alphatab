import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const UI_RESOURCE_URI = "ui://alphatab/score-viewer-v16.html";
export const ALPHATAB_VERSION = "1.8.4";
export const ALPHATAB_ASSET_ROUTE = `/assets/alphatab/${ALPHATAB_VERSION}`;

export interface AlphaTabAssetUrls {
  origin: string;
  runtimeUrl: string;
  fontDirectory: string;
  soundFontUrl: string;
}

export interface AlphaTabEmbeddedAssets {
  smuflFontWoff2Base64: string;
  soundFontBase64: string;
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
    "script-src 'unsafe-inline' blob:",
    "style-src 'unsafe-inline'",
    "font-src 'self' blob:",
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

export function loadAlphaTabRuntime(cwd = process.cwd()): string {
  return readFileSync(
    resolve(cwd, "vendor", "alphatab", ALPHATAB_VERSION, "runtime", "alphaTab.min.js"),
    "utf8"
  );
}

export function loadAlphaTabEmbeddedAssets(cwd = process.cwd()): AlphaTabEmbeddedAssets {
  const assetRoot = resolve(cwd, "vendor", "alphatab", ALPHATAB_VERSION);
  const smuflFont = readFileSync(resolve(assetRoot, "font", "Bravura.woff2"));
  const soundFont = readFileSync(resolve(assetRoot, "soundfont", "sonivox.sf2"));
  return {
    smuflFontWoff2Base64: smuflFont.toString("base64"),
    soundFontBase64: soundFont.toString("base64")
  };
}

export function buildUiHtml(
  uiBundle: string,
  assetBaseUrl = "http://127.0.0.1:8787",
  previewScore?: unknown,
  alphaTabRuntime = loadAlphaTabRuntime(),
  embeddedAssets = loadAlphaTabEmbeddedAssets()
): string {
  const assets = {
    ...buildAssetUrls(assetBaseUrl),
    ...embeddedAssets,
    alphaTabRuntimeBase64: Buffer.from(alphaTabRuntime).toString("base64")
  };
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
    <script>${escapeInlineModule(alphaTabRuntime)}</script>
    <script type="module">${escapeInlineModule(uiBundle)}</script>
  </body>
</html>`;
}
