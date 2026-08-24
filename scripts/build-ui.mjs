import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("dist/ui", { recursive: true });

await build({
  entryPoints: ["web/component.ts"],
  outfile: "dist/ui/component.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: true,
  minify: false,
  loader: {
    ".svg": "dataurl",
    ".woff2": "dataurl"
  }
});
