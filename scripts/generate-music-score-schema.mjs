import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import {
  MUSIC_SCORE_SPEC_VERSION,
  MusicScoreSpecV1Schema
} from "../dist/server/music-score-spec/schema.js";

const target = resolve("schemas", "music-score-spec-v1.schema.json");
const generated = z.toJSONSchema(MusicScoreSpecV1Schema, {
  target: "draft-7",
  reused: "ref"
});
const document = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://github.com/sgabenov/gpt-plugin-guitarpro-tab-composer/schemas/music-score-spec-v1.schema.json",
  title: `MusicScoreSpec ${MUSIC_SCORE_SPEC_VERSION}`,
  description: "Canonical, deterministic score model for GuitarPro Tab Composer.",
  ...generated
};
const contents = `${JSON.stringify(document, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current !== contents) {
    console.error("MusicScoreSpec JSON Schema is stale. Run npm run schema:generate.");
    process.exitCode = 1;
  } else {
    console.log(`MusicScoreSpec JSON Schema is current: ${target}`);
  }
} else {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
  console.log(`Generated MusicScoreSpec JSON Schema: ${target}`);
}
