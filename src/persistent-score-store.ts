import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { MusicScoreSpecV1Schema, type MusicScoreSpecV1 } from "./music-score-spec/index.js";
import {
  DEFAULT_SCORE_TTL_SECONDS,
  ScoreStoreError,
  assertScoreTtl,
  copyStoredScoreVersion,
  type ScoreStore,
  type StoredScoreVersion
} from "./score-store.js";

const STORE_SCHEMA_VERSION = 1;
const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

const StoredScoreVersionSchema = z.object({
  scoreId: z.string().regex(OPAQUE_ID_PATTERN),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  score: MusicScoreSpecV1Schema
}).strict();

const PersistentScoreSessionSchema = z.object({
  schemaVersion: z.literal(STORE_SCHEMA_VERSION),
  scoreId: z.string().regex(OPAQUE_ID_PATTERN),
  stableScoreId: z.string().min(1),
  expiresAtMs: z.number().int().nonnegative(),
  versions: z.array(StoredScoreVersionSchema).min(1)
}).strict();

type PersistentScoreSession = z.infer<typeof PersistentScoreSessionSchema>;

export interface PersistentScoreStoreOptions {
  rootDirectory?: string;
  now?: () => number;
  createId?: () => string;
  defaultTtlSeconds?: number;
}

export function defaultScoreDataRoot(environment = process.env): string {
  if (environment.GUITARPRO_TAB_DATA_DIR) {
    return resolve(environment.GUITARPRO_TAB_DATA_DIR);
  }
  const dataHome = environment.XDG_DATA_HOME
    ? resolve(environment.XDG_DATA_HOME)
    : join(environment.HOME || homedir(), ".local", "share");
  return join(dataHome, "guitarpro-tab-composer");
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function wait(milliseconds: number): void {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function assertSessionIntegrity(session: PersistentScoreSession): void {
  for (const [index, version] of session.versions.entries()) {
    if (
      version.scoreId !== session.scoreId ||
      version.version !== index + 1 ||
      version.score.id !== session.stableScoreId ||
      Date.parse(version.expiresAt) !== session.expiresAtMs
    ) {
      throw new Error(`Stored score session ${session.scoreId} has inconsistent version metadata.`);
    }
  }
}

export class PersistentScoreStore implements ScoreStore {
  readonly #rootDirectory: string;
  readonly #sessionsDirectory: string;
  readonly #locksDirectory: string;
  readonly #now: () => number;
  readonly #createId: () => string;
  readonly defaultTtlSeconds: number;

  constructor(options: PersistentScoreStoreOptions = {}) {
    this.#rootDirectory = options.rootDirectory ?? defaultScoreDataRoot();
    this.#sessionsDirectory = join(this.#rootDirectory, "sessions");
    this.#locksDirectory = join(this.#rootDirectory, "locks");
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? (() => randomUUID());
    this.defaultTtlSeconds = options.defaultTtlSeconds ?? DEFAULT_SCORE_TTL_SECONDS;
    assertScoreTtl(this.defaultTtlSeconds);
    mkdirSync(this.#sessionsDirectory, { recursive: true, mode: 0o700 });
    mkdirSync(this.#locksDirectory, { recursive: true, mode: 0o700 });
  }

  get rootDirectory(): string {
    return this.#rootDirectory;
  }

  create(score: MusicScoreSpecV1, ttlSeconds = this.defaultTtlSeconds): StoredScoreVersion {
    assertScoreTtl(ttlSeconds);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const scoreId = this.#createId();
      if (!OPAQUE_ID_PATTERN.test(scoreId)) continue;
      const created = this.#withLock(scoreId, () => {
        if (existsSync(this.#sessionPath(scoreId))) return undefined;
        const nowMs = this.#now();
        const version: StoredScoreVersion = {
          scoreId,
          version: 1,
          createdAt: new Date(nowMs).toISOString(),
          expiresAt: new Date(nowMs + ttlSeconds * 1_000).toISOString(),
          score: structuredClone(score)
        };
        this.#writeSession({
          schemaVersion: STORE_SCHEMA_VERSION,
          scoreId,
          stableScoreId: score.id,
          expiresAtMs: nowMs + ttlSeconds * 1_000,
          versions: [version]
        });
        return version;
      });
      if (created) return copyStoredScoreVersion(created);
    }
    throw new Error("Could not allocate a unique opaque score ID.");
  }

  get(scoreId: string, version?: number): StoredScoreVersion {
    const session = this.#activeSession(scoreId);
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
    return copyStoredScoreVersion(selected);
  }

  update(
    scoreId: string,
    expectedVersion: number,
    score: MusicScoreSpecV1
  ): StoredScoreVersion {
    if (!OPAQUE_ID_PATTERN.test(scoreId)) {
      throw new ScoreStoreError("SCORE_NOT_FOUND", `Score ${scoreId} was not found.`);
    }
    return this.#withLock(scoreId, () => {
      const session = this.#activeSession(scoreId);
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
        createdAt: new Date(this.#now()).toISOString(),
        expiresAt: current.expiresAt,
        score: structuredClone(score)
      };
      session.versions.push(next);
      this.#writeSession(session);
      return copyStoredScoreVersion(next);
    });
  }

  #activeSession(scoreId: string): PersistentScoreSession {
    if (!OPAQUE_ID_PATTERN.test(scoreId)) {
      throw new ScoreStoreError("SCORE_NOT_FOUND", `Score ${scoreId} was not found.`);
    }
    const path = this.#sessionPath(scoreId);
    let session: PersistentScoreSession;
    try {
      session = PersistentScoreSessionSchema.parse(JSON.parse(readFileSync(path, "utf8")));
      assertSessionIntegrity(session);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) {
        throw new ScoreStoreError("SCORE_NOT_FOUND", `Score ${scoreId} was not found.`);
      }
      throw new Error(`Stored score session ${scoreId} is unreadable or corrupt.`, { cause: error });
    }
    if (session.scoreId !== scoreId) {
      throw new Error(`Stored score session ${scoreId} has an invalid identity.`);
    }
    if (session.expiresAtMs <= this.#now()) {
      rmSync(path, { force: true });
      throw new ScoreStoreError("SCORE_NOT_FOUND", `Score ${scoreId} was not found or has expired.`);
    }
    return session;
  }

  #sessionPath(scoreId: string): string {
    return join(this.#sessionsDirectory, `${scoreId}.json`);
  }

  #writeSession(session: PersistentScoreSession): void {
    const path = this.#sessionPath(session.scoreId);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporaryPath, `${JSON.stringify(session)}\n`, { encoding: "utf8", mode: 0o600 });
      renameSync(temporaryPath, path);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }

  #withLock<T>(scoreId: string, action: () => T): T {
    const lockPath = join(this.#locksDirectory, `${scoreId}.lock`);
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (true) {
      try {
        mkdirSync(lockPath, { mode: 0o700 });
        break;
      } catch (error) {
        if (!isNodeError(error, "EEXIST")) throw error;
        try {
          if (Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS) {
            rmSync(lockPath, { recursive: true, force: true });
            continue;
          }
        } catch (statError) {
          if (!isNodeError(statError, "ENOENT")) throw statError;
          continue;
        }
        if (Date.now() >= deadline) {
          throw new Error(`Timed out waiting for score session ${scoreId}.`);
        }
        wait(10);
      }
    }
    try {
      return action();
    } finally {
      rmSync(lockPath, { recursive: true, force: true });
    }
  }
}
