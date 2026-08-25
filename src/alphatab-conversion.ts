import { exporter, importer, type model } from "@coderline/alphatab";
import {
  MUSIC_SCORE_SPEC_VERSION,
  type Duration,
  type MusicScoreSpecV1,
  type Note,
  type Pitch,
  type ScoreDiagnostic,
  validateMusicScoreSpec
} from "./music-score-spec/index.js";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const SUPPORTED_IMPORT_EXTENSIONS = [
  ".gp",
  ".gp3",
  ".gp4",
  ".gp5",
  ".gpx",
  ".musicxml",
  ".xml",
  ".alphatex",
  ".atex",
  ".txt"
] as const;

export interface CompiledScorePayload {
  id: string;
  title: string;
  format: "alphatex";
  alphaTex: string;
  tempo: number;
  timeSignature: string;
  tuning: string[];
  bars: number;
  tracks: Array<{ id: string; name: string }>;
  scoreId?: string;
  version?: number;
}

export type ScoreCompilationResult =
  | { success: true; payload: CompiledScorePayload; nativeScore: model.Score }
  | { success: false; diagnostics: ScoreDiagnostic[] };

export type ScoreImportResult =
  | { success: true; score: MusicScoreSpecV1; sourceFormat: string; warnings: string[] }
  | { success: false; code: "FILE_INVALID" | "FILE_TOO_LARGE" | "FORMAT_UNSUPPORTED"; message: string };

const DURATION_NUMBER: Record<Duration["value"], number> = {
  whole: 1,
  half: 2,
  quarter: 4,
  eighth: 8,
  "16th": 16,
  "32nd": 32
};

function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", " ")}"`;
}

function pitchText(pitch: Pitch): string {
  const accidental = pitch.alter > 0 ? "#".repeat(pitch.alter) : "b".repeat(-pitch.alter);
  return `${pitch.step}${accidental}${pitch.octave}`;
}

function noteProperties(note: Note, tieDestinations: Set<string>): string[] {
  const properties: string[] = [];
  const techniques = note.techniques;
  if (techniques.palmMute) properties.push("pm");
  if (techniques.letRing) properties.push("lr");
  if (techniques.deadNote) properties.push("x");
  if (techniques.harmonic === "natural") properties.push("nh");
  if (techniques.harmonic === "artificial") properties.push("ah 12");
  if (techniques.harmonic === "pinch") properties.push("ph 12");
  if (techniques.vibrato === "slight") properties.push("v");
  if (techniques.vibrato === "wide") properties.push("vw");
  if (techniques.accent === "normal") properties.push("ac");
  if (techniques.accent === "heavy") properties.push("hac");
  if (techniques.hammerOnTo || techniques.pullOffTo) properties.push("h");
  if (techniques.slideTo?.type === "shift") properties.push("ss");
  if (techniques.slideTo?.type === "legato") properties.push("sl");
  if (tieDestinations.has(note.id)) properties.push("t");
  if (techniques.bend) {
    const bendValue = Math.round(techniques.bend.semitones * 2);
    properties.push(`be (bend 0 0 60 ${bendValue})`);
  }
  return properties;
}

function beatProperties(duration: Duration, tempo?: number): string[] {
  const properties: string[] = [];
  if (duration.dots === 1) properties.push("d");
  if (duration.dots === 2) properties.push("dd");
  if (duration.tuplet) properties.push(`tu ${duration.tuplet.actual} ${duration.tuplet.normal}`);
  if (tempo !== undefined) properties.push(`tempo ${tempo}`);
  return properties;
}

function withProperties(value: string, properties: string[]): string {
  return properties.length === 0 ? value : `${value}{${properties.join(" ")}}`;
}

function eventText(
  event: MusicScoreSpecV1["tracks"][number]["bars"][number]["voices"][number]["events"][number],
  tieDestinations: Set<string>,
  tempo?: number
): string {
  const prefix = `:${DURATION_NUMBER[event.duration.value]}`;
  const beatEffects = beatProperties(event.duration, tempo);
  if (event.kind === "rest") return `${prefix} ${withProperties("r", beatEffects)}`;

  const notes = event.notes.map((note) => {
    const value = note.string !== undefined && note.fret !== undefined
      ? `${note.fret}.${note.string}`
      : pitchText(note.pitch);
    return withProperties(value, noteProperties(note, tieDestinations));
  });
  const value = notes.length === 1 ? notes[0]! : `(${notes.join(" ")})`;
  return `${prefix} ${withProperties(value, beatEffects)}`;
}

function eventOffsets(
  events: MusicScoreSpecV1["tracks"][number]["bars"][number]["voices"][number]["events"]
): string[] {
  let numerator = 0n;
  let denominator = 1n;
  const offsets: string[] = [];
  const base: Record<Duration["value"], [bigint, bigint]> = {
    whole: [1n, 1n],
    half: [1n, 2n],
    quarter: [1n, 4n],
    eighth: [1n, 8n],
    "16th": [1n, 16n],
    "32nd": [1n, 32n]
  };
  for (const event of events) {
    offsets.push(`${numerator}/${denominator}`);
    let [eventNumerator, eventDenominator] = base[event.duration.value];
    if (event.duration.dots === 1) {
      eventNumerator *= 3n;
      eventDenominator *= 2n;
    } else if (event.duration.dots === 2) {
      eventNumerator *= 7n;
      eventDenominator *= 4n;
    }
    if (event.duration.tuplet) {
      eventNumerator *= BigInt(event.duration.tuplet.normal);
      eventDenominator *= BigInt(event.duration.tuplet.actual);
    }
    numerator = numerator * eventDenominator + eventNumerator * denominator;
    denominator *= eventDenominator;
    const divisor = gcd(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
  }
  return offsets;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function compileAlphaTex(score: MusicScoreSpecV1): string {
  const lines: string[] = [`\\title ${quote(score.metadata.title)}`];
  if (score.metadata.subtitle) lines.push(`\\subtitle ${quote(score.metadata.subtitle)}`);
  if (score.metadata.artist) lines.push(`\\artist ${quote(score.metadata.artist)}`);
  if (score.metadata.album) lines.push(`\\album ${quote(score.metadata.album)}`);
  if (score.metadata.composer) lines.push(`\\music ${quote(score.metadata.composer)}`);
  if (score.metadata.copyright) lines.push(`\\copyright ${quote(score.metadata.copyright)}`);

  const tempoByPosition = new Map(
    score.tempoEvents.map((tempo) => [
      `${tempo.position.barId}:${tempo.position.offset.numerator}/${tempo.position.offset.denominator}`,
      tempo.bpm
    ])
  );
  const tieDestinations = new Set<string>();
  for (const track of score.tracks) {
    for (const bar of track.bars) {
      for (const voice of bar.voices) {
        for (const event of voice.events) {
          if (event.kind !== "notes") continue;
          for (const note of event.notes) if (note.techniques.tieTo) tieDestinations.add(note.techniques.tieTo);
        }
      }
    }
  }

  for (const track of score.tracks) {
    lines.push(`\\track ${quote(track.name)}`);
    lines.push(`\\instrument ${track.instrument.midiProgram}`);
    lines.push("\\staff {score tabs}");
    lines.push(`\\tuning (${[...track.tuning]
      .sort((left, right) => left.string - right.string)
      .map((entry) => pitchText(entry.pitch))
      .join(" ")})`);
    if (track.capo > 0) lines.push(`\\capo ${track.capo}`);
    lines.push(".");

    const maxVoices = Math.max(...track.bars.map((bar) => bar.voices.length));
    for (let voiceIndex = 0; voiceIndex < maxVoices; voiceIndex += 1) {
      if (voiceIndex > 0) lines.push("\\voice");
      for (const bar of track.bars) {
        const voice = bar.voices.find((candidate) => candidate.index === voiceIndex);
        if (!voice) continue;
        const offsets = eventOffsets(voice.events);
        const events = voice.events.map((event, index) => {
          const tempo = tempoByPosition.get(`${bar.id}:${offsets[index]}`);
          return eventText(event, tieDestinations, tempo);
        });
        lines.push(`\\ts (${bar.timeSignature.numerator} ${bar.timeSignature.denominator}) ${events.join(" ")} |`);
      }
    }
  }
  return lines.join("\n");
}

export function compileMusicScoreSpec(input: unknown): ScoreCompilationResult {
  const validation = validateMusicScoreSpec(input);
  if (!validation.success) return validation;
  const score = validation.score;
  const alphaTex = compileAlphaTex(score);
  try {
    const nativeScore = importer.ScoreLoader.loadAlphaTex(alphaTex);
    const firstTrack = score.tracks[0]!;
    const firstBar = firstTrack.bars[0]!;
    return {
      success: true,
      nativeScore,
      payload: {
        id: score.id,
        title: score.metadata.title,
        format: "alphatex",
        alphaTex,
        tempo: score.tempoEvents[0]!.bpm,
        timeSignature: `${firstBar.timeSignature.numerator}/${firstBar.timeSignature.denominator}`,
        tuning: [...firstTrack.tuning]
          .sort((left, right) => right.string - left.string)
          .map((entry) => pitchText(entry.pitch)),
        bars: Math.max(...score.tracks.map((track) => track.bars.length)),
        tracks: score.tracks.map((track) => ({ id: track.id, name: track.name }))
      }
    };
  } catch (error) {
    return {
      success: false,
      diagnostics: [{
        severity: "error",
        code: "SCHEMA_INVALID",
        path: "/",
        message: `alphaTab could not compile the validated score: ${error instanceof Error ? error.message : String(error)}`
      }]
    };
  }
}

export function exportMusicScoreSpecAsGp(input: unknown): Uint8Array {
  const compiled = compileMusicScoreSpec(input);
  if (!compiled.success) throw new Error(compiled.diagnostics.map((item) => item.message).join("; "));
  return new exporter.Gp7Exporter().export(compiled.nativeScore);
}

function safeBaseName(filename: string): string | undefined {
  const normalized = filename.normalize("NFKC");
  if (normalized.length < 1 || normalized.length > 180) return undefined;
  if (normalized.includes("/") || normalized.includes("\\") || normalized.includes("\0")) return undefined;
  return normalized;
}

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index < 0 ? "" : filename.slice(index).toLowerCase();
}

function slug(value: string, fallback: string): string {
  const result = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return result || fallback;
}

function importedText(value: string): string {
  return value.replace(/[\p{Zs}\t\r\n]+/gu, " ").trim();
}

function midiPitch(value: number): Pitch {
  const names: Array<[Pitch["step"], number]> = [
    ["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0], ["F", 0],
    ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0]
  ];
  const [step, alter] = names[((value % 12) + 12) % 12]!;
  return { step, alter, octave: Math.floor(value / 12) - 1 };
}

function importedDuration(beat: model.Beat): Duration | undefined {
  const values = new Map<number, Duration["value"]>([
    [1, "whole"], [2, "half"], [4, "quarter"], [8, "eighth"], [16, "16th"], [32, "32nd"]
  ]);
  const value = values.get(beat.duration as number);
  if (!value || beat.dots > 2) return undefined;
  const duration: Duration = { value, dots: beat.dots };
  if (beat.tupletNumerator > 0 && beat.tupletDenominator > 0) {
    duration.tuplet = { actual: beat.tupletNumerator, normal: beat.tupletDenominator };
  }
  return duration;
}

function scoreFromAlphaTab(nativeScore: model.Score): { score: MusicScoreSpecV1; warnings: string[] } {
  const warnings: string[] = [];
  const scoreId = slug(importedText(nativeScore.title), "imported-score");
  const tracks: MusicScoreSpecV1["tracks"] = [];
  for (const [trackIndex, nativeTrack] of nativeScore.tracks.slice(0, 32).entries()) {
    const staff = nativeTrack.staves[0];
    if (!staff) continue;
    const trackId = `${scoreId}-track-${trackIndex + 1}`;
    const tuning = staff.tuning.map((value, tuningIndex, values) => ({
      string: values.length - tuningIndex,
      pitch: midiPitch(value)
    })).sort((left, right) => left.string - right.string);
    const bars: MusicScoreSpecV1["tracks"][number]["bars"] = [];
    for (const [barIndex, nativeBar] of staff.bars.entries()) {
      const barId = `${trackId}-bar-${barIndex + 1}`;
      const voices: MusicScoreSpecV1["tracks"][number]["bars"][number]["voices"] = [];
      for (const [voiceIndex, nativeVoice] of nativeBar.voices.entries()) {
        const events: MusicScoreSpecV1["tracks"][number]["bars"][number]["voices"][number]["events"] = [];
        for (const [eventIndex, beat] of nativeVoice.beats.entries()) {
          if (beat.isEmpty) continue;
          const duration = importedDuration(beat);
          if (!duration) {
            warnings.push(`Skipped unsupported duration in track ${trackIndex + 1}, bar ${barIndex + 1}.`);
            continue;
          }
          const eventId = `${trackId}-bar-${barIndex + 1}-voice-${voiceIndex + 1}-event-${eventIndex + 1}`;
          if (beat.isRest || beat.notes.length === 0) {
            events.push({ id: eventId, kind: "rest", duration });
            continue;
          }
          events.push({
            id: eventId,
            kind: "notes",
            duration,
            notes: beat.notes.slice(0, 12).map((nativeNote, noteIndex) => ({
              id: `${eventId}-note-${noteIndex + 1}`,
              pitch: midiPitch(nativeNote.realValue),
              string: nativeNote.isStringed ? nativeNote.string : undefined,
              fret: nativeNote.isStringed ? nativeNote.fret : undefined,
              velocity: 96,
              techniques: {
                palmMute: nativeNote.isPalmMute,
                letRing: nativeNote.isLetRing,
                deadNote: nativeNote.isDead
              }
            }))
          });
        }
        if (events.length > 0) voices.push({
          id: `${barId}-voice-${voiceIndex + 1}`,
          index: voiceIndex,
          events
        });
      }
      if (voices.length === 0) continue;
      bars.push({
        id: barId,
        index: bars.length,
        timeSignature: {
          numerator: nativeBar.masterBar.timeSignatureNumerator,
          denominator: nativeBar.masterBar.timeSignatureDenominator as 1 | 2 | 4 | 8 | 16 | 32
        },
        voices
      });
    }
    if (bars.length === 0 || tuning.length === 0) continue;
    const tuningMidi = staff.tuning;
    tracks.push({
      id: trackId,
      name: importedText(nativeTrack.name) || `Track ${trackIndex + 1}`,
      shortName: importedText(nativeTrack.shortName) || undefined,
      instrument: {
        family: tuning.length <= 5 ? "bass" : "guitar",
        midiProgram: nativeTrack.playbackInfo.program
      },
      tuning,
      capo: staff.capo,
      fretCount: 24,
      range: {
        min: midiPitch(Math.min(...tuningMidi)),
        max: midiPitch(Math.max(...tuningMidi) + 24)
      },
      bars
    });
  }
  if (tracks.length === 0) throw new Error("The imported file contains no supported pitched tracks.");
  const firstBar = tracks[0]!.bars[0]!;
  const score: MusicScoreSpecV1 = {
    schemaVersion: MUSIC_SCORE_SPEC_VERSION,
    id: scoreId,
    metadata: {
      title: importedText(nativeScore.title) || "Imported score",
      subtitle: importedText(nativeScore.subTitle) || undefined,
      artist: importedText(nativeScore.artist) || undefined,
      album: importedText(nativeScore.album) || undefined,
      composer: importedText(nativeScore.music) || undefined,
      copyright: importedText(nativeScore.copyright) || undefined
    },
    tempoEvents: [{
      id: `${scoreId}-tempo-1`,
      position: { barId: firstBar.id, offset: { numerator: 0, denominator: 1 } },
      bpm: Math.min(400, Math.max(20, Math.round(nativeScore.tempo || 120)))
    }],
    tracks
  };
  const validation = validateMusicScoreSpec(score);
  if (!validation.success) {
    throw new Error(validation.diagnostics.map((item) => `${item.path}: ${item.message}`).join("; "));
  }
  return { score: validation.score, warnings };
}

export function importScoreBytes(filename: string, bytes: Uint8Array): ScoreImportResult {
  const safeFilename = safeBaseName(filename);
  if (!safeFilename) return { success: false, code: "FILE_INVALID", message: "Use a plain filename without path segments." };
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    return { success: false, code: "FILE_TOO_LARGE", message: `Files may not exceed ${MAX_IMPORT_BYTES} bytes.` };
  }
  const extension = extensionOf(safeFilename);
  if (!SUPPORTED_IMPORT_EXTENSIONS.includes(extension as typeof SUPPORTED_IMPORT_EXTENSIONS[number])) {
    return { success: false, code: "FORMAT_UNSUPPORTED", message: `Unsupported score extension: ${extension || "none"}.` };
  }
  try {
    const nativeScore = importer.ScoreLoader.loadScoreFromBytes(bytes);
    const converted = scoreFromAlphaTab(nativeScore);
    return { success: true, ...converted, sourceFormat: extension.slice(1) };
  } catch (error) {
    return {
      success: false,
      code: "FILE_INVALID",
      message: `alphaTab could not import the file: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
