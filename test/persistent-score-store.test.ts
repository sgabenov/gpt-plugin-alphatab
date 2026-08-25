import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateMusicScoreSpec, type MusicScoreSpecV1 } from "../src/music-score-spec/index.js";
import { PersistentScoreStore, defaultScoreDataRoot } from "../src/persistent-score-store.js";
import { ScoreStoreError } from "../src/score-store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function validScore(): MusicScoreSpecV1 {
  const input: unknown = JSON.parse(
    readFileSync(resolve("test", "fixtures", "music-score-v1-valid.json"), "utf8")
  );
  const result = validateMusicScoreSpec(input);
  if (!result.success) throw new Error("Expected the valid score fixture to pass validation.");
  return result.score;
}

async function temporaryStoreRoot(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "guitarpro-tab-store-"));
  temporaryDirectories.push(path);
  return path;
}

describe("PersistentScoreStore", () => {
  it("uses a stable user data directory by default", () => {
    expect(defaultScoreDataRoot({
      HOME: "/Users/example",
      XDG_DATA_HOME: "/custom/data"
    } as NodeJS.ProcessEnv)).toBe("/custom/data/guitarpro-tab-composer");
    expect(defaultScoreDataRoot({
      HOME: "/Users/example"
    } as NodeJS.ProcessEnv)).toBe("/Users/example/.local/share/guitarpro-tab-composer");
  });

  it("loads a created score after the store is reconstructed", async () => {
    const rootDirectory = await temporaryStoreRoot();
    const now = Date.parse("2026-08-26T09:00:00.000Z");
    const firstProcess = new PersistentScoreStore({
      rootDirectory,
      now: () => now,
      createId: () => "persistent-score-00000001"
    });
    const created = firstProcess.create(validScore(), 300);

    const restartedProcess = new PersistentScoreStore({ rootDirectory, now: () => now + 1_000 });
    const restored = restartedProcess.get(created.scoreId);

    expect(restored).toEqual(created);
    expect(restored.score).not.toBe(created.score);
  });

  it("preserves immutable versions and optimistic concurrency across processes", async () => {
    const rootDirectory = await temporaryStoreRoot();
    let now = Date.parse("2026-08-26T09:00:00.000Z");
    const firstProcess = new PersistentScoreStore({
      rootDirectory,
      now: () => now,
      createId: () => "persistent-score-00000002"
    });
    const original = validScore();
    const created = firstProcess.create(original, 300);
    const changed = structuredClone(original);
    changed.metadata.title = "Persisted second version";
    now += 1_000;

    const secondProcess = new PersistentScoreStore({ rootDirectory, now: () => now });
    const updated = secondProcess.update(created.scoreId, 1, changed);

    const thirdProcess = new PersistentScoreStore({ rootDirectory, now: () => now + 1_000 });
    expect(thirdProcess.get(created.scoreId, 1).score.metadata.title).toBe(original.metadata.title);
    expect(thirdProcess.get(created.scoreId, 2)).toEqual(updated);
    expect(() => firstProcess.update(created.scoreId, 1, changed)).toThrowError(
      expect.objectContaining<Partial<ScoreStoreError>>({
        code: "VERSION_CONFLICT",
        currentVersion: 2
      })
    );
  });

  it("honors session expiry after a restart", async () => {
    const rootDirectory = await temporaryStoreRoot();
    let now = Date.parse("2026-08-26T09:00:00.000Z");
    const firstProcess = new PersistentScoreStore({
      rootDirectory,
      now: () => now,
      createId: () => "persistent-score-00000003"
    });
    const created = firstProcess.create(validScore(), 60);
    now += 60_000;

    const restartedProcess = new PersistentScoreStore({ rootDirectory, now: () => now });
    expect(() => restartedProcess.get(created.scoreId)).toThrowError(
      expect.objectContaining<Partial<ScoreStoreError>>({ code: "SCORE_NOT_FOUND" })
    );
  });

  it("rejects corrupt persisted sessions instead of returning unvalidated data", async () => {
    const rootDirectory = await temporaryStoreRoot();
    const store = new PersistentScoreStore({
      rootDirectory,
      createId: () => "persistent-score-00000004"
    });
    const created = store.create(validScore());
    writeFileSync(
      join(rootDirectory, "sessions", `${created.scoreId}.json`),
      JSON.stringify({ schemaVersion: 1, scoreId: created.scoreId })
    );

    const restartedProcess = new PersistentScoreStore({ rootDirectory });
    expect(() => restartedProcess.get(created.scoreId)).toThrowError(
      `Stored score session ${created.scoreId} is unreadable or corrupt.`
    );
  });
});
