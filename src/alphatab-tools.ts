import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  compileMusicScoreSpec,
  exportMusicScoreSpecAsGp,
  importScoreBytes,
  MAX_IMPORT_BYTES
} from "./alphatab-conversion.js";
import { MusicScoreSpecV1Schema } from "./music-score-spec/index.js";
import {
  InMemoryScoreStore,
  MAX_SCORE_TTL_SECONDS,
  MIN_SCORE_TTL_SECONDS,
  ScoreStoreError
} from "./score-store.js";
import { UI_RESOURCE_URI } from "./ui-resource.js";

export const SCORE_DOWNLOAD_ROUTE_PREFIX = "/downloads/scores";

const ScoreIdSchema = z.string().min(16).max(128);
const VersionSchema = z.number().int().positive();
const TimestampSchema = z.string().datetime();

export const CompiledScorePayloadSchema = z.object({
  id: z.string(),
  title: z.string(),
  format: z.literal("alphatex"),
  alphaTex: z.string(),
  tempo: z.number().int().positive(),
  timeSignature: z.string(),
  tuning: z.array(z.string()),
  bars: z.number().int().positive(),
  tracks: z.array(z.object({ id: z.string(), name: z.string() }).strict())
}).strict();

function textResult(text: string) {
  return [{ type: "text" as const, text }];
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true as const, content: textResult(message) };
}

function storedScore(store: InMemoryScoreStore, scoreId: string, version?: number) {
  try {
    return { success: true as const, value: store.get(scoreId, version) };
  } catch (error) {
    if (error instanceof ScoreStoreError) return { success: false as const, error };
    throw error;
  }
}

function safeExportName(title: string, extension: string): string {
  const stem = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "score";
  return `${stem}.${extension}`;
}

export function scoreDownloadPath(scoreId: string, version: number, format: "gp" | "alphatex"): string {
  return `${SCORE_DOWNLOAD_ROUTE_PREFIX}/${encodeURIComponent(scoreId)}/${version}/${format}`;
}

export function registerAlphaTabScoreTools(
  server: McpServer,
  store: InMemoryScoreStore,
  assetOrigin: string
): void {
  const storedInput = z.object({
    scoreId: ScoreIdSchema,
    version: VersionSchema.optional()
  }).strict();

  server.registerTool(
    "compile_score",
    {
      title: "Compile a stored score for alphaTab",
      description: "Compile a validated stored MusicScoreSpec version into deterministic alphaTex for inspection or rendering.",
      inputSchema: storedInput,
      outputSchema: CompiledScorePayloadSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ scoreId, version }) => {
      const stored = storedScore(store, scoreId, version);
      if (!stored.success) return toolError(stored.error);
      const compiled = compileMusicScoreSpec(stored.value.score);
      if (!compiled.success) return toolError(new Error(compiled.diagnostics.map((item) => item.message).join("; ")));
      return {
        structuredContent: { ...compiled.payload },
        content: textResult(`Compiled ${compiled.payload.title} as deterministic alphaTex.`)
      };
    }
  );

  registerAppTool(
    server,
    "render_score",
    {
      title: "Render and play a stored score",
      description: "Open a validated stored MusicScoreSpec version in the interactive alphaTab notation and playback component.",
      inputSchema: storedInput,
      outputSchema: CompiledScorePayloadSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: {
        ui: { resourceUri: UI_RESOURCE_URI },
        "openai/toolInvocation/invoking": "Preparing the score…",
        "openai/toolInvocation/invoked": "Score ready."
      }
    },
    async ({ scoreId, version }) => {
      const stored = storedScore(store, scoreId, version);
      if (!stored.success) return toolError(stored.error);
      const compiled = compileMusicScoreSpec(stored.value.score);
      if (!compiled.success) return toolError(new Error(compiled.diagnostics.map((item) => item.message).join("; ")));
      return {
        structuredContent: { ...compiled.payload },
        content: textResult(`Rendered ${compiled.payload.title}, version ${stored.value.version}.`)
      };
    }
  );

  server.registerTool(
    "export_score",
    {
      title: "Export a stored score",
      description: "Export a stored score version as Guitar Pro 7+ or alphaTex and return a local download link.",
      inputSchema: storedInput.extend({ format: z.enum(["gp", "alphatex"]) }).strict(),
      outputSchema: z.object({
        filename: z.string(),
        mimeType: z.string(),
        downloadUrl: z.string().url(),
        bytes: z.number().int().positive(),
        scoreId: ScoreIdSchema,
        version: VersionSchema
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ scoreId, version, format }) => {
      const stored = storedScore(store, scoreId, version);
      if (!stored.success) return toolError(stored.error);
      const compiled = compileMusicScoreSpec(stored.value.score);
      if (!compiled.success) return toolError(new Error(compiled.diagnostics.map((item) => item.message).join("; ")));
      const bytes = format === "gp"
        ? exportMusicScoreSpecAsGp(stored.value.score)
        : new TextEncoder().encode(compiled.payload.alphaTex);
      const filename = safeExportName(compiled.payload.title, format === "gp" ? "gp" : "alphatex");
      const mimeType = format === "gp" ? "application/octet-stream" : "text/plain; charset=utf-8";
      const downloadUrl = new URL(
        scoreDownloadPath(scoreId, stored.value.version, format),
        assetOrigin
      ).href;
      return {
        structuredContent: {
          filename,
          mimeType,
          downloadUrl,
          bytes: bytes.byteLength,
          scoreId,
          version: stored.value.version
        },
        content: [{
          type: "resource_link" as const,
          uri: downloadUrl,
          name: filename,
          description: `${format === "gp" ? "Guitar Pro 7+" : "alphaTex"} export for ${compiled.payload.title}.`,
          mimeType,
          size: bytes.byteLength
        }]
      };
    }
  );

  server.registerTool(
    "import_score",
    {
      title: "Import a score file",
      description: "Import a base64-encoded Guitar Pro, MusicXML, or alphaTex file into a validated expiring MusicScoreSpec session.",
      inputSchema: z.object({
        filename: z.string().min(1).max(180),
        dataBase64: z.string().min(1).max(Math.ceil(MAX_IMPORT_BYTES * 4 / 3) + 8),
        ttlSeconds: z.number().int().min(MIN_SCORE_TTL_SECONDS).max(MAX_SCORE_TTL_SECONDS).optional()
      }).strict(),
      outputSchema: z.object({
        status: z.enum(["imported", "invalid"]),
        message: z.string().optional(),
        sourceFormat: z.string().optional(),
        warnings: z.array(z.string()),
        scoreId: ScoreIdSchema.optional(),
        version: VersionSchema.optional(),
        createdAt: TimestampSchema.optional(),
        expiresAt: TimestampSchema.optional(),
        score: MusicScoreSpecV1Schema.optional()
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ filename, dataBase64, ttlSeconds }) => {
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(Buffer.from(dataBase64, "base64"));
      } catch {
        return {
          structuredContent: { status: "invalid" as const, message: "The file is not valid base64.", warnings: [] },
          content: textResult("The score was not imported because its file data is invalid.")
        };
      }
      const imported = importScoreBytes(filename, bytes);
      if (!imported.success) {
        return {
          structuredContent: { status: "invalid" as const, message: imported.message, warnings: [] },
          content: textResult(imported.message)
        };
      }
      const stored = store.create(imported.score, ttlSeconds);
      return {
        structuredContent: {
          status: "imported" as const,
          sourceFormat: imported.sourceFormat,
          warnings: imported.warnings,
          ...stored
        },
        content: textResult(`Imported ${stored.score.metadata.title} as score ${stored.scoreId}, version 1.`)
      };
    }
  );
}
