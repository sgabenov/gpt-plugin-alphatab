import { z } from "zod";
import { MusicScoreSpecV1Schema, TrackSchema, type MusicScoreSpecV1 } from "./schema.js";
import { validateMusicScoreSpec, type ScoreValidationResult } from "./validate.js";

export const LEGACY_MUSIC_SCORE_SPEC_VERSION = "0.1.0" as const;

const LegacyMusicScoreSpecV0_1Schema = z
  .object({
    schemaVersion: z.literal(LEGACY_MUSIC_SCORE_SPEC_VERSION),
    id: z.string(),
    title: z.string(),
    tempo: z.number().int(),
    tracks: z.array(TrackSchema)
  })
  .strict();

export type MigrationResult = ScoreValidationResult & {
  migratedFrom?: typeof LEGACY_MUSIC_SCORE_SPEC_VERSION;
};

function migrateV0_1ToV1(input: z.infer<typeof LegacyMusicScoreSpecV0_1Schema>): MusicScoreSpecV1 {
  const firstBar = input.tracks[0]?.bars[0];
  if (!firstBar) throw new Error("Legacy score must contain at least one bar.");
  return MusicScoreSpecV1Schema.parse({
    schemaVersion: "1.0.0",
    id: input.id,
    metadata: { title: input.title },
    tempoEvents: [
      {
        id: `${input.id}-tempo-1`,
        position: { barId: firstBar.id, offset: { numerator: 0, denominator: 1 } },
        bpm: input.tempo
      }
    ],
    tracks: input.tracks
  });
}

export function migrateMusicScoreSpec(input: unknown): MigrationResult {
  const version = input && typeof input === "object" ? (input as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (version === "1.0.0") return validateMusicScoreSpec(input);
  if (version === LEGACY_MUSIC_SCORE_SPEC_VERSION) {
    const legacy = LegacyMusicScoreSpecV0_1Schema.safeParse(input);
    if (!legacy.success) return validateMusicScoreSpec(input);
    const validation = validateMusicScoreSpec(migrateV0_1ToV1(legacy.data));
    return { ...validation, migratedFrom: LEGACY_MUSIC_SCORE_SPEC_VERSION };
  }
  return validateMusicScoreSpec(input);
}
