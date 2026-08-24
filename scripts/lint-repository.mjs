import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const textExtensions = new Set([
  ".css", ".html", ".json", ".md", ".mjs", ".ts", ".txt", ".xml", ".yaml", ".yml"
]);
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((file) => !file.startsWith("vendor/"))
  .filter((file) => textExtensions.has(file.slice(file.lastIndexOf("."))));

const errors = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (text.length > 0 && !text.endsWith("\n")) errors.push(`${file}: missing final newline`);
  for (const [index, line] of text.split("\n").entries()) {
    if (/[ \t]+$/.test(line)) errors.push(`${file}:${index + 1}: trailing whitespace`);
    if (/\t/.test(line)) errors.push(`${file}:${index + 1}: tab indentation is not allowed`);
    if (/[\u0410-\u044f\u0401\u0451]/.test(line)) {
      errors.push(`${file}:${index + 1}: repository text must be English`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`Repository text lint passed for ${files.length} files.`);
}
