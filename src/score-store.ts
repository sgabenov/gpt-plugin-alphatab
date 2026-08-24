import { randomUUID } from "node:crypto";
import type { MusicScoreSpecV1 } from "./music-score-spec/schema.js";

export const DEFAULT_SCORE_TTL_SECONDS = 60 * 60;
export const MIN_SCORE_TTL_SECONDS = 60;
export const MAX_SCORE_TTL_SECONDS = 24 * 60 * 60;

export type ScoreStoreErrorCode =
  | "SCORE_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "STABLE_ID_MISMATCH";

export class ScoreStoreError extends Error {
  constructor(
    readonly code: ScoreStoreErrorCode,
    message: string,
    readonly currentVersion?: number
  ) {
    super(message);
    this.name = "ScoreStoreError";
  }
}

export interface StoredScoreVersion {
  scoreId: string;
  version: number;
  createdAt: string;
  expiresAt: string;
  score: MusicScoreSpecV1;
}

export interface InMemoryScoreStoreOptions {
  now?: () => number;
  createId?: () => string;
  defaultTtlSeconds?: number;
}

interface ScoreSession {
  expiresAtMs: number;
  stableScoreId: string;
  versions: StoredScoreVersion[];
}

function copyVersion(version: StoredScoreVersion): StoredScoreVersion {
  return structuredClone(version);
}

function assertTtl(ttlSeconds: number): void {
  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < MIN_SCORE_TTL_SECONDS ||
    ttlSeconds > MAX_SCORE_TTL_SECONDS
  ) {
    throw new RangeError(
      `Score TTL must be an integer between ${MIN_SCORE_TTL_SECONDS} and ${MAX_SCORE_TTL_SECONDS} seconds.`
    );
  }
}

export class InMemoryScoreStore {
  private readonly sessions = new Map<string, ScoreSession>();
  private readonly now: () => number;
  private readonly createId: () => string;
  readonly defaultTtlSeconds: number;

  constructor(options: InMemoryScoreStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? (() => randomUUID());
    this.defaultTtlSeconds = options.defaultTtlSeconds ?? DEFAULT_SCORE_TTL_SECONDS;
    assertTtl(this.defaultTtlSeconds);
  }

  create(score: MusicScoreSpecV1, ttlSeconds = this.defaultTtlSeconds): StoredScoreVersion {
    assertTtl(ttlSeconds);
    const nowMs = this.now();
    const scoreId = this.uniqueOpaqueId();
    const version: StoredScoreVersion = {
      scoreId,
      version: 1,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + ttlSeconds * 1_000).toISOString(),
      score: structuredClone(score)
    };
    this.sessions.set(scoreId, {
      expiresAtMs: nowMs + ttlSeconds * 1_000,
      stableScoreId: score.id,
      versions: [version]
    });
    return copyVersion(version);
  }

  get(scoreId: string, version?: number): StoredScoreVersion {
    const session = this.activeSession(scoreId);
    const selected = version === undefined
      ? session.versions.at(-1)
      : session.versions.find((candidate) => candidate.version === version);
    if (!selected) {
      throw new ScoreStoreError(
        "SCORE_NOT_FOUND",
        `Score ${scoreId} version ${version} was not found.`,
        session.versions.at(-1)?.version
      );
    }
    return copyVersion(selected);
  }

  update(
    scoreId: string,
    expectedVersion: number,
    score: MusicScoreSpecV1
  ): StoredScoreVersion {
    const session = this.activeSession(scoreId);
    const current = session.versions.at(-1);
    if (!current) {
      throw new ScoreStoreError("SCORE_NOT_FOUND", `Score ${scoreId} was not found.`);
    }
    if (current.version !== expectedVersion) {
      throw new ScoreStoreError(
        "VERSION_CONFLICT",
        `Expected score version ${expectedVersion}, but the current version is ${current.version}.`,
        current.version
      );
    }
    if (score.id !== session.stableScoreId) {
      throw new ScoreStoreError(
        "STABLE_ID_MISMATCH",
        `Score ID must remain ${session.stableScoreId} across versions.`,
        current.version
      );
    }

    const next: StoredScoreVersion = {
      scoreId,
      version: current.version + 1,
      createdAt: new Date(this.now()).toISOString(),
      expiresAt: current.expiresAt,
      score: structuredClone(score)
    };
    session.versions.push(next);
    return copyVersion(next);
  }

  private activeSession(scoreId: string): ScoreSession {
    const session = this.sessions.get(scoreId);
    if (!session || session.expiresAtMs <= this.now()) {
      this.sessions.delete(scoreId);
      throw new ScoreStoreError("SCORE_NOT_FOUND", `Score ${scoreId} was not found or has expired.`);
    }
    return session;
  }

  private uniqueOpaqueId(): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const scoreId = this.createId();
      if (scoreId.length >= 16 && !this.sessions.has(scoreId)) return scoreId;
    }
    throw new Error("Could not allocate a unique opaque score ID.");
  }
}
