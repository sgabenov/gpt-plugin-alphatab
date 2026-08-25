import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  compileMusicScoreSpec,
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
import {
  generatedExportDownloadPath,
  InMemoryGeneratedExportStore,
  MAX_GENERATED_EXPORT_BYTES
} from "./generated-export-store.js";
import {
  ScoreArtifactBundleSchema,
  ScoreArtifactStore,
  type ScoreArtifactBundle
} from "./score-artifacts.js";

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
  tracks: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
  scoreId: ScoreIdSchema.optional(),
  version: VersionSchema.optional()
}).strict();

const RenderedScorePayloadSchema = CompiledScorePayloadSchema.extend({
  artifacts: ScoreArtifactBundleSchema.optional(),
  artifactWarning: z.string().optional()
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

export function scoreDownloadPath(scoreId: string, version: number, format: "gp" | "alphatex" | "svg"): string {
  return `${SCORE_DOWNLOAD_ROUTE_PREFIX}/${encodeURIComponent(scoreId)}/${version}/${format}`;
}

export function registerAlphaTabScoreTools(
  server: McpServer,
  store: InMemoryScoreStore,
  assetOrigin: string,
  generatedExportStore: InMemoryGeneratedExportStore,
  artifactStore: ScoreArtifactStore
): void {
  const storedInput = z.object({
    scoreId: ScoreIdSchema,
    version: VersionSchema.optional()
  }).strict();

  server.registerTool(
    "compile_score",
    {
      title: "Compile a stored score for alphaTab",
      description: "Compile a validated stored MusicScoreSpec version into deterministic alphaTex for textual inspection. This headless tool does not open the inline player and must not replace render_score after score creation.",
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
        structuredContent: {
          ...compiled.payload,
          scoreId: stored.value.scoreId,
          version: stored.value.version
        },
        content: textResult(`Compiled ${compiled.payload.title} as deterministic alphaTex.`)
      };
    }
  );

  registerAppTool(
    server,
    "render_score",
    {
      title: "Render and play a stored score",
      description: "Open the final stored score in the inline alphaTab notation and playback component. After every successful create_score request, always call this tool with the returned scoreId and version before the final response, including workflows that also call export_score.",
      inputSchema: storedInput,
      outputSchema: RenderedScorePayloadSchema,
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
      let artifacts: ScoreArtifactBundle | undefined;
      let artifactWarning: string | undefined;
      try {
        artifacts = artifactStore.materialize(stored.value);
      } catch (error) {
        artifactWarning = error instanceof Error ? error.message : String(error);
      }
      return {
        structuredContent: {
          ...compiled.payload,
          scoreId: stored.value.scoreId,
          version: stored.value.version,
          artifacts,
          artifactWarning
        },
        content: textResult(
          artifacts
            ? `Rendered ${compiled.payload.title}, version ${stored.value.version}. The interactive player is the complete user-facing response.`
            : `Rendered ${compiled.payload.title}, version ${stored.value.version}. Artifact generation failed: ${artifactWarning}`
        )
      };
    }
  );

  registerAppTool(
    server,
    "store_svg_export",
    {
      title: "Store a rendered SVG export",
      description: "Temporarily store an SVG generated by the score UI and return a download URL.",
      inputSchema: z.object({
        filename: z.string().min(1).max(180),
        dataBase64: z.string().min(1).max(Math.ceil(MAX_GENERATED_EXPORT_BYTES * 4 / 3) + 8)
      }).strict(),
      outputSchema: z.object({
        filename: z.string(),
        mimeType: z.literal("image/svg+xml"),
        downloadUrl: z.string().url(),
        bytes: z.number().int().positive(),
        expiresAt: TimestampSchema
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      },
      _meta: {
        ui: { visibility: ["app"] }
      }
    },
    async ({ filename, dataBase64 }) => {
      const bytes = Uint8Array.from(Buffer.from(dataBase64, "base64"));
      const prefix = new TextDecoder().decode(bytes.subarray(0, 512));
      if (!prefix.includes("<svg")) return toolError(new Error("The generated file is not valid SVG markup."));
      try {
        const item = generatedExportStore.create(filename, "image/svg+xml", bytes);
        const downloadUrl = new URL(generatedExportDownloadPath(item.id), assetOrigin).href;
        return {
          structuredContent: {
            filename: item.filename,
            mimeType: "image/svg+xml" as const,
            downloadUrl,
            bytes: item.bytes.byteLength,
            expiresAt: item.expiresAt
          },
          content: textResult(`Stored ${item.filename} temporarily for download.`)
        };
      } catch (error) {
        return toolError(error);
      }
    }
  );

  server.registerTool(
    "export_score",
    {
      title: "Export a stored score",
      description: "Return a persistent server-generated Guitar Pro 7+, alphaTex, or SVG artifact for a stored score version. This tool does not open the inline player; score-creation workflows must also call render_score before the final response.",
      inputSchema: storedInput.extend({ format: z.enum(["gp", "alphatex", "svg"]) }).strict(),
      outputSchema: z.object({
        format: z.enum(["gp", "alphatex", "svg"]),
        filename: z.string(),
        mimeType: z.string(),
        localPath: z.string(),
        fileUri: z.string(),
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
      let artifact;
      try {
        artifact = artifactStore.materialize(stored.value)[format];
      } catch (error) {
        return toolError(error);
      }
      const downloadUrl = new URL(
        scoreDownloadPath(scoreId, stored.value.version, format),
        assetOrigin
      ).href;
      return {
        structuredContent: {
          format,
          filename: artifact.filename,
          mimeType: artifact.mimeType,
          localPath: artifact.localPath,
          fileUri: artifact.fileUri,
          downloadUrl,
          bytes: artifact.bytes,
          scoreId,
          version: stored.value.version
        },
        content: [
          ...textResult(`Exported ${artifact.filename} to ${artifact.localPath}.`),
          {
            type: "resource_link" as const,
            uri: artifact.fileUri,
            name: artifact.filename,
            description: `Persistent ${format} artifact for the stored score version.`,
            mimeType: artifact.mimeType,
            size: artifact.bytes
          }
        ]
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
