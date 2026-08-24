# MusicScoreSpec v1

`MusicScoreSpec` is the canonical, editable source of truth between an LLM request, deterministic validation, alphaTab compilation, storage, and export.

The machine-readable contract is [`schemas/music-score-spec-v1.schema.json`](../schemas/music-score-spec-v1.schema.json). The runtime implementation and inferred TypeScript types live in [`src/music-score-spec/schema.ts`](../src/music-score-spec/schema.ts).

## Design principles

- Musical meaning is stored as structured data, never as rendered notation.
- Validation never pads, truncates, splits, reorders, respells, or otherwise repairs events silently.
- Rhythmic calculations use exact rational arithmetic.
- Defaults normalize cosmetic omissions, but never invent pitches, durations, references, or guitar positions.
- All schema objects are strict; unknown fields fail structural validation.
- Diagnostics use stable codes and JSON Pointer paths suitable for LLM correction loops.

## Entity hierarchy

```text
MusicScoreSpec
├── metadata
├── tempoEvents
└── tracks
    ├── tuning and playable range
    └── bars
        └── voices
            └── events
                ├── rest
                └── notes
                    └── note
                        └── techniques and note references
```

An event has one duration. A `notes` event contains one or more simultaneous notes, so a chord does not duplicate rhythmic data. Each voice must fill every bar exactly.

## Stable IDs

Every score, tempo event, track, bar, voice, event, and note has a globally unique kebab-case ID. IDs are identity, not array indexes:

- array order defines musical order;
- `index` records the zero-based bar or voice position and is validated against its container;
- migrations must preserve existing IDs;
- editing an entity must not replace its ID;
- copied entities must receive new IDs before validation;
- note-to-note techniques refer to note IDs, never array positions.

## Pitch, tuning, and fret convention

Pitch uses scientific pitch notation: `C4` is MIDI 60. Accidentals are stored as `alter` values from -2 through 2.

Guitar string numbers follow the common player convention: string 1 is the highest-pitched string. Tuning entries are explicit `{ string, pitch }` pairs and must contain contiguous numbers from 1 through the tuning length.

When `string` and `fret` are present on a note, both are required and the validator enforces:

```text
written MIDI pitch = open-string MIDI pitch + capo + fret
```

The note must also remain within the track range and the fret must not exceed `fretCount`.

## Rhythm

Supported base values are whole, half, quarter, eighth, 16th, and 32nd notes, with zero to two dots and an optional tuplet ratio.

Each voice duration is compared exactly to `timeSignature.numerator / timeSignature.denominator`. Underfull and overfull bars are errors. Pickup bars are intentionally outside v1; they require an explicit future schema revision rather than implicit incomplete-bar behavior.

## MVP guitar techniques

The v1 note model covers:

- palm mute and let ring;
- dead notes;
- natural, artificial, and pinch harmonics;
- slight and wide vibrato;
- normal and heavy accents;
- bends expressed in semitones;
- ties, hammer-ons, pull-offs, and shift/legato slides.

Connection techniques target a stable note ID in the immediately following timed event of the same voice. Ties require equal pitch, hammer-ons require an ascending target, and pull-offs require a descending target.

## Validation result

`validateMusicScoreSpec(input)` returns one of:

```ts
{ success: true, score: MusicScoreSpecV1, diagnostics: ScoreDiagnostic[] }
{ success: false, diagnostics: ScoreDiagnostic[] }
```

Each diagnostic contains:

- `severity`: `error` or `warning`;
- `code`: a stable machine-readable category;
- `path`: JSON Pointer to the failing field;
- `message`: concise developer-facing detail;
- optional `entityId`, `expected`, and `actual` values.

Structural failures use `SCHEMA_INVALID`. Semantic codes cover duplicate IDs, rhythm, bar/voice ordering, pitch range, tuning, frets, string/fret pitch consistency, tempo positions, and note references.

## Versioning and migrations

`schemaVersion` follows semantic versioning:

- patch: clarification or validation fix that does not change accepted data shape;
- minor: backward-compatible optional fields or enum values;
- major: incompatible shape or semantic changes.

`migrateMusicScoreSpec` is the only supported migration entrypoint. It currently supports:

| From | To | Behavior |
| --- | --- | --- |
| `0.1.0` | `1.0.0` | Moves `title` into metadata, converts the root tempo into a referenced tempo event, preserves track/bar/voice/event/note IDs, applies explicit defaults, and validates the result |
| `1.0.0` | `1.0.0` | Normalizes defaults and validates without changing entity order or IDs |

Unsupported versions fail with structured diagnostics. Migrations must be one-way, deterministic, idempotent after reaching the current version, and covered by fixtures.

## Schema workflow

Generate the committed JSON Schema after changing the Zod contract:

```bash
npm run schema:generate
```

`npm run check` fails when the committed schema is stale.

