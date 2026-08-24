import { z } from "zod";

export const MUSIC_SCORE_SPEC_VERSION = "1.0.0" as const;
export const ENTITY_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const EntityIdSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(ENTITY_ID_PATTERN, "Use a stable kebab-case entity ID.");

export const PitchSchema = z
  .object({
    step: z.enum(["C", "D", "E", "F", "G", "A", "B"]),
    octave: z.number().int().min(0).max(9),
    alter: z.number().int().min(-2).max(2).default(0)
  })
  .strict();

export const TimeSignatureSchema = z
  .object({
    numerator: z.number().int().min(1).max(32),
    denominator: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(4),
      z.literal(8),
      z.literal(16),
      z.literal(32)
    ])
  })
  .strict();

export const DurationSchema = z
  .object({
    value: z.enum(["whole", "half", "quarter", "eighth", "16th", "32nd"]),
    dots: z.number().int().min(0).max(2).default(0),
    tuplet: z
      .object({
        actual: z.number().int().min(2).max(16),
        normal: z.number().int().min(1).max(16)
      })
      .strict()
      .optional()
  })
  .strict();

export const NoteTechniquesSchema = z
  .object({
    palmMute: z.boolean().default(false),
    letRing: z.boolean().default(false),
    deadNote: z.boolean().default(false),
    harmonic: z.enum(["natural", "artificial", "pinch"]).optional(),
    vibrato: z.enum(["slight", "wide"]).optional(),
    accent: z.enum(["normal", "heavy"]).optional(),
    bend: z
      .object({
        semitones: z.number().min(-12).max(12)
      })
      .strict()
      .optional(),
    tieTo: EntityIdSchema.optional(),
    hammerOnTo: EntityIdSchema.optional(),
    pullOffTo: EntityIdSchema.optional(),
    slideTo: z
      .object({
        noteId: EntityIdSchema,
        type: z.enum(["shift", "legato"])
      })
      .strict()
      .optional()
  })
  .strict()
  .default({ palmMute: false, letRing: false, deadNote: false });

export const NoteSchema = z
  .object({
    id: EntityIdSchema,
    pitch: PitchSchema,
    string: z.number().int().min(1).max(12).optional(),
    fret: z.number().int().min(0).max(36).optional(),
    velocity: z.number().int().min(1).max(127).default(96),
    techniques: NoteTechniquesSchema
  })
  .strict()
  .superRefine((note, context) => {
    if ((note.string === undefined) !== (note.fret === undefined)) {
      context.addIssue({
        code: "custom",
        path: [note.string === undefined ? "string" : "fret"],
        message: "Guitar string and fret must be supplied together."
      });
    }
  });

export const NotesEventSchema = z
  .object({
    id: EntityIdSchema,
    kind: z.literal("notes"),
    duration: DurationSchema,
    notes: z.array(NoteSchema).min(1).max(12)
  })
  .strict();

export const RestEventSchema = z
  .object({
    id: EntityIdSchema,
    kind: z.literal("rest"),
    duration: DurationSchema
  })
  .strict();

export const VoiceEventSchema = z.discriminatedUnion("kind", [NotesEventSchema, RestEventSchema]);

export const VoiceSchema = z
  .object({
    id: EntityIdSchema,
    index: z.number().int().min(0).max(7),
    events: z.array(VoiceEventSchema).min(1)
  })
  .strict();

export const BarSchema = z
  .object({
    id: EntityIdSchema,
    index: z.number().int().min(0),
    timeSignature: TimeSignatureSchema,
    voices: z.array(VoiceSchema).min(1).max(8)
  })
  .strict();

export const TuningStringSchema = z
  .object({
    string: z.number().int().min(1).max(12),
    pitch: PitchSchema
  })
  .strict();

export const TrackSchema = z
  .object({
    id: EntityIdSchema,
    name: z.string().min(1).max(120),
    shortName: z.string().min(1).max(24).optional(),
    instrument: z
      .object({
        family: z.enum(["guitar", "bass", "other"]),
        midiProgram: z.number().int().min(0).max(127)
      })
      .strict(),
    tuning: z.array(TuningStringSchema).min(1).max(12),
    capo: z.number().int().min(0).max(24).default(0),
    fretCount: z.number().int().min(1).max(36).default(24),
    range: z
      .object({
        min: PitchSchema,
        max: PitchSchema
      })
      .strict(),
    bars: z.array(BarSchema).min(1)
  })
  .strict();

export const ScorePositionSchema = z
  .object({
    barId: EntityIdSchema,
    offset: z
      .object({
        numerator: z.number().int().min(0),
        denominator: z.number().int().min(1).max(128)
      })
      .strict()
  })
  .strict();

export const TempoEventSchema = z
  .object({
    id: EntityIdSchema,
    position: ScorePositionSchema,
    bpm: z.number().int().min(20).max(400)
  })
  .strict();

export const MusicScoreSpecV1Schema = z
  .object({
    schemaVersion: z.literal(MUSIC_SCORE_SPEC_VERSION),
    id: EntityIdSchema,
    metadata: z
      .object({
        title: z.string().min(1).max(200),
        subtitle: z.string().max(200).optional(),
        artist: z.string().max(200).optional(),
        album: z.string().max(200).optional(),
        composer: z.string().max(200).optional(),
        copyright: z.string().max(500).optional()
      })
      .strict(),
    tempoEvents: z.array(TempoEventSchema).min(1),
    tracks: z.array(TrackSchema).min(1).max(32)
  })
  .strict();

export type Pitch = z.infer<typeof PitchSchema>;
export type Duration = z.infer<typeof DurationSchema>;
export type Note = z.infer<typeof NoteSchema>;
export type VoiceEvent = z.infer<typeof VoiceEventSchema>;
export type Bar = z.infer<typeof BarSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type MusicScoreSpecV1 = z.infer<typeof MusicScoreSpecV1Schema>;

