import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  MusicScoreSpecV1Schema,
  validateMusicScoreSpec
} from "./music-score-spec/index.js";
import {
  MAX_SCORE_TTL_SECONDS,
  MIN_SCORE_TTL_SECONDS,
  ScoreStoreError,
  type ScoreStore,
  type StoredScoreVersion
} from "./score-store.js";
import {
  ScoreArtifactBundleSchema,
  ScoreArtifactStore,
  type ScoreArtifactBundle
} from "./score-artifacts.js";

const ScoreIdSchema = z.string().min(16).max(128);
const ScoreVersionSchema = z.number().int().positive();
const TimestampSchema = z.string().datetime();

const DiagnosticSchema = z
  .object({
    severity: z.enum(["error", "warning"]),
    code: z.string().min(1),
    path: z.string().startsWith("/"),
    message: z.string().min(1),
    entityId: z.string().optional(),
    expected: z.union([z.string(), z.number()]).optional(),
    actual: z.union([z.string(), z.number()]).optional()
  })
  .strict();

const StoredVersionSchema = z.object({
  scoreId: ScoreIdSchema,
  version: ScoreVersionSchema,
  createdAt: TimestampSchema,
  expiresAt: TimestampSchema,
  score: MusicScoreSpecV1Schema
}).strict();

const OptionalStoredVersionShape = StoredVersionSchema.partial().shape;

function textResult(text: string) {
  return [{ type: "text" as const, text }];
}

function storedResult(
  version: StoredScoreVersion,
  artifacts?: ScoreArtifactBundle,
  artifactWarning?: string
) {
  return {
    structuredContent: { ...version, artifacts, artifactWarning },
    content: textResult(
      `Stored score ${version.score.id} as opaque score ID ${version.scoreId}, version ${version.version}; ` +
      `${artifacts ? "persistent artifacts are ready; " : ""}` +
      `the score session expires at ${version.expiresAt}.` +
      (artifactWarning ? ` Artifact warning: ${artifactWarning}` : "")
    )
  };
}

function materializeArtifacts(
  artifactStore: ScoreArtifactStore,
  version: StoredScoreVersion
): { artifacts?: ScoreArtifactBundle; artifactWarning?: string } {
  try {
    return { artifacts: artifactStore.materialize(version) };
  } catch (error) {
    return { artifactWarning: error instanceof Error ? error.message : String(error) };
  }
}

function storeErrorResult(error: ScoreStoreError) {
  const status = {
    SCORE_NOT_FOUND: "not_found",
    VERSION_CONFLICT: "version_conflict",
    STABLE_ID_MISMATCH: "stable_id_mismatch"
  } as const;
  return {
    structuredContent: {
      status: status[error.code],
      message: error.message,
      currentVersion: error.currentVersion
    },
    content: textResult(error.message)
  };
}

export function registerScoreTools(
  server: McpServer,
  store: ScoreStore,
  artifactStore: ScoreArtifactStore
): void {
  server.registerTool(
    "validate_score",
    {
      title: "Validate a MusicScoreSpec score",
      description:
        "Validate MusicScoreSpec v1 structure, rhythm, pitches, stable IDs, and cross-entity references without storing the score.",
      inputSchema: z.object({ score: MusicScoreSpecV1Schema }).strict(),
      outputSchema: z.object({
        valid: z.boolean(),
        diagnostics: z.array(DiagnosticSchema),
        score: MusicScoreSpecV1Schema.optional()
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ score }) => {
      const validation = validateMusicScoreSpec(score);
      return {
        structuredContent: {
          valid: validation.success,
          diagnostics: validation.diagnostics,
          score: validation.success ? validation.score : undefined
        },
        content: textResult(
          validation.success
            ? "The score is valid MusicScoreSpec v1."
            : `The score is invalid: ${validation.diagnostics.length} diagnostic(s) returned.`
        )
      };
    }
  );

  server.registerTool(
    "create_score",
    {
      title: "Create a versioned score",
      description:
        "Validate and store a MusicScoreSpec v1 score in an expiring session, generate persistent GP, alphaTex, and SVG artifacts, and return an opaque score ID with immutable version 1. For every user request to create, compose, or generate a score, call render_score with the returned scoreId and version before the final response unless the user explicitly requests no inline player.",
      inputSchema: z.object({
        score: MusicScoreSpecV1Schema,
        ttlSeconds: z
          .number()
          .int()
          .min(MIN_SCORE_TTL_SECONDS)
          .max(MAX_SCORE_TTL_SECONDS)
          .optional()
      }).strict(),
      outputSchema: z.object({
        status: z.enum(["created", "invalid"]),
        ...OptionalStoredVersionShape,
        diagnostics: z.array(DiagnosticSchema),
        artifacts: ScoreArtifactBundleSchema.optional(),
        artifactWarning: z.string().optional()
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ score, ttlSeconds }) => {
      const validation = validateMusicScoreSpec(score);
      if (!validation.success) {
        return {
          structuredContent: {
            status: "invalid" as const,
            diagnostics: validation.diagnostics
          },
          content: textResult(
            `The score was not stored because validation returned ${validation.diagnostics.length} diagnostic(s).`
          )
        };
      }
      const version = store.create(validation.score, ttlSeconds);
      const artifactResult = materializeArtifacts(artifactStore, version);
      return {
        structuredContent: {
          status: "created" as const,
          ...version,
          diagnostics: validation.diagnostics,
          ...artifactResult
        },
        content: storedResult(version, artifactResult.artifacts, artifactResult.artifactWarning).content
      };
    }
  );

  server.registerTool(
    "get_score",
    {
      title: "Get a stored score version",
      description:
        "Read the latest or a specific immutable version of a score from expiring session storage using its opaque score ID.",
      inputSchema: z.object({
        scoreId: ScoreIdSchema,
        version: ScoreVersionSchema.optional()
      }).strict(),
      outputSchema: z.object({
        status: z.enum(["found", "not_found"]),
        ...OptionalStoredVersionShape,
        message: z.string().optional(),
        currentVersion: ScoreVersionSchema.optional()
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ scoreId, version }) => {
      try {
        const stored = store.get(scoreId, version);
        return {
          structuredContent: { status: "found" as const, ...stored },
          content: textResult(
            `Loaded score ${stored.score.id}, immutable version ${stored.version}; it expires at ${stored.expiresAt}.`
          )
        };
      } catch (error) {
        if (!(error instanceof ScoreStoreError)) throw error;
        const result = storeErrorResult(error);
        return {
          ...result,
          structuredContent: { status: "not_found" as const, message: error.message, currentVersion: error.currentVersion }
        };
      }
    }
  );

  server.registerTool(
    "update_score",
    {
      title: "Create a new score version",
      description:
        "Validate and append an immutable score version with persistent GP, alphaTex, and SVG artifacts. The stable MusicScoreSpec score ID must not change, and expectedVersion provides optimistic concurrency. After the final successful revision, call render_score with the returned scoreId and version before the final response unless the user explicitly requests no inline player.",
      inputSchema: z.object({
        scoreId: ScoreIdSchema,
        expectedVersion: ScoreVersionSchema,
        score: MusicScoreSpecV1Schema
      }).strict(),
      outputSchema: z.object({
        status: z.enum(["updated", "invalid", "not_found", "version_conflict", "stable_id_mismatch"]),
        ...OptionalStoredVersionShape,
        diagnostics: z.array(DiagnosticSchema).optional(),
        message: z.string().optional(),
        currentVersion: ScoreVersionSchema.optional(),
        artifacts: ScoreArtifactBundleSchema.optional(),
        artifactWarning: z.string().optional()
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ scoreId, expectedVersion, score }) => {
      const validation = validateMusicScoreSpec(score);
      if (!validation.success) {
        return {
          structuredContent: {
            status: "invalid" as const,
            diagnostics: validation.diagnostics
          },
          content: textResult(
            `The score was not updated because validation returned ${validation.diagnostics.length} diagnostic(s).`
          )
        };
      }
      try {
        const version = store.update(scoreId, expectedVersion, validation.score);
        const artifactResult = materializeArtifacts(artifactStore, version);
        return {
          structuredContent: {
            status: "updated" as const,
            ...version,
            diagnostics: validation.diagnostics,
            ...artifactResult
          },
          content: storedResult(version, artifactResult.artifacts, artifactResult.artifactWarning).content
        };
      } catch (error) {
        if (!(error instanceof ScoreStoreError)) throw error;
        return storeErrorResult(error);
      }
    }
  );
}
