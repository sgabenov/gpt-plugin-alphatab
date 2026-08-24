import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const packageName = "@coderline/alphatab";
const version = "1.8.4";
const packageRoot = resolve("node_modules", "@coderline", "alphatab");
const vendorRoot = resolve("vendor", "alphatab", version);

const assets = [
  ["LICENSE", "LICENSE"],
  ["LICENSE.header", "LICENSE.header"],
  ["dist/alphaTab.min.js", "runtime/alphaTab.min.js"],
  ["dist/alphaTab.min.mjs", "runtime/alphaTab.min.mjs"],
  ["dist/alphaTab.worker.min.mjs", "runtime/alphaTab.worker.min.mjs"],
  ["dist/alphaTab.worklet.min.mjs", "runtime/alphaTab.worklet.min.mjs"],
  ["dist/font/Bravura.eot", "font/Bravura.eot"],
  ["dist/font/Bravura.otf", "font/Bravura.otf"],
  ["dist/font/Bravura.svg", "font/Bravura.svg"],
  ["dist/font/Bravura.woff", "font/Bravura.woff"],
  ["dist/font/Bravura.woff2", "font/Bravura.woff2"],
  ["dist/font/Bravura-FONTLOG.txt", "font/Bravura-FONTLOG.txt"],
  ["dist/font/Bravura-OFL.txt", "font/Bravura-OFL.txt"],
  ["dist/font/Bravura-OFL-FAQ.txt", "font/Bravura-OFL-FAQ.txt"],
  ["dist/soundfont/LICENSE", "soundfont/LICENSE"],
  ["dist/soundfont/README.md", "soundfont/README.md"],
  ["dist/soundfont/sonivox.sf2", "soundfont/sonivox.sf2"]
];

const hashes = {};

await rm(vendorRoot, { recursive: true, force: true });

for (const [sourceRelative, targetRelative] of assets) {
  const source = resolve(packageRoot, sourceRelative);
  const targetFile = resolve(vendorRoot, targetRelative);
  await mkdir(dirname(targetFile), { recursive: true });
  await copyFile(source, targetFile);
  const bytes = await readFile(targetFile);
  hashes[targetRelative] = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

const manifest = {
  package: packageName,
  version,
  files: Object.fromEntries(Object.entries(hashes).sort(([left], [right]) => left.localeCompare(right)))
};

await writeFile(resolve(vendorRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Synchronized ${assets.length} alphaTab ${version} assets into ${vendorRoot}`);
