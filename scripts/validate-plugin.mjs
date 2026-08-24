import { access, readFile } from "node:fs/promises";

const manifestPath = new URL("../.codex-plugin/plugin.json", import.meta.url);
const pluginRoot = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const requiredStrings = [
  ["name", manifest.name],
  ["version", manifest.version],
  ["description", manifest.description],
  ["author.name", manifest.author?.name],
  ["interface.displayName", manifest.interface?.displayName],
  ["interface.shortDescription", manifest.interface?.shortDescription],
  ["interface.longDescription", manifest.interface?.longDescription],
  ["interface.developerName", manifest.interface?.developerName],
  ["interface.category", manifest.interface?.category]
];

const errors = requiredStrings
  .filter(([, value]) => typeof value !== "string" || value.trim() === "")
  .map(([field]) => `${field} must be a non-empty string.`);

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name ?? "")) {
  errors.push("name must use lower-case hyphen-case.");
}

if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) {
  errors.push("version must use strict semantic versioning.");
}

for (const field of ["skills", "mcpServers"]) {
  const relativePath = manifest[field];
  if (typeof relativePath !== "string" || !relativePath.startsWith("./")) {
    errors.push(`${field} must be a relative path beginning with ./`);
    continue;
  }
  try {
    await access(new URL(relativePath, pluginRoot));
  } catch {
    errors.push(`${field} points to a missing path: ${relativePath}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`Plugin manifest is valid: ${manifest.name}@${manifest.version}`);
}
