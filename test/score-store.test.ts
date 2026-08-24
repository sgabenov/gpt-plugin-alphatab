import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateMusicScoreSpec, type MusicScoreSpecV1 } from "../src/music-score-spec/index.js";
import { InMemoryScoreStore, ScoreStoreError } from "../src/score-store.js";

function validScore(): MusicScoreSpecV1 {
  const input: unknown = JSON.parse(
    readFileSync(resolve("test", "fixtures", "music-score-v1-valid.json"), "utf8")
  );
  const result = validateMusicScoreSpec(input);
  if (!result.success) throw new Error("Expected the valid score fixture to pass validation.");
  return result.score;
}

describe("InMemoryScoreStore", () => {
  it("uses an opaque ID and an explicit session expiry", () => {
    const store = new InMemoryScoreStore({
      now: () => Date.parse("2026-08-24T12:00:00.000Z"),
      createId: () => "opaque-score-id-00000001"
    });

    const created = store.create(validScore(), 120);

    expect(created).toMatchObject({
      scoreId: "opaque-score-id-00000001",
      version: 1,
      createdAt: "2026-08-24T12:00:00.000Z",
      expiresAt: "2026-08-24T12:02:00.000Z"
    });
    expect(created.scoreId).not.toBe(created.score.id);
  });

  it("appends immutable versions and rejects stale writers", () => {
    let now = Date.parse("2026-08-24T12:00:00.000Z");
    const store = new InMemoryScoreStore({
      now: () => now,
      createId: () => "opaque-score-id-00000002"
    });
    const original = validScore();
    const created = store.create(original, 300);
    const changed = structuredClone(original);
    changed.metadata.title = "Second immutable version";
    now += 1_000;

    const updated = store.update(created.scoreId, 1, changed);

    expect(updated.version).toBe(2);
    expect(updated.score.metadata.title).toBe("Second immutable version");
    created.score.metadata.title = "Attempted external mutation";
    expect(store.get(created.scoreId, 1).score.metadata.title).toBe(original.metadata.title);
    expect(() => store.update(created.scoreId, 1, changed)).toThrowError(
      expect.objectContaining<Partial<ScoreStoreError>>({
        code: "VERSION_CONFLICT",
        currentVersion: 2
      })
    );
  });

  it("preserves the stable MusicScoreSpec ID across updates", () => {
    const store = new InMemoryScoreStore({ createId: () => "opaque-score-id-00000003" });
    const score = validScore();
    const created = store.create(score);
    const changed = structuredClone(score);
    changed.id = "replacement-score-id";

    expect(() => store.update(created.scoreId, 1, changed)).toThrowError(
      expect.objectContaining<Partial<ScoreStoreError>>({ code: "STABLE_ID_MISMATCH" })
    );
  });

  it("removes expired sessions", () => {
    let now = Date.parse("2026-08-24T12:00:00.000Z");
    const store = new InMemoryScoreStore({
      now: () => now,
      createId: () => "opaque-score-id-00000004"
    });
    const created = store.create(validScore(), 60);
    now += 60_000;

    expect(() => store.get(created.scoreId)).toThrowError(
      expect.objectContaining<Partial<ScoreStoreError>>({ code: "SCORE_NOT_FOUND" })
    );
  });
});
