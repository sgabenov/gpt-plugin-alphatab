import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEGACY_MUSIC_SCORE_SPEC_VERSION,
  migrateMusicScoreSpec
} from "../src/music-score-spec/migrate.js";
import { durationAsRational, rationalToString } from "../src/music-score-spec/rational.js";
import { MUSIC_SCORE_SPEC_VERSION } from "../src/music-score-spec/schema.js";
import { pitchToMidi, validateMusicScoreSpec } from "../src/music-score-spec/validate.js";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve("test", "fixtures", name), "utf8"));
}

describe("MusicScoreSpec v1", () => {
  it("normalizes and validates the canonical Drop D fixture", () => {
    const result = validateMusicScoreSpec(fixture("music-score-v1-valid.json"));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.score.schemaVersion).toBe(MUSIC_SCORE_SPEC_VERSION);
    expect(result.score.tracks[0]?.capo).toBe(0);
    expect(result.score.tracks[0]?.fretCount).toBe(24);
    const firstEvent = result.score.tracks[0]?.bars[0]?.voices[0]?.events[0];
    expect(firstEvent?.duration.dots).toBe(0);
    if (firstEvent?.kind === "notes") {
      expect(firstEvent.notes[0]?.velocity).toBe(96);
      expect(firstEvent.notes[1]?.techniques).toMatchObject({
        palmMute: false,
        letRing: false,
        deadNote: false
      });
    }
  });

  it("returns structured semantic diagnostics for the invalid fixture", () => {
    const result = validateMusicScoreSpec(fixture("music-score-v1-invalid.json"));

    expect(result.success).toBe(false);
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "DUPLICATE_ID",
        "BAR_INDEX_SEQUENCE",
        "RHYTHM_UNDERFULL",
        "TUNING_STRING_DUPLICATE",
        "TUNING_STRING_GAP",
        "TRACK_RANGE_INVALID",
        "PITCH_OUT_OF_RANGE",
        "FRET_OUT_OF_RANGE",
        "STRING_FRET_PITCH_MISMATCH",
        "REFERENCE_NOT_FOUND",
        "TEMPO_BAR_NOT_FOUND"
      ])
    );
    expect(result.diagnostics.every((diagnostic) => diagnostic.path.startsWith("/"))).toBe(true);
  });

  it("uses exact rational arithmetic for dotted and tuplet durations", () => {
    expect(
      rationalToString(durationAsRational({ value: "quarter", dots: 1 }))
    ).toBe("3/8");
    expect(
      rationalToString(
        durationAsRational({ value: "eighth", dots: 0, tuplet: { actual: 3, normal: 2 } })
      )
    ).toBe("1/12");
  });

  it("uses scientific pitch spelling for MIDI validation", () => {
    expect(pitchToMidi({ step: "C", octave: 4, alter: 0 })).toBe(60);
    expect(pitchToMidi({ step: "F", octave: 2, alter: 0 })).toBe(41);
  });

  it("migrates legacy metadata without replacing stable musical IDs", () => {
    const current = fixture("music-score-v1-valid.json") as Record<string, unknown>;
    const legacy = {
      schemaVersion: LEGACY_MUSIC_SCORE_SPEC_VERSION,
      id: current.id,
      title: "Migrated Drop D Study",
      tempo: 132,
      tracks: current.tracks
    };
    const result = migrateMusicScoreSpec(legacy);

    expect(result.success).toBe(true);
    expect(result.migratedFrom).toBe(LEGACY_MUSIC_SCORE_SPEC_VERSION);
    if (!result.success) return;
    expect(result.score.metadata.title).toBe("Migrated Drop D Study");
    expect(result.score.tempoEvents[0]?.bpm).toBe(132);
    expect(result.score.tracks[0]?.id).toBe("drop-d-study-track-1");
    expect(result.score.tracks[0]?.bars[0]?.id).toBe("drop-d-study-track-1-bar-1");
  });

  it("rejects unsupported schema versions with structural diagnostics", () => {
    const result = migrateMusicScoreSpec({ schemaVersion: "2.0.0" });

    expect(result.success).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("SCHEMA_INVALID");
  });
});

