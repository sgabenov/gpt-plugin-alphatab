import { App } from "@modelcontextprotocol/ext-apps";
import type { AlphaTabApi as AlphaTabApiType } from "@coderline/alphatab";

interface ScorePayload {
  id: string;
  title: string;
  format: "alphatex";
  alphaTex: string;
  tempo: number;
  timeSignature: string;
  tuning: string[];
  bars: number;
}

interface AlphaTabNamespace {
  AlphaTabApi: typeof AlphaTabApiType;
}

declare global {
  interface Window {
    alphaTab?: AlphaTabNamespace;
  }
}

const ALPHATAB_VERSION = "1.8.4";
const ALPHATAB_ROOT = `https://cdn.jsdelivr.net/npm/@coderline/alphatab@${ALPHATAB_VERSION}/dist`;
const ALPHATAB_SCRIPT = `${ALPHATAB_ROOT}/alphaTab.min.js`;
const SOUNDFONT_URL = `${ALPHATAB_ROOT}/soundfont/sonivox.sf2`;

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("The alphaTab app root is missing.");
}

root.innerHTML = `
  <style>
    :root {
      color-scheme: light dark;
      font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
      background: var(--color-background-primary, #ffffff);
      color: var(--color-text-primary, #171717);
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 280px; }
    .shell { display: grid; grid-template-rows: auto auto minmax(280px, 1fr); min-height: 420px; background: inherit; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px 10px; }
    .title { margin: 0; font-size: 16px; line-height: 1.3; }
    .meta { margin: 3px 0 0; color: var(--color-text-secondary, #666); font-size: 12px; }
    .status { font-size: 12px; color: var(--color-text-secondary, #666); text-align: right; }
    .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 16px 12px; border-bottom: 1px solid var(--color-border-secondary, #e5e5e5); }
    button { appearance: none; border: 1px solid var(--color-border-primary, #cfcfcf); border-radius: 8px; background: var(--color-background-secondary, #f5f5f5); color: inherit; padding: 7px 12px; font: inherit; font-size: 13px; cursor: pointer; }
    button:hover:not(:disabled) { background: var(--color-background-tertiary, #ececec); }
    button:focus-visible { outline: 2px solid #5b5bd6; outline-offset: 2px; }
    button:disabled { cursor: not-allowed; opacity: .5; }
    .viewport { position: relative; overflow: auto; background: #fff; color: #111; min-height: 280px; }
    .score { padding: 16px 8px 32px; }
    .empty, .error { display: grid; place-items: center; min-height: 280px; padding: 24px; text-align: center; }
    .error { color: #b42318; }
    .at-cursor-bar { background: rgba(91, 91, 214, .14); }
    .at-cursor-beat { background: #5b5bd6; width: 3px; }
    .at-highlight * { fill: #5b5bd6; stroke: #5b5bd6; }
    @media (prefers-color-scheme: dark) {
      .viewport { background: #fff; }
    }
  </style>
  <main class="shell">
    <header class="header">
      <div>
        <h1 class="title">alphaTab score</h1>
        <p class="meta">Waiting for score data</p>
      </div>
      <div class="status" role="status" aria-live="polite">Connecting…</div>
    </header>
    <div class="controls" aria-label="Playback controls">
      <button type="button" data-action="play" disabled>Play / Pause</button>
      <button type="button" data-action="stop" disabled>Stop</button>
    </div>
    <div class="viewport">
      <div class="score" aria-label="Rendered music notation"></div>
    </div>
  </main>`;

const title = root.querySelector<HTMLElement>(".title")!;
const meta = root.querySelector<HTMLElement>(".meta")!;
const status = root.querySelector<HTMLElement>(".status")!;
const scoreElement = root.querySelector<HTMLElement>(".score")!;
const viewport = root.querySelector<HTMLElement>(".viewport")!;
const playButton = root.querySelector<HTMLButtonElement>("[data-action=play]")!;
const stopButton = root.querySelector<HTMLButtonElement>("[data-action=stop]")!;

let alphaTabApi: AlphaTabApiType | undefined;

function setStatus(message: string): void {
  status.textContent = message;
}

function isScorePayload(value: unknown): value is ScorePayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ScorePayload>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    candidate.format === "alphatex" &&
    typeof candidate.alphaTex === "string" &&
    typeof candidate.tempo === "number" &&
    typeof candidate.timeSignature === "string" &&
    Array.isArray(candidate.tuning) &&
    typeof candidate.bars === "number"
  );
}

function destroyAlphaTab(): void {
  playButton.disabled = true;
  stopButton.disabled = true;
  if (alphaTabApi) {
    alphaTabApi.destroy();
    alphaTabApi = undefined;
  }
  scoreElement.replaceChildren();
}

function renderScore(payload: ScorePayload): void {
  destroyAlphaTab();

  if (!window.alphaTab) {
    scoreElement.innerHTML = '<div class="error" role="alert">alphaTab failed to load.</div>';
    setStatus("Renderer unavailable");
    return;
  }

  title.textContent = payload.title;
  meta.textContent = `${payload.bars} bars · ${payload.timeSignature} · ${payload.tempo} BPM · ${payload.tuning.join(" ")}`;
  setStatus("Rendering score…");

  const api = new window.alphaTab.AlphaTabApi(scoreElement, {
    core: {
      scriptFile: ALPHATAB_SCRIPT,
      fontDirectory: `${ALPHATAB_ROOT}/font/`,
      useWorkers: true
    },
    display: {
      layoutMode: "page"
    },
    player: {
      enablePlayer: true,
      enableCursor: true,
      enableElementHighlighting: true,
      soundFont: SOUNDFONT_URL,
      scrollElement: viewport
    }
  });

  alphaTabApi = api;
  api.renderFinished.on(() => setStatus("Loading player…"));
  api.soundFontLoad.on((event) => {
    const percentage = event.total > 0 ? Math.floor((event.loaded / event.total) * 100) : 0;
    setStatus(`Loading sounds: ${percentage}%`);
  });
  api.playerReady.on(() => {
    playButton.disabled = false;
    stopButton.disabled = false;
    setStatus("Ready");
  });
  api.error.on((error) => {
    console.error("alphaTab error", error);
    setStatus("Unable to render score");
  });
  api.tex(payload.alphaTex);
}

playButton.addEventListener("click", () => alphaTabApi?.playPause());
stopButton.addEventListener("click", () => alphaTabApi?.stop());
window.addEventListener("beforeunload", destroyAlphaTab, { once: true });

const app = new App({ name: "alphatab-score-viewer", version: "0.1.0" }, {}, { autoResize: true });
app.addEventListener("toolresult", (result) => {
  if (isScorePayload(result.structuredContent)) {
    renderScore(result.structuredContent);
  } else {
    setStatus("Invalid score data");
  }
});

try {
  await app.connect();
  setStatus("Waiting for score…");
} catch (error) {
  console.error("MCP Apps connection failed", error);
  setStatus("Host connection failed");
}
