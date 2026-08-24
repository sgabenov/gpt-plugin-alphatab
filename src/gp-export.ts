import { exporter, importer } from "@coderline/alphatab";
import { DEMO_SCORE } from "./demo-score.js";

export const DEMO_GP_FILENAME = "phase-0-drop-d-riff.gp";
export const DEMO_GP_DOWNLOAD_ROUTE = `/downloads/${DEMO_GP_FILENAME}`;
export const GP_MIME_TYPE = "application/octet-stream";

export function exportDemoGp(): Uint8Array {
  const score = importer.ScoreLoader.loadScoreFromBytes(new TextEncoder().encode(DEMO_SCORE.alphaTex));
  return new exporter.Gp7Exporter().export(score);
}
