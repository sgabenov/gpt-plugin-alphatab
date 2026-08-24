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
  tracks?: Array<{ id: string; name: string }>;
}

interface AlphaTabNamespace {
  AlphaTabApi: typeof AlphaTabApiType;
  FontFileFormat: {
    Woff2: number;
  };
  PlayerOutputMode: {
    WebAudioAudioWorklets: number;
    WebAudioScriptProcessor: number;
  };
  exporter: {
    Gp7Exporter: new () => {
      export(score: NonNullable<AlphaTabApiType["score"]>, settings?: AlphaTabApiType["settings"] | null): Uint8Array;
    };
  };
}

interface AlphaTabAssets {
  origin: string;
  runtimeUrl: string;
  fontDirectory: string;
  soundFontUrl: string;
  alphaTabRuntimeBase64: string;
  smuflFontWoff2Base64: string;
  soundFontBase64: string;
}

interface OpenAiFileBridge {
  uploadFile?: (file: File, options?: { library?: boolean }) => Promise<{ fileId: string }>;
  getFileDownloadUrl?: (input: { fileId: string }) => Promise<{ downloadUrl: string }>;
  openExternal?: (input: { href: string; redirectUrl?: boolean }) => Promise<void>;
}

declare global {
  interface Window {
    alphaTab?: AlphaTabNamespace;
    __ALPHATAB_ASSETS__?: AlphaTabAssets;
    __ALPHATAB_PREVIEW_SCORE__?: unknown;
    openai?: OpenAiFileBridge;
  }
}

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
    .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 16px 12px; border-bottom: 1px solid var(--color-border-secondary, #e5e5e5); }
    .control { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
    select, input { accent-color: #5b5bd6; }
    select { border: 1px solid var(--color-border-primary, #cfcfcf); border-radius: 8px; background: var(--color-background-secondary, #f5f5f5); color: inherit; padding: 6px 8px; }
    input[type=range] { width: 110px; }
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
        <h1 class="title">GuitarPro Tab Composer</h1>
        <p class="meta">Waiting for score data</p>
      </div>
      <div class="status" role="status" aria-live="polite">Connecting…</div>
    </header>
    <div class="controls" aria-label="Playback controls">
      <label class="control">Track <select data-control="track" disabled aria-label="Displayed track"></select></label>
      <button type="button" data-action="play" disabled>Play</button>
      <button type="button" data-action="stop" disabled>Stop</button>
      <button type="button" data-action="loop" disabled aria-pressed="false">Loop</button>
      <button type="button" data-action="metronome" disabled aria-pressed="false">Metronome</button>
      <button type="button" data-action="mute" disabled aria-pressed="false">Mute</button>
      <button type="button" data-action="solo" disabled aria-pressed="false">Solo</button>
      <label class="control">Tempo <input data-control="tempo" type="range" min="50" max="150" value="100" disabled aria-label="Playback tempo percentage"><output data-output="tempo">100%</output></label>
      <button type="button" data-action="import">Import score</button>
      <input data-control="file" type="file" accept=".gp,.gp3,.gp4,.gp5,.gpx,.musicxml,.xml,.alphatex,.atex,.txt" hidden>
      <button type="button" data-action="export-gp" disabled>Export GP</button>
      <button type="button" data-action="fullscreen">Fullscreen</button>
    </div>
    <div class="viewport">
      <div class="score" aria-label="Rendered music notation">
        <div class="empty">Waiting for score data…</div>
      </div>
    </div>
  </main>`;

const title = root.querySelector<HTMLElement>(".title")!;
const meta = root.querySelector<HTMLElement>(".meta")!;
const status = root.querySelector<HTMLElement>(".status")!;
const scoreElement = root.querySelector<HTMLElement>(".score")!;
const viewport = root.querySelector<HTMLElement>(".viewport")!;
const playButton = root.querySelector<HTMLButtonElement>("[data-action=play]")!;
const stopButton = root.querySelector<HTMLButtonElement>("[data-action=stop]")!;
const exportGpButton = root.querySelector<HTMLButtonElement>("[data-action=export-gp]")!;
const loopButton = root.querySelector<HTMLButtonElement>("[data-action=loop]")!;
const metronomeButton = root.querySelector<HTMLButtonElement>("[data-action=metronome]")!;
const muteButton = root.querySelector<HTMLButtonElement>("[data-action=mute]")!;
const soloButton = root.querySelector<HTMLButtonElement>("[data-action=solo]")!;
const trackSelect = root.querySelector<HTMLSelectElement>("[data-control=track]")!;
const tempoInput = root.querySelector<HTMLInputElement>("[data-control=tempo]")!;
const tempoOutput = root.querySelector<HTMLOutputElement>("[data-output=tempo]")!;
const importButton = root.querySelector<HTMLButtonElement>("[data-action=import]")!;
const fileInput = root.querySelector<HTMLInputElement>("[data-control=file]")!;
const fullscreenButton = root.querySelector<HTMLButtonElement>("[data-action=fullscreen]")!;

let alphaTabApi: AlphaTabApiType | undefined;
let appBridge: App | undefined;
let isPlayerReady = false;
let isSoundFontLoading = false;
let currentPayload: ScorePayload | undefined;
let selectedTrackIndex = 0;
let isMuted = false;
let isSolo = false;
let runtimeObjectUrl: string | undefined;
let fontObjectUrl: string | undefined;
let resizeObserver: ResizeObserver | undefined;
let playerReadyTimeout: number | undefined;
let isScoreRendered = false;
let playbackRequested = false;
let currentDisplayMode: "inline" | "fullscreen" | "pip" = "inline";

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
  isPlayerReady = false;
  isSoundFontLoading = false;
  isScoreRendered = false;
  playbackRequested = false;
  playButton.disabled = true;
  stopButton.disabled = true;
  exportGpButton.disabled = true;
  for (const control of [loopButton, metronomeButton, muteButton, soloButton, trackSelect, tempoInput]) {
    control.disabled = true;
  }
  if (alphaTabApi) {
    alphaTabApi.destroy();
    alphaTabApi = undefined;
  }
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  if (playerReadyTimeout !== undefined) {
    window.clearTimeout(playerReadyTimeout);
    playerReadyTimeout = undefined;
  }
  if (runtimeObjectUrl) {
    URL.revokeObjectURL(runtimeObjectUrl);
    runtimeObjectUrl = undefined;
  }
  if (fontObjectUrl) {
    URL.revokeObjectURL(fontObjectUrl);
    fontObjectUrl = undefined;
  }
  scoreElement.replaceChildren();
}

function scheduleScoreRender(): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (alphaTabApi?.score) alphaTabApi.render();
    });
  });
}

function updateDisplayMode(mode: "inline" | "fullscreen" | "pip" | undefined): void {
  if (!mode) return;
  currentDisplayMode = mode;
  fullscreenButton.textContent = mode === "fullscreen" ? "Return to chat" : "Fullscreen";
  fullscreenButton.setAttribute("aria-pressed", String(mode === "fullscreen"));
  scheduleScoreRender();
}

function startPlaybackTimeout(api: AlphaTabApiType): void {
  if (playerReadyTimeout !== undefined) window.clearTimeout(playerReadyTimeout);
  playerReadyTimeout = window.setTimeout(() => {
    if (alphaTabApi === api && !isPlayerReady) {
      playerReadyTimeout = undefined;
      playbackRequested = false;
      setStatus("Audio initialization timed out — press Play to retry");
    }
  }, 15000);
}

function renderScore(payload: ScorePayload): void {
  destroyAlphaTab();
  currentPayload = payload;
  selectedTrackIndex = 0;
  isMuted = false;
  isSolo = false;

  const assets = window.__ALPHATAB_ASSETS__;
  if (!window.alphaTab || !assets) {
    scoreElement.innerHTML = '<div class="error" role="alert">Local alphaTab resources failed to load.</div>';
    setStatus("Renderer unavailable");
    return;
  }

  title.textContent = payload.title;
  meta.textContent = `${payload.bars} bars · ${payload.timeSignature} · ${payload.tempo} BPM · ${payload.tuning.join(" ")}`;
  setStatus("Rendering score…");

  // The Codex iframe CSP permits blob scripts but blocks data scripts. The
  // runtime URL is also used by alphaTab's renderer and synth workers.
  runtimeObjectUrl = URL.createObjectURL(new Blob(
    [base64ToBytes(assets.alphaTabRuntimeBase64)],
    { type: "application/javascript" }
  ));

  fontObjectUrl = URL.createObjectURL(new Blob(
    [base64ToBytes(assets.smuflFontWoff2Base64)],
    { type: "font/woff2" }
  ));

  const api = new window.alphaTab.AlphaTabApi(scoreElement, {
    core: {
      scriptFile: runtimeObjectUrl,
      fontDirectory: null,
      smuflFontSources: new Map([
        [window.alphaTab.FontFileFormat.Woff2, fontObjectUrl]
      ]),
      useWorkers: false
    },
    display: {
      layoutMode: "page"
    },
    player: {
      enablePlayer: true,
      enableCursor: true,
      enableElementHighlighting: true,
      soundFont: null,
      // MCP App iframes cannot reliably resolve alphaTab's external audio-worklet
      // module from the embedded data-URL runtime. ScriptProcessor keeps playback
      // self-contained and avoids leaving player initialization pending forever.
      outputMode: window.alphaTab.PlayerOutputMode.WebAudioScriptProcessor,
      scrollElement: viewport
    }
  });

  alphaTabApi = api;
  let renderedWidth = Math.round(viewport.getBoundingClientRect().width);
  let resizeFrame: number | undefined;
  resizeObserver = new ResizeObserver(() => {
    const nextWidth = Math.round(viewport.getBoundingClientRect().width);
    if (nextWidth < 280 || Math.abs(nextWidth - renderedWidth) < 2 || alphaTabApi !== api) return;
    renderedWidth = nextWidth;
    if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = window.requestAnimationFrame(() => {
        if (alphaTabApi === api && api.score) api.render();
      });
    });
  });
  resizeObserver.observe(viewport);

  api.renderFinished.on(() => {
    isScoreRendered = true;
    playButton.disabled = false;
    exportGpButton.disabled = false;
    if (!isPlayerReady && !playbackRequested && !isSoundFontLoading) {
      setStatus("Score ready — press Play to initialize audio");
    }
  });
  api.soundFontLoad.on((event) => {
    const percentage = event.total > 0 ? Math.floor((event.loaded / event.total) * 100) : 0;
    setStatus(`Loading sounds: ${percentage}%`);
  });
  api.playerReady.on(() => {
    isPlayerReady = true;
    if (playerReadyTimeout !== undefined) {
      window.clearTimeout(playerReadyTimeout);
      playerReadyTimeout = undefined;
    }
    playButton.disabled = false;
    stopButton.disabled = false;
    exportGpButton.disabled = false;
    for (const control of [loopButton, metronomeButton, muteButton, soloButton, tempoInput]) {
      control.disabled = false;
    }
    const shouldStartPlayback = playbackRequested;
    playbackRequested = false;
    setStatus("Ready");
    if (shouldStartPlayback) api.playPause();
  });
  api.soundFontLoaded.on(() => {
    isSoundFontLoading = false;
    if (!isPlayerReady) {
      setStatus(playbackRequested ? "Initializing audio…" : "Score ready — press Play to initialize audio");
    }
  });
  api.scoreLoaded.on((score) => {
    trackSelect.replaceChildren();
    for (const track of score.tracks) {
      const option = document.createElement("option");
      option.value = String(track.index);
      option.textContent = track.name || `Track ${track.index + 1}`;
      trackSelect.appendChild(option);
    }
    trackSelect.disabled = score.tracks.length < 2;
  });
  api.midiLoaded.on(() => {
    if (!isSoundFontLoading && !isPlayerReady) {
      isSoundFontLoading = true;
      setStatus("Loading sounds…");
      if (!api.loadSoundFont(base64ToBytes(assets.soundFontBase64))) {
        isSoundFontLoading = false;
        setStatus("Unable to initialize sounds");
      }
    }
  });
  api.playerStateChanged.on((event) => {
    playButton.textContent = event.state === 1 ? "Pause" : "Play";
  });
  api.error.on((error) => {
    console.error("alphaTab error", error);
    if (isScoreRendered) {
      playbackRequested = false;
      if (playerReadyTimeout !== undefined) {
        window.clearTimeout(playerReadyTimeout);
        playerReadyTimeout = undefined;
      }
      setStatus("Score ready — audio is unavailable in this view");
      return;
    }
    scoreElement.innerHTML = '<div class="error" role="alert">The score could not be rendered.</div>';
    setStatus("Unable to render score");
  });
  api.tex(payload.alphaTex);
}

playButton.addEventListener("click", () => {
  if (!alphaTabApi || !isScoreRendered) return;
  if (isPlayerReady) {
    alphaTabApi.playPause();
    return;
  }
  playbackRequested = true;
  setStatus("Initializing audio…");
  startPlaybackTimeout(alphaTabApi);
  // The call must originate from the click so the iframe can unlock Web Audio.
  alphaTabApi.playPause();
});
stopButton.addEventListener("click", () => alphaTabApi?.stop());
loopButton.addEventListener("click", () => {
  if (!alphaTabApi) return;
  alphaTabApi.isLooping = !alphaTabApi.isLooping;
  loopButton.setAttribute("aria-pressed", String(alphaTabApi.isLooping));
});
metronomeButton.addEventListener("click", () => {
  if (!alphaTabApi) return;
  const enabled = alphaTabApi.metronomeVolume === 0;
  alphaTabApi.metronomeVolume = enabled ? 0.7 : 0;
  metronomeButton.setAttribute("aria-pressed", String(enabled));
});
trackSelect.addEventListener("change", () => {
  if (!alphaTabApi) return;
  selectedTrackIndex = Number(trackSelect.value);
  const track = alphaTabApi.score?.tracks[selectedTrackIndex];
  if (track) {
    alphaTabApi.renderTracks([track]);
    void appBridge?.updateModelContext({
      content: [{
        type: "text",
        text: `The user is viewing track ${selectedTrackIndex + 1}: ${track.name || "Unnamed track"} in ${currentPayload?.title ?? "the score"}.`
      }]
    }).catch((error) => console.warn("Could not update model context", error));
  }
});
muteButton.addEventListener("click", () => {
  if (!alphaTabApi) return;
  const track = alphaTabApi.score?.tracks[selectedTrackIndex];
  if (!track) return;
  isMuted = !isMuted;
  alphaTabApi.changeTrackMute([track], isMuted);
  muteButton.setAttribute("aria-pressed", String(isMuted));
});
soloButton.addEventListener("click", () => {
  if (!alphaTabApi) return;
  const track = alphaTabApi.score?.tracks[selectedTrackIndex];
  if (!track) return;
  isSolo = !isSolo;
  alphaTabApi.changeTrackSolo([track], isSolo);
  soloButton.setAttribute("aria-pressed", String(isSolo));
});
tempoInput.addEventListener("input", () => {
  const percentage = Number(tempoInput.value);
  tempoOutput.value = `${percentage}%`;
  if (alphaTabApi) alphaTabApi.playbackSpeed = percentage / 100;
});

importButton.addEventListener("click", () => fileInput.click());
fullscreenButton.addEventListener("click", async () => {
  if (!appBridge) {
    setStatus("Fullscreen is managed by the MCP Apps host");
    return;
  }
  try {
    const targetMode = currentDisplayMode === "fullscreen" ? "inline" : "fullscreen";
    const availableModes = appBridge.getHostContext()?.availableDisplayModes;
    if (availableModes && !availableModes.includes(targetMode)) {
      setStatus(targetMode === "inline" ? "Return to chat is unavailable" : "Fullscreen is unavailable");
      return;
    }
    const result = await appBridge.requestDisplayMode({ mode: targetMode });
    if (result.isError) {
      setStatus(targetMode === "inline" ? "Return to chat was declined" : "Fullscreen request was declined");
      return;
    }
    updateDisplayMode(result.mode);
  } catch (error) {
    console.warn("Fullscreen mode is unavailable", error);
    setStatus("Fullscreen mode is unavailable");
  }
});
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (!appBridge) {
    setStatus("Import requires an MCP Apps host");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    setStatus("Import files are limited to 5 MB");
    return;
  }
  importButton.disabled = true;
  setStatus("Importing score…");
  try {
    const imported = await appBridge.callServerTool({
      name: "import_score",
      arguments: {
        filename: file.name,
        dataBase64: bytesToBase64(new Uint8Array(await file.arrayBuffer()))
      }
    });
    const importedData = imported.structuredContent;
    if (imported.isError || importedData?.status !== "imported") {
      throw new Error(typeof importedData?.message === "string" ? importedData.message : "Import failed.");
    }
    const rendered = await appBridge.callServerTool({
      name: "render_score",
      arguments: {
        scoreId: importedData.scoreId,
        version: importedData.version
      }
    });
    if (!isScorePayload(rendered.structuredContent)) throw new Error("Imported score could not be rendered.");
    renderScore(rendered.structuredContent);
  } catch (error) {
    console.error("Score import failed", error);
    setStatus(error instanceof Error ? error.message : "Score import failed");
  } finally {
    importButton.disabled = false;
    fileInput.value = "";
  }
});

function downloadBlob(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.download = file.name;
  anchor.href = url;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

exportGpButton.addEventListener("click", async () => {
  if (!alphaTabApi?.score) return;

  exportGpButton.disabled = true;
  setStatus("Exporting Guitar Pro file…");

  const bytes = new window.alphaTab!.exporter.Gp7Exporter().export(
    alphaTabApi.score,
    alphaTabApi.settings
  );
  const fileBytes = Uint8Array.from(bytes);
  const filename = `${(currentPayload?.title ?? "score")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "score"}.gp`;
  const file = new File([fileBytes.buffer], filename, {
    type: "application/octet-stream"
  });

  try {
    if (appBridge) {
      const result = await appBridge.downloadFile({
        contents: [{
          type: "resource",
          resource: {
            uri: `file:///${file.name}`,
            mimeType: file.type,
            blob: bytesToBase64(fileBytes)
          }
        }]
      });
      if (!result.isError) {
        setStatus("Guitar Pro file ready");
        return;
      }
    }
    const host = window.openai;
    if (host?.uploadFile && host.getFileDownloadUrl) {
      const { fileId } = await host.uploadFile(file);
      const { downloadUrl } = await host.getFileDownloadUrl({ fileId });
      if (host.openExternal) {
        await host.openExternal({ href: downloadUrl, redirectUrl: false });
      } else {
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = file.name;
        anchor.click();
      }
    } else {
      downloadBlob(file);
    }
    setStatus("Guitar Pro file ready");
  } catch (error) {
    console.warn("ChatGPT file bridge unavailable; using browser download", error);
    downloadBlob(file);
    setStatus("Guitar Pro file ready");
  } finally {
    exportGpButton.disabled = false;
  }
});

window.addEventListener("beforeunload", destroyAlphaTab, { once: true });
window.addEventListener("pagehide", destroyAlphaTab, { once: true });

if (isScorePayload(window.__ALPHATAB_PREVIEW_SCORE__)) {
  fullscreenButton.disabled = true;
  renderScore(window.__ALPHATAB_PREVIEW_SCORE__);
} else {
  const app = new App(
    { name: "guitarpro-tab-composer-score-viewer", version: "0.1.0" },
    { availableDisplayModes: ["inline", "fullscreen"] },
    { autoResize: true }
  );
  appBridge = app;
  app.onhostcontextchanged = (context) => updateDisplayMode(context.displayMode);
  app.onteardown = async () => {
    destroyAlphaTab();
    return {};
  };
  app.addEventListener("toolresult", (result) => {
    if (isScorePayload(result.structuredContent)) {
      renderScore(result.structuredContent);
    } else {
      scoreElement.innerHTML = '<div class="error" role="alert">The host returned invalid score data.</div>';
      setStatus("Invalid score data");
    }
  });

  try {
    await app.connect();
    updateDisplayMode(app.getHostContext()?.displayMode);
    setStatus("Waiting for score…");
  } catch (error) {
    console.error("MCP Apps connection failed", error);
    scoreElement.innerHTML = '<div class="error" role="alert">The score host could not be reached.</div>';
    setStatus("Host connection failed");
  }
}
