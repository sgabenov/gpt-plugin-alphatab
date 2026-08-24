import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALPHATAB_VERSION } from "../src/ui-resource.js";

interface AssetManifest {
  package: string;
  version: string;
  files: Record<string, string>;
}

describe("vendored alphaTab resources", () => {
  it("match the pinned package and SHA-256 manifest", async () => {
    const root = resolve("vendor", "alphatab", ALPHATAB_VERSION);
    const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8")) as AssetManifest;

    expect(manifest.package).toBe("@coderline/alphatab");
    expect(manifest.version).toBe(ALPHATAB_VERSION);
    expect(Object.keys(manifest.files)).toEqual(
      expect.arrayContaining([
        "runtime/alphaTab.min.js",
        "runtime/alphaTab.worker.min.mjs",
        "runtime/alphaTab.worklet.min.mjs",
        "font/Bravura.woff2",
        "soundfont/sonivox.sf2"
      ])
    );

    for (const [file, expectedHash] of Object.entries(manifest.files)) {
      const bytes = await readFile(resolve(root, file));
      const actualHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
      expect(actualHash, file).toBe(expectedHash);
    }
  });
});
