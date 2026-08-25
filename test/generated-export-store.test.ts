import { describe, expect, it } from "vitest";
import {
  GENERATED_EXPORT_TTL_SECONDS,
  InMemoryGeneratedExportStore,
  MAX_GENERATED_EXPORT_BYTES,
  generatedExportDownloadPath
} from "../src/generated-export-store.js";

describe("temporary generated exports", () => {
  it("stores a safe copy and expires it after one hour", () => {
    let now = Date.parse("2026-08-25T12:00:00.000Z");
    const store = new InMemoryGeneratedExportStore({
      now: () => now,
      createId: () => "generated-export-1"
    });
    const source = new TextEncoder().encode("<svg/>");
    const item = store.create("A score?.svg", "image/svg+xml", source);
    source[0] = 0;

    expect(item.filename).toBe("A-score-.svg");
    expect(item.expiresAt).toBe("2026-08-25T13:00:00.000Z");
    expect(new TextDecoder().decode(store.get(item.id)?.bytes)).toBe("<svg/>");
    expect(generatedExportDownloadPath(item.id)).toBe("/downloads/generated/generated-export-1");

    now += GENERATED_EXPORT_TTL_SECONDS * 1000;
    expect(store.get(item.id)).toBeUndefined();
  });

  it("rejects empty and oversized exports", () => {
    const store = new InMemoryGeneratedExportStore();
    expect(() => store.create("empty.svg", "image/svg+xml", new Uint8Array())).toThrow();
    expect(() => store.create(
      "large.svg",
      "image/svg+xml",
      new Uint8Array(MAX_GENERATED_EXPORT_BYTES + 1)
    )).toThrow();
  });
});
