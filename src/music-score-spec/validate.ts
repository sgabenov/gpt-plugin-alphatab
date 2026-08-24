import type { z } from "zod";
import {
  MusicScoreSpecV1Schema,
  type MusicScoreSpecV1,
  type Note,
  type Pitch
} from "./schema.js";
import {
  addRational,
  compareRational,
  durationAsRational,
  rational,
  rationalToString,
  type Rational
} from "./rational.js";

export type DiagnosticSeverity = "error" | "warning";

export type DiagnosticCode =
  | "SCHEMA_INVALID"
  | "DUPLICATE_ID"
  | "BAR_INDEX_SEQUENCE"
  | "VOICE_INDEX_DUPLICATE"
  | "RHYTHM_UNDERFULL"
  | "RHYTHM_OVERFULL"
  | "TUNING_STRING_DUPLICATE"
  | "TUNING_STRING_GAP"
  | "TRACK_RANGE_INVALID"
  | "PITCH_OUT_OF_RANGE"
  | "FRET_OUT_OF_RANGE"
  | "STRING_NOT_IN_TUNING"
  | "STRING_FRET_PITCH_MISMATCH"
  | "REFERENCE_NOT_FOUND"
  | "REFERENCE_DIFFERENT_VOICE"
  | "REFERENCE_NOT_ADJACENT"
  | "TIE_PITCH_MISMATCH"
  | "HAMMER_ON_DIRECTION"
  | "PULL_OFF_DIRECTION"
  | "TEMPO_BAR_NOT_FOUND"
  | "TEMPO_OFFSET_OUT_OF_RANGE";

export interface ScoreDiagnostic {
  severity: DiagnosticSeverity;
  code: DiagnosticCode;
  path: string;
  message: string;
  entityId?: string;
  expected?: string | number;
  actual?: string | number;
}

export type ScoreValidationResult =
  | { success: true; score: MusicScoreSpecV1; diagnostics: ScoreDiagnostic[] }
  | { success: false; diagnostics: ScoreDiagnostic[] };

interface NoteLocation {
  note: Note;
  path: string;
  voiceId: string;
  eventIndex: number;
}

const STEP_SEMITONES: Record<Pitch["step"], number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};

export function pitchToMidi(pitch: Pitch): number {
  return (pitch.octave + 1) * 12 + STEP_SEMITONES[pitch.step] + pitch.alter;
}

function issuePath(path: PropertyKey[]): string {
  if (path.length === 0) return "/";
  return `/${path.map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

function schemaDiagnostics(error: z.ZodError): ScoreDiagnostic[] {
  return error.issues.map((issue) => ({
    severity: "error",
    code: "SCHEMA_INVALID",
    path: issuePath(issue.path),
    message: issue.message
  }));
}

function addId(
  seen: Map<string, string>,
  diagnostics: ScoreDiagnostic[],
  id: string,
  path: string
): void {
  const previousPath = seen.get(id);
  if (previousPath) {
    diagnostics.push({
      severity: "error",
      code: "DUPLICATE_ID",
      path,
      entityId: id,
      message: `Entity ID ${id} is already used at ${previousPath}.`,
      expected: "globally unique entity ID",
      actual: id
    });
  } else {
    seen.set(id, path);
  }
}

function sumVoiceDuration(events: MusicScoreSpecV1["tracks"][number]["bars"][number]["voices"][number]["events"]): Rational {
  return events.reduce(
    (total, event) => addRational(total, durationAsRational(event.duration)),
    rational(0n, 1n)
  );
}

function connectionTargets(note: Note): Array<{
  kind: "tie" | "hammer-on" | "pull-off" | "slide";
  id: string;
}> {
  const targets: Array<{ kind: "tie" | "hammer-on" | "pull-off" | "slide"; id: string }> = [];
  if (note.techniques.tieTo) targets.push({ kind: "tie", id: note.techniques.tieTo });
  if (note.techniques.hammerOnTo) targets.push({ kind: "hammer-on", id: note.techniques.hammerOnTo });
  if (note.techniques.pullOffTo) targets.push({ kind: "pull-off", id: note.techniques.pullOffTo });
  if (note.techniques.slideTo) targets.push({ kind: "slide", id: note.techniques.slideTo.noteId });
  return targets;
}

export function validateMusicScoreSpec(input: unknown): ScoreValidationResult {
  const parsed = MusicScoreSpecV1Schema.safeParse(input);
  if (!parsed.success) return { success: false, diagnostics: schemaDiagnostics(parsed.error) };

  const score = parsed.data;
  const diagnostics: ScoreDiagnostic[] = [];
  const ids = new Map<string, string>();
  const bars = new Map<string, { path: string; duration: Rational }>();
  const notes = new Map<string, NoteLocation>();

  addId(ids, diagnostics, score.id, "/id");

  for (const [trackIndex, track] of score.tracks.entries()) {
    const trackPath = `/tracks/${trackIndex}`;
    addId(ids, diagnostics, track.id, `${trackPath}/id`);

    const rangeMin = pitchToMidi(track.range.min);
    const rangeMax = pitchToMidi(track.range.max);
    if (rangeMin > rangeMax) {
      diagnostics.push({
        severity: "error",
        code: "TRACK_RANGE_INVALID",
        path: `${trackPath}/range`,
        entityId: track.id,
        message: "Track minimum pitch must not exceed its maximum pitch.",
        expected: `<= ${rangeMax}`,
        actual: rangeMin
      });
    }

    const tuningByString = new Map<number, number>();
    for (const [tuningIndex, tuning] of track.tuning.entries()) {
      const path = `${trackPath}/tuning/${tuningIndex}/string`;
      if (tuningByString.has(tuning.string)) {
        diagnostics.push({
          severity: "error",
          code: "TUNING_STRING_DUPLICATE",
          path,
          entityId: track.id,
          message: `String ${tuning.string} appears more than once in the tuning.`
        });
      }
      tuningByString.set(tuning.string, pitchToMidi(tuning.pitch));
    }
    for (let stringNumber = 1; stringNumber <= track.tuning.length; stringNumber += 1) {
      if (!tuningByString.has(stringNumber)) {
        diagnostics.push({
          severity: "error",
          code: "TUNING_STRING_GAP",
          path: `${trackPath}/tuning`,
          entityId: track.id,
          message: `Tuning must contain contiguous string numbers; string ${stringNumber} is missing.`
        });
      }
    }

    const voiceIndexesByBar = new Map<string, Set<number>>();
    for (const [barArrayIndex, bar] of track.bars.entries()) {
      const barPath = `${trackPath}/bars/${barArrayIndex}`;
      addId(ids, diagnostics, bar.id, `${barPath}/id`);
      if (bar.index !== barArrayIndex) {
        diagnostics.push({
          severity: "error",
          code: "BAR_INDEX_SEQUENCE",
          path: `${barPath}/index`,
          entityId: bar.id,
          message: "Bar indexes must start at zero and follow array order without gaps.",
          expected: barArrayIndex,
          actual: bar.index
        });
      }

      const barDuration = rational(BigInt(bar.timeSignature.numerator), BigInt(bar.timeSignature.denominator));
      bars.set(bar.id, { path: barPath, duration: barDuration });
      const voiceIndexes = new Set<number>();
      voiceIndexesByBar.set(bar.id, voiceIndexes);

      for (const [voiceIndex, voice] of bar.voices.entries()) {
        const voicePath = `${barPath}/voices/${voiceIndex}`;
        addId(ids, diagnostics, voice.id, `${voicePath}/id`);
        if (voiceIndexes.has(voice.index)) {
          diagnostics.push({
            severity: "error",
            code: "VOICE_INDEX_DUPLICATE",
            path: `${voicePath}/index`,
            entityId: voice.id,
            message: `Voice index ${voice.index} appears more than once in bar ${bar.id}.`
          });
        }
        voiceIndexes.add(voice.index);

        const voiceDuration = sumVoiceDuration(voice.events);
        const rhythmComparison = compareRational(voiceDuration, barDuration);
        if (rhythmComparison !== 0) {
          diagnostics.push({
            severity: "error",
            code: rhythmComparison < 0 ? "RHYTHM_UNDERFULL" : "RHYTHM_OVERFULL",
            path: `${voicePath}/events`,
            entityId: voice.id,
            message: `Voice duration ${rationalToString(voiceDuration)} does not equal bar duration ${rationalToString(barDuration)}.`,
            expected: rationalToString(barDuration),
            actual: rationalToString(voiceDuration)
          });
        }

        for (const [eventIndex, event] of voice.events.entries()) {
          const eventPath = `${voicePath}/events/${eventIndex}`;
          addId(ids, diagnostics, event.id, `${eventPath}/id`);
          if (event.kind !== "notes") continue;
          for (const [noteIndex, note] of event.notes.entries()) {
            const notePath = `${eventPath}/notes/${noteIndex}`;
            addId(ids, diagnostics, note.id, `${notePath}/id`);
            if (!notes.has(note.id)) notes.set(note.id, { note, path: notePath, voiceId: voice.id, eventIndex });

            const midi = pitchToMidi(note.pitch);
            if (midi < rangeMin || midi > rangeMax) {
              diagnostics.push({
                severity: "error",
                code: "PITCH_OUT_OF_RANGE",
                path: `${notePath}/pitch`,
                entityId: note.id,
                message: `Note pitch ${midi} is outside track range ${rangeMin}-${rangeMax}.`,
                expected: `${rangeMin}-${rangeMax}`,
                actual: midi
              });
            }

            if (note.string !== undefined && note.fret !== undefined) {
              if (note.fret > track.fretCount) {
                diagnostics.push({
                  severity: "error",
                  code: "FRET_OUT_OF_RANGE",
                  path: `${notePath}/fret`,
                  entityId: note.id,
                  message: `Fret ${note.fret} exceeds the track fret count ${track.fretCount}.`,
                  expected: `0-${track.fretCount}`,
                  actual: note.fret
                });
              }
              const openPitch = tuningByString.get(note.string);
              if (openPitch === undefined) {
                diagnostics.push({
                  severity: "error",
                  code: "STRING_NOT_IN_TUNING",
                  path: `${notePath}/string`,
                  entityId: note.id,
                  message: `String ${note.string} is not present in the track tuning.`
                });
              } else {
                const expectedMidi = openPitch + track.capo + note.fret;
                if (expectedMidi !== midi) {
                  diagnostics.push({
                    severity: "error",
                    code: "STRING_FRET_PITCH_MISMATCH",
                    path: `${notePath}/pitch`,
                    entityId: note.id,
                    message: "Written pitch does not match tuning, capo, string, and fret.",
                    expected: expectedMidi,
                    actual: midi
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  for (const [tempoIndex, tempo] of score.tempoEvents.entries()) {
    const path = `/tempoEvents/${tempoIndex}`;
    addId(ids, diagnostics, tempo.id, `${path}/id`);
    const bar = bars.get(tempo.position.barId);
    if (!bar) {
      diagnostics.push({
        severity: "error",
        code: "TEMPO_BAR_NOT_FOUND",
        path: `${path}/position/barId`,
        entityId: tempo.id,
        message: `Tempo event references unknown bar ${tempo.position.barId}.`
      });
    } else {
      const offset = rational(BigInt(tempo.position.offset.numerator), BigInt(tempo.position.offset.denominator));
      if (compareRational(offset, bar.duration) >= 0) {
        diagnostics.push({
          severity: "error",
          code: "TEMPO_OFFSET_OUT_OF_RANGE",
          path: `${path}/position/offset`,
          entityId: tempo.id,
          message: "Tempo offset must be inside the referenced bar.",
          expected: `< ${rationalToString(bar.duration)}`,
          actual: rationalToString(offset)
        });
      }
    }
  }

  for (const location of notes.values()) {
    for (const target of connectionTargets(location.note)) {
      const connectionPaths = {
        tie: "tieTo",
        "hammer-on": "hammerOnTo",
        "pull-off": "pullOffTo",
        slide: "slideTo/noteId"
      } as const;
      const referencePath = `${location.path}/techniques/${connectionPaths[target.kind]}`;
      const destination = notes.get(target.id);
      if (!destination) {
        diagnostics.push({
          severity: "error",
          code: "REFERENCE_NOT_FOUND",
          path: referencePath,
          entityId: location.note.id,
          message: `${target.kind} references unknown note ${target.id}.`
        });
        continue;
      }
      if (destination.voiceId !== location.voiceId) {
        diagnostics.push({
          severity: "error",
          code: "REFERENCE_DIFFERENT_VOICE",
          path: referencePath,
          entityId: location.note.id,
          message: `${target.kind} target must be in the same voice.`
        });
      }
      if (destination.eventIndex !== location.eventIndex + 1) {
        diagnostics.push({
          severity: "error",
          code: "REFERENCE_NOT_ADJACENT",
          path: referencePath,
          entityId: location.note.id,
          message: `${target.kind} target must be in the immediately following timed event.`
        });
      }
      const sourceMidi = pitchToMidi(location.note.pitch);
      const targetMidi = pitchToMidi(destination.note.pitch);
      if (target.kind === "tie" && sourceMidi !== targetMidi) {
        diagnostics.push({
          severity: "error",
          code: "TIE_PITCH_MISMATCH",
          path: referencePath,
          entityId: location.note.id,
          message: "A tie must connect notes with the same pitch."
        });
      }
      if (target.kind === "hammer-on" && targetMidi <= sourceMidi) {
        diagnostics.push({
          severity: "error",
          code: "HAMMER_ON_DIRECTION",
          path: referencePath,
          entityId: location.note.id,
          message: "A hammer-on target must be higher than its source note."
        });
      }
      if (target.kind === "pull-off" && targetMidi >= sourceMidi) {
        diagnostics.push({
          severity: "error",
          code: "PULL_OFF_DIRECTION",
          path: referencePath,
          entityId: location.note.id,
          message: "A pull-off target must be lower than its source note."
        });
      }
    }
  }

  return diagnostics.some((diagnostic) => diagnostic.severity === "error")
    ? { success: false, diagnostics }
    : { success: true, score, diagnostics };
}
