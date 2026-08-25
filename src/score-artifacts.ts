import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { Settings, rendering } from "@coderline/alphatab";
import { z } from "zod";
import {
  compileMusicScoreSpec,
  exportMusicScoreSpecAsGp
} from "./alphatab-conversion.js";
import type { StoredScoreVersion } from "./score-store.js";
import { loadAlphaTabEmbeddedAssets } from "./ui-resource.js";

export type ScoreArtifactFormat = "gp" | "alphatex" | "svg";

export interface ScoreArtifact {
  format: ScoreArtifactFormat;
  filename: string;
  mimeType: string;
  localPath: string;
  fileUri: string;
  bytes: number;
}

export interface ScoreArtifactBundle {
  directory: string;
  createdAt: string;
  gp: ScoreArtifact;
  alphatex: ScoreArtifact;
  svg: ScoreArtifact;
}

export const ScoreArtifactSchema = z.object({
  format: z.enum(["gp", "alphatex", "svg"]),
  filename: z.string(),
  mimeType: z.string(),
  localPath: z.string(),
  fileUri: z.string(),
  bytes: z.number().int().positive()
}).strict();

export const ScoreArtifactBundleSchema = z.object({
  directory: z.string(),
  createdAt: z.string().datetime(),
  gp: ScoreArtifactSchema,
  alphatex: ScoreArtifactSchema,
  svg: ScoreArtifactSchema
}).strict();

export interface ScoreArtifactStoreOptions {
  rootDirectory?: string;
  now?: () => number;
  renderWidth?: number;
}

function safeSegment(value: string, fallback: string, maxLength = 80): string {
  const safe = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return safe || fallback;
}

export function defaultScoreArtifactRoot(environment = process.env): string {
  const configured = environment.GUITARPRO_TAB_ARTIFACT_DIR;
  if (configured) return resolve(configured);
  const base = environment.CODEX_ARTIFACTS_DIR
    ? resolve(environment.CODEX_ARTIFACTS_DIR)
    : join(tmpdir(), "codex-artifacts");
  const thread = safeSegment(environment.CODEX_THREAD_ID || "local", "local", 128);
  return join(base, thread, "guitarpro-tab-composer");
}

function writeAtomically(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, bytes, { mode: 0o600 });
  renameSync(temporaryPath, path);
}

function combineSvgParts(
  parts: Array<{ x: number; y: number; width: number; height: number; svg: string }>,
  totalWidth: number,
  totalHeight: number,
  fontBase64: string
): string {
  const width = Math.max(1, Math.ceil(totalWidth));
  const height = Math.max(1, Math.ceil(totalHeight));
  const content = parts.map((part) => part.svg.replace(
    /^<svg\b/,
    `<svg x="${part.x}" y="${part.y}"`
  )).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>@font-face{font-family:alphaTab;src:url(data:font/woff2;base64,${fontBase64}) format('woff2')} .at{font:34px alphaTab;dominant-baseline:middle}</style>` +
    `<rect width="100%" height="100%" fill="white"/>${content}</svg>`;
}

function renderScoreAsSvg(score: StoredScoreVersion["score"], width: number): string {
  const compiled = compileMusicScoreSpec(score);
  if (!compiled.success) throw new Error(compiled.diagnostics.map((item) => item.message).join("; "));

  const settings = new Settings();
  settings.core.engine = "svg";
  settings.core.useWorkers = false;
  settings.core.enableLazyLoading = false;
  settings.display.scale = 1;
  const renderer = new rendering.ScoreRenderer(settings);
  renderer.width = width;
  const parts: Array<{ x: number; y: number; width: number; height: number; svg: string }> = [];
  let totalWidth = width;
  let totalHeight = 1;
  let renderingError: Error | undefined;
  renderer.partialRenderFinished.on((event) => {
    if (typeof event.renderResult !== "string") return;
    parts.push({
      x: event.x,
      y: event.y,
      width: event.width,
      height: event.height,
      svg: event.renderResult
    });
    totalWidth = Math.max(totalWidth, event.totalWidth, event.x + event.width);
    totalHeight = Math.max(totalHeight, event.totalHeight, event.y + event.height);
  });
  renderer.error.on((error) => {
    renderingError = error;
  });
  try {
    renderer.renderScore(
      compiled.nativeScore,
      compiled.nativeScore.tracks.map((track) => track.index)
    );
  } finally {
    renderer.destroy();
  }
  if (renderingError) throw renderingError;
  if (parts.length === 0) throw new Error("alphaTab did not produce SVG notation.");
  return combineSvgParts(
    parts,
    totalWidth,
    totalHeight,
    loadAlphaTabEmbeddedAssets().smuflFontWoff2Base64
  );
}

function artifactMetadata(
  format: ScoreArtifactFormat,
  filename: string,
  mimeType: string,
  localPath: string,
  bytes: Uint8Array
): ScoreArtifact {
  return {
    format,
    filename,
    mimeType,
    localPath,
    fileUri: pathToFileURL(localPath).href,
    bytes: bytes.byteLength
  };
}

export class ScoreArtifactStore {
  readonly #rootDirectory: string;
  readonly #now: () => number;
  readonly #renderWidth: number;
  readonly #bundles = new Map<string, ScoreArtifactBundle>();

  constructor(options: ScoreArtifactStoreOptions = {}) {
    this.#rootDirectory = options.rootDirectory ?? defaultScoreArtifactRoot();
    this.#now = options.now ?? Date.now;
    this.#renderWidth = options.renderWidth ?? 1200;
  }

  materialize(stored: StoredScoreVersion): ScoreArtifactBundle {
    const key = `${stored.scoreId}:${stored.version}`;
    const existing = this.#bundles.get(key);
    if (existing && [existing.gp, existing.alphatex, existing.svg].every((item) => existsSync(item.localPath))) {
      return structuredClone(existing);
    }

    const compiled = compileMusicScoreSpec(stored.score);
    if (!compiled.success) throw new Error(compiled.diagnostics.map((item) => item.message).join("; "));
    const stem = safeSegment(compiled.payload.title, compiled.payload.id);
    const directory = join(
      this.#rootDirectory,
      safeSegment(stored.scoreId, "score", 128),
      `v${stored.version}`
    );
    const gpBytes = exportMusicScoreSpecAsGp(stored.score);
    const alphaTexBytes = new TextEncoder().encode(compiled.payload.alphaTex);
    const svgBytes = new TextEncoder().encode(renderScoreAsSvg(stored.score, this.#renderWidth));
    const paths = {
      gp: join(directory, `${stem}.gp`),
      alphatex: join(directory, `${stem}.alphatex`),
      svg: join(directory, `${stem}.svg`)
    };
    writeAtomically(paths.gp, gpBytes);
    writeAtomically(paths.alphatex, alphaTexBytes);
    writeAtomically(paths.svg, svgBytes);

    const bundle: ScoreArtifactBundle = {
      directory,
      createdAt: new Date(this.#now()).toISOString(),
      gp: artifactMetadata("gp", `${stem}.gp`, "application/octet-stream", paths.gp, gpBytes),
      alphatex: artifactMetadata("alphatex", `${stem}.alphatex`, "text/plain; charset=utf-8", paths.alphatex, alphaTexBytes),
      svg: artifactMetadata("svg", `${stem}.svg`, "image/svg+xml", paths.svg, svgBytes)
    };
    this.#bundles.set(key, bundle);
    return structuredClone(bundle);
  }

  read(artifact: ScoreArtifact): Uint8Array {
    return Uint8Array.from(readFileSync(artifact.localPath));
  }
}
