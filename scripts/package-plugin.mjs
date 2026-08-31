import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDirectory = path.join(projectRoot, "artifacts");
const dryRun = process.argv.includes("--dry-run");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

await mkdir(artifactsDirectory, { recursive: true });

const args = ["pack", "--json"];
if (dryRun) {
  args.push("--dry-run");
} else {
  args.push("--pack-destination", artifactsDirectory);
}

const result = spawnSync(npmCommand, args, {
  cwd: projectRoot,
  encoding: "utf8",
  env: process.env
});

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const reportStarts = [...result.stdout.matchAll(/\[\s*\{\s*"id"\s*:/g)];
const reportStart = reportStarts.at(-1)?.index;
if (reportStart === undefined) {
  process.stderr.write(result.stdout);
  console.error("npm pack did not return its JSON package report.");
  process.exit(1);
}

const report = JSON.parse(result.stdout.slice(reportStart));
const packageReport = report[0];
const packagedPaths = new Set(packageReport.files.map((file) => file.path));
const requiredPaths = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "assets/guitarpro-tab-composer.png",
  "dist/server/server.js",
  "dist/ui/component.js",
  "scripts/launch-guitarpro-tab-composer-mcp",
  "skills/guitarpro-tab-composer/SKILL.md",
  "vendor/alphatab/1.8.4/runtime/alphaTab.min.js"
];
const missingPaths = requiredPaths.filter((requiredPath) => !packagedPaths.has(requiredPath));

if (missingPaths.length > 0) {
  for (const missingPath of missingPaths) {
    console.error(`Package is missing required file: ${missingPath}`);
  }
  process.exit(1);
}

if (dryRun) {
  console.log(
    `Package contents are valid: ${packageReport.filename} (${packageReport.entryCount} files, ${packageReport.size} bytes).`
  );
} else {
  console.log(`Created ${path.join(artifactsDirectory, packageReport.filename)}`);
}
