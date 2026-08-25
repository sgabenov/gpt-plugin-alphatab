import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultScoreArtifactRoot,
  ScoreArtifactStore
} from "../src/score-artifacts.js";
import type { StoredScoreVersion } from "../src/score-store.js";

describe("ScoreArtifactStore", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function fixtureVersion(version = 1): StoredScoreVersion {
    const score = JSON.parse(
      readFileSync(resolve("test", "fixtures", "music-score-v1-valid.json"), "utf8")
    );
    return {
      scoreId: "persistent-score-id",
      version,
      createdAt: "2026-08-25T12:00:00.000Z",
      expiresAt: "2026-08-25T13:00:00.000Z",
      score
    };
  }

  function createStore(): ScoreArtifactStore {
    const directory = mkdtempSync(join(tmpdir(), "guitarpro-artifacts-test-"));
    temporaryDirectories.push(directory);
    return new ScoreArtifactStore({
      rootDirectory: directory,
      now: () => Date.parse("2026-08-25T12:00:00.000Z"),
      renderWidth: 800
    });
  }

  it("materializes immutable GP, alphaTex, and valid composite SVG files", () => {
    const store = createStore();
    const bundle = store.materialize(fixtureVersion());

    expect(bundle.createdAt).toBe("2026-08-25T12:00:00.000Z");
    for (const artifact of [bundle.gp, bundle.alphatex, bundle.svg]) {
      expect(existsSync(artifact.localPath)).toBe(true);
      expect(artifact.fileUri).toMatch(/^file:\/\//);
      expect(artifact.bytes).toBeGreaterThan(0);
    }
    expect(readFileSync(bundle.alphatex.localPath, "utf8")).toContain('\\title "Drop D Study"');

    const svg = readFileSync(bundle.svg.localPath, "utf8");
    expect(svg).toContain('<?xml version="1.0"');
    expect(svg).toContain("@font-face");
    expect(svg).toContain('<svg x="0"');
    for (const openingTag of svg.matchAll(/<svg\b[^>]*>/g)) {
      expect(openingTag[0].match(/\bwidth=/g)?.length ?? 0).toBeLessThanOrEqual(1);
      expect(openingTag[0].match(/\bheight=/g)?.length ?? 0).toBeLessThanOrEqual(1);
    }

    expect(store.materialize(fixtureVersion())).toEqual(bundle);
  });

  it("keeps score versions in separate artifact directories", () => {
    const store = createStore();
    const versionOne = store.materialize(fixtureVersion(1));
    const versionTwo = store.materialize(fixtureVersion(2));

    expect(versionOne.directory).toContain("/v1");
    expect(versionTwo.directory).toContain("/v2");
    expect(versionTwo.gp.localPath).not.toBe(versionOne.gp.localPath);
  });

  it("derives a task-scoped default root from Codex environment variables", () => {
    expect(defaultScoreArtifactRoot({
      CODEX_ARTIFACTS_DIR: "/tmp/custom-codex-artifacts",
      CODEX_THREAD_ID: "Thread With Spaces"
    })).toBe("/tmp/custom-codex-artifacts/thread-with-spaces/guitarpro-tab-composer");
  });
});
