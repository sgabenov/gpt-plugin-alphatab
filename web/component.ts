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
  scoreId?: string;
  version?: number;
}

interface ScoreReference {
  scoreId: string;
  version: number;
}

interface StoredSvgExport {
  filename: string;
  mimeType: "image/svg+xml";
  downloadUrl: string;
  bytes: number;
  expiresAt: string;
}

interface AlphaTabNamespace {
  AlphaTabApi: typeof AlphaTabApiType;
  FontFileFormat: {
    Woff2: number;
  };
  LayoutMode: {
    Page: number;
    Horizontal: number;
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
  sendFollowUpMessage?: (input: { prompt: string; scrollToBottom?: boolean }) => Promise<void>;
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
      background: var(--color-background-primary, #fff);
      color: var(--color-text-primary, #171717);
      --player-blue: #4d73a5;
      --player-blue-active: #6389bb;
      --panel-active: #dce9f6;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 280px; overflow: hidden; }
    button, select { font: inherit; }
    button:focus-visible, select:focus-visible { outline: 2px solid #2f5f91; outline-offset: -3px; }
    .player-bar button:focus-visible { outline-color: #fff; }
    button:disabled, select:disabled { cursor: not-allowed; opacity: .45; }
    .shell { position: relative; display: grid; grid-template-rows: minmax(360px, 1fr) auto; min-height: 480px; height: min(680px, 72vh); overflow: hidden; background: #fff; color: #111; border: 1px solid var(--color-border-secondary, #dedede); }
    .workspace { min-height: 0; overflow: hidden; }
    .viewport { position: relative; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow-x: hidden; overflow-y: auto; background: #fff; color: #111; }
    .shell.horizontal-layout .viewport { overflow-x: auto; }
    .score { min-width: 100%; padding: 10px 8px 28px; }
    .empty, .error { display: grid; place-items: center; min-height: 330px; padding: 24px; text-align: center; }
    .error { color: #b42318; }
    .loading-overlay { position: absolute; z-index: 4; inset: 0 0 48px; display: grid; align-content: center; justify-items: center; gap: 12px; padding: 24px; background: rgba(255,255,255,.86); color: #555; font-size: 14px; text-align: center; backdrop-filter: blur(1px); }
    .loading-overlay[hidden] { display: none; }
    .loading-retry { appearance: none; min-height: 34px; padding: 6px 14px; border: 1px solid #9bb4d2; border-radius: 4px; background: #fff; color: #244b75; cursor: pointer; font-weight: 650; }
    .loading-retry[hidden] { display: none; }
    .player-bar { z-index: 7; display: flex; align-items: stretch; justify-content: space-between; min-width: 0; min-height: 48px; overflow: hidden; background: var(--player-blue); color: #fff; }
    .controls-left, .controls-right { display: flex; align-items: stretch; min-width: 0; }
    .controls-left { flex: 1 1 auto; }
    .controls-right { flex: 0 0 auto; overflow: visible; }
    .toolbar-button { appearance: none; display: inline-grid; place-items: center; flex: 0 0 46px; min-width: 46px; height: 48px; padding: 0 9px; border: 0; border-radius: 0; background: transparent; color: inherit; cursor: pointer; font-size: 17px; line-height: 1; }
    .toolbar-button:hover:not(:disabled), .toolbar-button[aria-pressed=true] { background: var(--player-blue-active); }
    .toolbar-button.text-button { display: flex; gap: 7px; width: auto; min-width: 72px; font-size: 12px; font-weight: 650; }
    .song-info { display: flex; align-items: center; min-width: 0; padding: 0 8px; white-space: nowrap; }
    .song-title { max-width: 190px; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-weight: 650; }
    .status { max-width: 160px; margin-left: 7px; overflow: hidden; color: rgba(255,255,255,.78); text-overflow: ellipsis; font-size: 10px; }
    .time-position { display: flex; align-items: center; flex: 0 0 auto; padding: 0 8px 0 2px; font-variant-numeric: tabular-nums; font-size: 12px; white-space: nowrap; }
    .drawer { position: absolute; z-index: 6; top: 0; right: 0; bottom: 48px; width: min(380px, 92vw); overflow: hidden; background: #fff; color: #222; box-shadow: -8px 0 22px rgba(0,0,0,.22); border-left: 1px solid #d7d7d7; }
    .drawer[hidden], .drawer-panel[hidden] { display: none; }
    .drawer-header { display: flex; align-items: center; justify-content: space-between; height: 52px; padding: 0 10px 0 18px; color: #333; border-bottom: 1px solid #ddd; }
    .drawer-header h2 { margin: 0; font-size: 16px; font-weight: 650; }
    .drawer-close { appearance: none; width: 38px; height: 38px; border: 0; border-radius: 4px; background: transparent; color: #555; cursor: pointer; font-size: 22px; }
    .drawer-close:hover { background: #eee; }
    .drawer-panel { height: calc(100% - 52px); overflow-y: auto; padding: 14px 16px 22px; }
    .panel-section { margin: 0 0 18px; }
    .section-title { margin: 0 0 9px; color: #666; font-size: 11px; font-weight: 750; letter-spacing: .05em; text-transform: uppercase; }
    .track-list { display: grid; gap: 8px; }
    .track-button { appearance: none; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; width: 100%; min-height: 50px; padding: 7px 10px; border: 1px solid #ddd; border-radius: 5px; background: #fff; color: #333; cursor: pointer; text-align: left; }
    .track-button:hover:not(:disabled) { border-color: #9bb4d2; background: #f4f8fc; }
    .track-button.active { border-color: var(--player-blue); background: var(--panel-active); color: #244b75; }
    .track-icon { display: grid; place-items: center; font-size: 21px; line-height: 1; }
    .track-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 650; }
    .track-number { color: #777; font-size: 11px; }
    .track-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    .panel-button { appearance: none; min-height: 36px; padding: 7px 10px; border: 1px solid #ccc; border-radius: 4px; background: #fafafa; color: #333; cursor: pointer; font-size: 12px; font-weight: 650; }
    .panel-button:hover:not(:disabled) { background: #edf3f9; border-color: #9bb4d2; }
    .panel-button[aria-pressed=true] { border-color: var(--player-blue); background: var(--player-blue); color: #fff; }
    .field { display: grid; grid-template-columns: 92px minmax(0, 1fr); align-items: center; gap: 10px; margin: 8px 0; font-size: 13px; }
    .field select { width: 100%; min-width: 0; height: 34px; padding: 0 8px; border: 1px solid #ccc; border-radius: 4px; background: #fff; color: #222; }
    .toggle-grid, .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .action-grid { margin-top: 8px; }
    .drawer-note { margin: 16px 0 0; color: #777; font-size: 11px; }
    .export-result { display: block; min-height: 18px; margin-top: 10px; color: #315f8e; font-size: 12px; overflow-wrap: anywhere; }
    .export-result:empty { display: none; }
    .at-cursor-bar { background: rgba(91, 91, 214, .14); }
    .at-cursor-beat { background: #5b5bd6; width: 3px; }
    .at-highlight * { fill: #5b5bd6; stroke: #5b5bd6; }
    @media (max-width: 900px) {
      .status { display: none; }
      .song-title { max-width: 130px; }
      .toolbar-button { min-width: 38px; flex-basis: 38px; }
    }
    @media (max-width: 640px) {
      .song-info { max-width: 150px; }
      .song-title { max-width: 105px; }
      .toolbar-button.text-button { min-width: 46px; font-size: 0; gap: 0; }
      .toolbar-button.text-button .control-icon { font-size: 17px; }
      .time-position { padding-right: 4px; font-size: 10px; }
    }
  </style>
  <main class="shell">
    <div class="workspace">
      <div class="viewport">
        <div class="score" aria-label="Rendered music notation">
          <div class="empty">Waiting for score data…</div>
        </div>
      </div>
    </div>
    <div class="loading-overlay" data-ui="loading" role="status" aria-live="polite"><span data-ui="loading-message">Connecting…</span><button type="button" class="loading-retry" data-action="retry-render" hidden>Retry rendering</button></div>
    <aside class="drawer" data-ui="drawer" aria-label="Player options" hidden>
      <header class="drawer-header"><h2 data-ui="drawer-title">Tracks</h2><button type="button" class="drawer-close" data-action="close-panel" aria-label="Close panel">×</button></header>
      <section class="drawer-panel" data-panel="tracks" hidden>
        <div class="panel-section">
          <h3 class="section-title">Visible track</h3>
          <div class="track-list" data-control="tracks"></div>
          <div class="track-actions" aria-label="Selected track controls">
            <button type="button" class="panel-button" data-action="mute" disabled aria-pressed="false">Mute</button>
            <button type="button" class="panel-button" data-action="solo" disabled aria-pressed="false">Solo</button>
          </div>
        </div>
      </section>
      <section class="drawer-panel" data-panel="settings" hidden>
        <div class="panel-section">
          <h3 class="section-title">Playback</h3>
          <label class="field"><span>Speed</span><select data-control="speed" disabled aria-label="Playback speed"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
          <div class="toggle-grid">
            <button type="button" class="panel-button" data-action="count-in" disabled aria-pressed="false">Count-in</button>
            <button type="button" class="panel-button" data-action="metronome" disabled aria-pressed="false">Metronome</button>
            <button type="button" class="panel-button" data-action="loop" disabled aria-pressed="false">Loop</button>
            <button type="button" class="panel-button" data-action="stop" disabled>Stop</button>
          </div>
        </div>
        <div class="panel-section">
          <h3 class="section-title">Display</h3>
          <label class="field"><span>Scale</span><select data-control="zoom" disabled aria-label="Zoom level"><option value="0.5">50%</option><option value="0.75">75%</option><option value="0.9">90%</option><option value="1" selected>100%</option><option value="1.1">110%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select></label>
          <label class="field"><span>Layout</span><select data-control="layout" disabled aria-label="Score layout"><option value="page" selected>Page</option><option value="horizontal">Horizontal</option></select></label>
          <label class="field"><span>Notation</span><select data-control="notation" disabled aria-label="Notation display"><option value="both" selected>Notes + TAB</option><option value="score">Notes</option><option value="tab">TAB</option></select></label>
        </div>
        <div class="panel-section">
          <h3 class="section-title">File and view</h3>
          <div class="action-grid">
            <button type="button" class="panel-button" data-action="export-svg" disabled>Send SVG to chat</button>
            <button type="button" class="panel-button" data-action="export-gp" disabled>Send GP to chat</button>
            <button type="button" class="panel-button" data-action="fullscreen" aria-pressed="false">Fullscreen</button>
          </div>
          <div class="export-result" data-output="export" aria-live="polite"></div>
          <p class="drawer-note">Powered by alphaTab</p>
        </div>
      </section>
    </aside>
    <footer class="player-bar" aria-label="Playback controls">
      <div class="controls-left">
        <button type="button" class="toolbar-button" data-action="import" title="Open score" aria-label="Open score">▰</button>
        <input data-control="file" type="file" accept=".gp,.gp3,.gp4,.gp5,.gpx,.musicxml,.xml,.alphatex,.atex,.txt" hidden>
        <button type="button" class="toolbar-button" data-action="play" disabled title="Play" aria-label="Play">▶</button>
        <div class="song-info"><span class="song-title">GuitarPro Tab Composer</span><span class="status" aria-live="polite">Waiting for score</span></div>
        <div class="time-position" data-output="time">00:00 / 00:00</div>
      </div>
      <div class="controls-right">
        <button type="button" class="toolbar-button text-button" data-action="tracks-panel" aria-expanded="false"><span class="control-icon">♬</span>Tracks</button>
        <button type="button" class="toolbar-button text-button" data-action="settings-panel" aria-expanded="false"><span class="control-icon">⚙</span>Settings</button>
      </div>
    </footer>
  </main>`;

const title = root.querySelector<HTMLElement>(".song-title")!;
const shell = root.querySelector<HTMLElement>(".shell")!;
const status = root.querySelector<HTMLElement>(".status")!;
const loadingOverlay = root.querySelector<HTMLElement>("[data-ui=loading]")!;
const loadingMessage = root.querySelector<HTMLElement>("[data-ui=loading-message]")!;
const retryRenderButton = root.querySelector<HTMLButtonElement>("[data-action=retry-render]")!;
const scoreElement = root.querySelector<HTMLElement>(".score")!;
const viewport = root.querySelector<HTMLElement>(".viewport")!;
const trackList = root.querySelector<HTMLElement>("[data-control=tracks]")!;
const playButton = root.querySelector<HTMLButtonElement>("[data-action=play]")!;
const stopButton = root.querySelector<HTMLButtonElement>("[data-action=stop]")!;
const exportGpButton = root.querySelector<HTMLButtonElement>("[data-action=export-gp]")!;
const exportSvgButton = root.querySelector<HTMLButtonElement>("[data-action=export-svg]")!;
const countInButton = root.querySelector<HTMLButtonElement>("[data-action=count-in]")!;
const loopButton = root.querySelector<HTMLButtonElement>("[data-action=loop]")!;
const metronomeButton = root.querySelector<HTMLButtonElement>("[data-action=metronome]")!;
const muteButton = root.querySelector<HTMLButtonElement>("[data-action=mute]")!;
const soloButton = root.querySelector<HTMLButtonElement>("[data-action=solo]")!;
const speedSelect = root.querySelector<HTMLSelectElement>("[data-control=speed]")!;
const zoomSelect = root.querySelector<HTMLSelectElement>("[data-control=zoom]")!;
const layoutSelect = root.querySelector<HTMLSelectElement>("[data-control=layout]")!;
const notationSelect = root.querySelector<HTMLSelectElement>("[data-control=notation]")!;
const timeOutput = root.querySelector<HTMLElement>("[data-output=time]")!;
const importButton = root.querySelector<HTMLButtonElement>("[data-action=import]")!;
const fileInput = root.querySelector<HTMLInputElement>("[data-control=file]")!;
const fullscreenButton = root.querySelector<HTMLButtonElement>("[data-action=fullscreen]")!;
const drawer = root.querySelector<HTMLElement>("[data-ui=drawer]")!;
const drawerTitle = root.querySelector<HTMLElement>("[data-ui=drawer-title]")!;
const tracksPanel = root.querySelector<HTMLElement>("[data-panel=tracks]")!;
const settingsPanel = root.querySelector<HTMLElement>("[data-panel=settings]")!;
const tracksPanelButton = root.querySelector<HTMLButtonElement>("[data-action=tracks-panel]")!;
const settingsPanelButton = root.querySelector<HTMLButtonElement>("[data-action=settings-panel]")!;
const closePanelButton = root.querySelector<HTMLButtonElement>("[data-action=close-panel]")!;
const exportResult = root.querySelector<HTMLElement>("[data-output=export]")!;

let alphaTabApi: AlphaTabApiType | undefined;
let appBridge: App | undefined;
let isPlayerReady = false;
let isSoundFontLoading = false;
let currentPayload: ScorePayload | undefined;
let selectedTrackIndex = 0;
let isMuted = false;
let isSolo = false;
let isCountIn = false;
let runtimeObjectUrl: string | undefined;
let fontObjectUrl: string | undefined;
let resizeObserver: ResizeObserver | undefined;
let hostResizeObserver: ResizeObserver | undefined;
let playerReadyTimeout: number | undefined;
let renderReadyTimeout: number | undefined;
let isScoreRendered = false;
let playbackRequested = false;
let currentDisplayMode: "inline" | "fullscreen" | "pip" = "inline";
let activePanel: "tracks" | "settings" | undefined;
let currentScoreReference: ScoreReference | undefined;
let exportResultObjectUrl: string | undefined;

function setStatus(message: string): void {
  status.textContent = message;
}

function setLoading(message?: string, canRetry = false): void {
  loadingOverlay.hidden = !message;
  if (message) loadingMessage.textContent = message;
  retryRenderButton.hidden = !message || !canRetry;
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateTime(currentTime = 0, endTime = 0): void {
  timeOutput.textContent = `${formatTime(currentTime)} / ${formatTime(endTime)}`;
}

function showPanel(panel?: "tracks" | "settings"): void {
  activePanel = panel;
  drawer.hidden = !panel;
  tracksPanel.hidden = panel !== "tracks";
  settingsPanel.hidden = panel !== "settings";
  tracksPanelButton.setAttribute("aria-expanded", String(panel === "tracks"));
  settingsPanelButton.setAttribute("aria-expanded", String(panel === "settings"));
  tracksPanelButton.setAttribute("aria-pressed", String(panel === "tracks"));
  settingsPanelButton.setAttribute("aria-pressed", String(panel === "settings"));
  if (panel) drawerTitle.textContent = panel === "tracks" ? "Tracks" : "Settings";
  syncHostFrameHeight();
}

function togglePanel(event: Event, panel: "tracks" | "settings"): void {
  event.preventDefault();
  event.stopPropagation();
  showPanel(activePanel === panel ? undefined : panel);
}

function syncHostFrameHeight(): void {
  if (!appBridge || currentDisplayMode !== "inline") return;
  window.requestAnimationFrame(() => {
    const height = Math.ceil(root!.getBoundingClientRect().height);
    if (height > 0) appBridge?.sendSizeChanged({ height });
  });
}

function syncDisplayModeFromHost(): void {
  if (!appBridge) return;
  updateDisplayMode(appBridge.getHostContext()?.displayMode);
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

function isStoredSvgExport(value: unknown): value is StoredSvgExport {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredSvgExport>;
  return (
    typeof candidate.filename === "string" &&
    candidate.mimeType === "image/svg+xml" &&
    typeof candidate.downloadUrl === "string" &&
    typeof candidate.bytes === "number" &&
    typeof candidate.expiresAt === "string"
  );
}

function destroyAlphaTab(): void {
  isPlayerReady = false;
  isSoundFontLoading = false;
  isScoreRendered = false;
  playbackRequested = false;
  isCountIn = false;
  playButton.disabled = true;
  stopButton.disabled = true;
  exportGpButton.disabled = true;
  exportSvgButton.disabled = true;
  currentScoreReference = undefined;
  exportResult.replaceChildren();
  if (exportResultObjectUrl) {
    URL.revokeObjectURL(exportResultObjectUrl);
    exportResultObjectUrl = undefined;
  }
  for (const control of [
    countInButton, loopButton, metronomeButton, muteButton, soloButton,
    speedSelect, zoomSelect, layoutSelect, notationSelect
  ]) {
    control.disabled = true;
  }
  trackList.replaceChildren();
  showPanel();
  updateTime();
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
  if (renderReadyTimeout !== undefined) {
    window.clearTimeout(renderReadyTimeout);
    renderReadyTimeout = undefined;
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
  fullscreenButton.title = mode === "fullscreen" ? "Return to chat" : "Fullscreen";
  fullscreenButton.setAttribute("aria-label", fullscreenButton.title);
  fullscreenButton.setAttribute("aria-pressed", String(mode === "fullscreen"));
  if (mode !== "inline") showPanel();
  scheduleScoreRender();
  syncHostFrameHeight();
}

function updateActiveTrack(): void {
  for (const button of trackList.querySelectorAll<HTMLButtonElement>(".track-button")) {
    button.classList.toggle("active", Number(button.dataset.trackIndex) === selectedTrackIndex);
    button.setAttribute("aria-pressed", String(Number(button.dataset.trackIndex) === selectedTrackIndex));
  }
}

function selectTrack(trackIndex: number): void {
  if (!alphaTabApi) return;
  const track = alphaTabApi.score?.tracks[trackIndex];
  if (!track) return;
  selectedTrackIndex = trackIndex;
  isMuted = false;
  isSolo = false;
  muteButton.setAttribute("aria-pressed", "false");
  soloButton.setAttribute("aria-pressed", "false");
  updateActiveTrack();
  alphaTabApi.renderTracks([track]);
  void appBridge?.updateModelContext({
    content: [{
      type: "text",
      text: `The user is viewing track ${selectedTrackIndex + 1}: ${track.name || "Unnamed track"} in ${currentPayload?.title ?? "the score"}.`
    }]
  }).catch((error) => console.warn("Could not update model context", error));
}

function applyNotationMode(mode: "both" | "score" | "tab"): void {
  if (!alphaTabApi?.score) return;
  for (const track of alphaTabApi.score.tracks) {
    for (const staff of track.staves) {
      const canShowTab = staff.isStringed;
      staff.showStandardNotation = mode !== "tab" || !canShowTab;
      staff.showTablature = canShowTab && mode !== "score";
    }
  }
  alphaTabApi.renderTracks(alphaTabApi.tracks);
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

function startRenderTimeout(api: AlphaTabApiType): void {
  if (renderReadyTimeout !== undefined) window.clearTimeout(renderReadyTimeout);
  renderReadyTimeout = window.setTimeout(() => {
    if (alphaTabApi !== api || isScoreRendered) return;
    renderReadyTimeout = undefined;
    setStatus("Score rendering timed out");
    setLoading("The score is taking too long to render.", true);
  }, 30000);
}

function renderScore(payload: ScorePayload): void {
  destroyAlphaTab();
  currentPayload = payload;
  if (payload.scoreId && Number.isSafeInteger(payload.version) && payload.version! > 0) {
    currentScoreReference = { scoreId: payload.scoreId, version: payload.version! };
  }
  selectedTrackIndex = 0;
  isMuted = false;
  isSolo = false;
  isCountIn = false;
  speedSelect.value = "1";
  zoomSelect.value = "1";
  layoutSelect.value = "page";
  notationSelect.value = "both";
  shell.classList.remove("horizontal-layout");
  countInButton.setAttribute("aria-pressed", "false");
  metronomeButton.setAttribute("aria-pressed", "false");
  loopButton.setAttribute("aria-pressed", "false");

  const assets = window.__ALPHATAB_ASSETS__;
  if (!window.alphaTab || !assets) {
    scoreElement.innerHTML = '<div class="error" role="alert">Local alphaTab resources failed to load.</div>';
    setStatus("Renderer unavailable");
    setLoading();
    return;
  }

  title.textContent = payload.title;
  setStatus(`${payload.bars} bars · ${payload.timeSignature} · ${payload.tempo} BPM`);
  setLoading("Music sheet is loading…");

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
  startRenderTimeout(api);
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
    if (renderReadyTimeout !== undefined) {
      window.clearTimeout(renderReadyTimeout);
      renderReadyTimeout = undefined;
    }
    playButton.disabled = false;
    exportGpButton.disabled = false;
    exportSvgButton.disabled = false;
    zoomSelect.disabled = false;
    layoutSelect.disabled = false;
    notationSelect.disabled = false;
    setLoading();
    syncHostFrameHeight();
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
    for (const control of [countInButton, loopButton, metronomeButton, muteButton, soloButton, speedSelect]) {
      control.disabled = false;
    }
    updateTime(0, api.endTime);
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
    trackList.replaceChildren();
    for (const track of score.tracks) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "track-button";
      button.dataset.trackIndex = String(track.index);
      button.title = track.name || `Track ${track.index + 1}`;
      button.setAttribute("aria-label", `Show ${button.title}`);
      const icon = document.createElement("span");
      icon.className = "track-icon";
      icon.textContent = track.staves.some((staff) => staff.isPercussion) ? "♩" : "♬";
      const name = document.createElement("span");
      name.className = "track-name";
      name.textContent = track.name || `Track ${track.index + 1}`;
      const number = document.createElement("span");
      number.className = "track-number";
      number.textContent = `#${track.index + 1}`;
      button.append(icon, name, number);
      button.addEventListener("click", () => selectTrack(track.index));
      trackList.appendChild(button);
    }
    updateActiveTrack();
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
    const isPlaying = event.state === 1;
    playButton.textContent = isPlaying ? "❚❚" : "▶";
    playButton.title = isPlaying ? "Pause" : "Play";
    playButton.setAttribute("aria-label", playButton.title);
  });
  api.playerPositionChanged.on((event) => {
    updateTime(event.currentTime, event.endTime);
  });
  api.error.on((error) => {
    console.error("alphaTab error", error);
    if (renderReadyTimeout !== undefined) {
      window.clearTimeout(renderReadyTimeout);
      renderReadyTimeout = undefined;
    }
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
    setLoading("The score could not be rendered.", true);
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
retryRenderButton.addEventListener("click", () => {
  const payload = currentPayload;
  if (payload) renderScore(payload);
});
tracksPanelButton.addEventListener("click", (event) => togglePanel(event, "tracks"));
settingsPanelButton.addEventListener("click", (event) => togglePanel(event, "settings"));
closePanelButton.addEventListener("click", () => showPanel());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activePanel) showPanel();
});
stopButton.addEventListener("click", () => alphaTabApi?.stop());
countInButton.addEventListener("click", () => {
  if (!alphaTabApi) return;
  isCountIn = !isCountIn;
  alphaTabApi.countInVolume = isCountIn ? 0.7 : 0;
  countInButton.setAttribute("aria-pressed", String(isCountIn));
});
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
speedSelect.addEventListener("change", () => {
  if (alphaTabApi) alphaTabApi.playbackSpeed = Number(speedSelect.value);
});
zoomSelect.addEventListener("change", () => {
  if (!alphaTabApi) return;
  alphaTabApi.settings.display.scale = Number(zoomSelect.value);
  alphaTabApi.updateSettings();
  alphaTabApi.renderTracks(alphaTabApi.tracks);
});
layoutSelect.addEventListener("change", () => {
  if (!alphaTabApi || !window.alphaTab) return;
  const isHorizontal = layoutSelect.value === "horizontal";
  shell.classList.toggle("horizontal-layout", isHorizontal);
  alphaTabApi.settings.display.layoutMode = isHorizontal
    ? window.alphaTab.LayoutMode.Horizontal
    : window.alphaTab.LayoutMode.Page;
  alphaTabApi.updateSettings();
  alphaTabApi.renderTracks(alphaTabApi.tracks);
});
notationSelect.addEventListener("change", () => {
  applyNotationMode(notationSelect.value as "both" | "score" | "tab");
});

function safeScoreFilename(extension: "gp" | "svg"): string {
  const stem = (currentPayload?.title ?? "score")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "score";
  return `${stem}.${extension}`;
}

function showExportLink(filename: string, href: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = `Download ${filename}`;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  exportResult.replaceChildren(document.createTextNode("Ready: "), link);
}

function showExportMessage(message: string): void {
  exportResult.textContent = message;
}

function showExportUrl(message: string, url: string): void {
  exportResult.textContent = `${message} ${url}`;
}

function showBlobExport(file: File): void {
  if (exportResultObjectUrl) URL.revokeObjectURL(exportResultObjectUrl);
  exportResultObjectUrl = URL.createObjectURL(file);
  showExportLink(file.name, exportResultObjectUrl);
}

function buildScoreSvg(): { file: File; bytes: Uint8Array } {
  const scoreSvgs = [...scoreElement.querySelectorAll<SVGSVGElement>("svg")];
  if (scoreSvgs.length === 0) throw new Error("The rendered score does not contain SVG notation.");

  let y = 0;
  let width = 1;
  const pages: string[] = [];
  for (const svg of scoreSvgs) {
    const viewBox = (svg.getAttribute("viewBox") ?? "")
      .trim()
      .split(/[ ,]+/)
      .map(Number);
    const bounds = svg.getBoundingClientRect();
    const pageWidth = viewBox.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2]! > 0
      ? viewBox[2]!
      : Math.max(1, Math.ceil(bounds.width));
    const pageHeight = viewBox.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3]! > 0
      ? viewBox[3]!
      : Math.max(1, Math.ceil(bounds.height));
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("x", "0");
    clone.setAttribute("y", String(y));
    clone.setAttribute("width", String(pageWidth));
    clone.setAttribute("height", String(pageHeight));
    pages.push(new XMLSerializer().serializeToString(clone));
    width = Math.max(width, pageWidth);
    y += pageHeight;
  }

  const svgText = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y}" viewBox="0 0 ${width} ${y}">` +
    `<rect width="100%" height="100%" fill="white"/>${pages.join("")}</svg>`;
  const filename = safeScoreFilename("svg");
  const bytes = new TextEncoder().encode(svgText);
  return {
    file: new File([svgText], filename, { type: "image/svg+xml" }),
    bytes
  };
}

async function storeSvgExport(file: File, bytes: Uint8Array): Promise<StoredSvgExport | undefined> {
  if (!appBridge) return undefined;
  try {
    const result = await appBridge.callServerTool({
      name: "store_svg_export",
      arguments: { filename: file.name, dataBase64: bytesToBase64(bytes) }
    });
    return !result.isError && isStoredSvgExport(result.structuredContent)
      ? result.structuredContent
      : undefined;
  } catch (error) {
    console.warn("The SVG could not be stored by the score server", error);
    return undefined;
  }
}

async function sendDownloadLinkToChat(filename: string, downloadUrl: string): Promise<boolean> {
  const prompt = `Export ready: [Download ${filename}](${downloadUrl})`;
  return sendTextToChat(prompt);
}

async function sendTextToChat(prompt: string): Promise<boolean> {
  if (appBridge?.getHostCapabilities()?.message?.text) {
    try {
      const result = await appBridge.sendMessage({
        role: "user",
        content: [{ type: "text", text: prompt }]
      });
      if (!result.isError) return true;
    } catch (error) {
      console.warn("The MCP Apps host could not add the download link to chat", error);
    }
  }
  if (window.openai?.sendFollowUpMessage) {
    try {
      await window.openai.sendFollowUpMessage({ prompt, scrollToBottom: true });
      return true;
    } catch (error) {
      console.warn("The ChatGPT host could not add the download link to chat", error);
    }
  }
  return false;
}

async function requestScoreExportInChat(format: "gp" | "svg"): Promise<boolean> {
  if (!currentScoreReference) return false;
  const deliveryInstruction = format === "svg"
    ? "Reply with no prose and embed the returned file directly in chat as one Markdown image using the exact localPath: ![SVG score](/absolute/path/from-localPath.svg)."
    : "Reply with no prose and return exactly one clickable Markdown link to the Guitar Pro file using the exact localPath.";
  const prompt =
    `Using GuitarPro Tab Composer, call export_score for scoreId ` +
    `${currentScoreReference.scoreId}, version ${currentScoreReference.version}, format ${format}. ` +
    `${deliveryInstruction} ` +
    `Do not regenerate or rerender the score.`;
  return sendTextToChat(prompt);
}

async function copyDownloadLink(downloadUrl: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(downloadUrl);
    return true;
  } catch (error) {
    console.warn("The download link could not be copied", error);
    return false;
  }
}

async function presentDownloadFallback(
  filename: string,
  downloadUrl: string,
  expiresAt?: string
): Promise<void> {
  if (await sendDownloadLinkToChat(filename, downloadUrl)) {
    showExportMessage(`${filename} download link added to chat.`);
    setStatus("Download link added to chat");
    return;
  }
  if (await copyDownloadLink(downloadUrl)) {
    showExportMessage(`${filename} download link copied.`);
    setStatus("Download link copied");
    return;
  }
  const expiry = expiresAt ? ` Temporary link expires ${new Date(expiresAt).toLocaleTimeString()}.` : "";
  showExportUrl(`Copy the ${filename} download URL.${expiry}`, downloadUrl);
  setStatus("Copy the download URL shown below");
}

exportSvgButton.addEventListener("click", async () => {
  if (!isScoreRendered) return;
  exportSvgButton.disabled = true;
  setStatus("Preparing SVG score…");
  try {
    if (appBridge && currentScoreReference) {
      if (!await requestScoreExportInChat("svg")) {
        throw new Error("The host could not send the SVG export request to chat.");
      }
      showExportMessage("SVG export request sent to chat.");
      setStatus("SVG request sent to chat");
      return;
    }
    const { file, bytes } = buildScoreSvg();
    const imageCapability = appBridge?.getHostCapabilities()?.message?.image;
    if (appBridge && imageCapability) {
      const result = await appBridge.sendMessage({
        role: "user",
        content: [
          { type: "text", text: `Exported score image: ${file.name}` },
          { type: "image", data: bytesToBase64(bytes), mimeType: "image/svg+xml" }
        ]
      });
      if (!result.isError) {
        showExportMessage("SVG score added to chat.");
        setStatus("SVG score added to chat");
        return;
      }
    }
    if (await downloadWithMcpHost(file, bytes) || await downloadWithOpenAiHost(file)) {
      showExportMessage("SVG download opened.");
      setStatus("SVG download opened");
    } else if (!appBridge && !window.openai) {
      showBlobExport(file);
      setStatus("SVG ready — use the download link");
    } else {
      const stored = await storeSvgExport(file, bytes);
      if (!stored) throw new Error("The score server could not store the SVG export.");
      await presentDownloadFallback(stored.filename, stored.downloadUrl, stored.expiresAt);
    }
  } catch (error) {
    console.error("SVG score export failed", error);
    setStatus(error instanceof Error ? error.message : "SVG export failed");
  } finally {
    exportSvgButton.disabled = false;
  }
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
  } finally {
    window.setTimeout(syncDisplayModeFromHost, 0);
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

async function downloadWithMcpHost(file: File, fileBytes: Uint8Array): Promise<boolean> {
  if (!appBridge?.getHostCapabilities()?.downloadFile) return false;

  try {
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
    return !result.isError;
  } catch (error) {
    console.warn("MCP Apps download is unavailable", error);
    return false;
  }
}

async function downloadWithOpenAiHost(file: File): Promise<boolean> {
  const host = window.openai;
  if (!host?.uploadFile || !host.getFileDownloadUrl) return false;
  try {
    const { fileId } = await host.uploadFile(file);
    const { downloadUrl } = await host.getFileDownloadUrl({ fileId });
    if (host.openExternal) {
      await host.openExternal({ href: downloadUrl, redirectUrl: false });
      return true;
    }
    if (appBridge?.getHostCapabilities()?.openLinks) {
      const result = await appBridge.openLink({ url: downloadUrl });
      return !result.isError;
    }
    return false;
  } catch (error) {
    console.warn("ChatGPT file download is unavailable", error);
    return false;
  }
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
  setStatus("Requesting Guitar Pro export…");

  try {
    if (appBridge && currentScoreReference) {
      if (!await requestScoreExportInChat("gp")) {
        throw new Error("The host could not send the Guitar Pro export request to chat.");
      }
      showExportMessage("Guitar Pro export request sent to chat.");
      setStatus("GP request sent to chat");
      return;
    }

    const bytes = new window.alphaTab!.exporter.Gp7Exporter().export(
      alphaTabApi.score,
      alphaTabApi.settings
    );
    const fileBytes = Uint8Array.from(bytes);
    const file = new File([fileBytes.buffer], safeScoreFilename("gp"), {
      type: "application/octet-stream"
    });
    if (await downloadWithMcpHost(file, fileBytes) || await downloadWithOpenAiHost(file)) {
      showExportMessage("Guitar Pro download opened.");
      setStatus("Guitar Pro download opened");
    } else if (!appBridge && !window.openai) {
      showBlobExport(file);
      setStatus("GP ready — use the download link");
    } else {
      showExportMessage("Guitar Pro export is unavailable in this host version.");
      setStatus("Guitar Pro export is unavailable in this host version");
    }
  } catch (error) {
    console.error("Guitar Pro export failed", error);
    setStatus(error instanceof Error ? error.message : "Guitar Pro export failed");
  } finally {
    exportGpButton.disabled = false;
  }
});

window.addEventListener("beforeunload", destroyAlphaTab, { once: true });
window.addEventListener("pagehide", destroyAlphaTab, { once: true });
window.addEventListener("focus", syncDisplayModeFromHost);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncDisplayModeFromHost();
});

if (isScorePayload(window.__ALPHATAB_PREVIEW_SCORE__)) {
  fullscreenButton.disabled = true;
  renderScore(window.__ALPHATAB_PREVIEW_SCORE__);
} else {
  const app = new App(
    { name: "guitarpro-tab-composer-score-viewer", version: "0.1.0" },
    { availableDisplayModes: ["inline", "fullscreen"] },
    { autoResize: false }
  );
  appBridge = app;
  app.onhostcontextchanged = (context) => {
    updateDisplayMode(context.displayMode);
    syncHostFrameHeight();
  };
  app.onteardown = async () => {
    destroyAlphaTab();
    return {};
  };
  app.addEventListener("toolresult", (result) => {
    if (isScorePayload(result.structuredContent)) {
      renderScore(result.structuredContent);
    }
  });

  try {
    await app.connect();
    hostResizeObserver = new ResizeObserver(syncHostFrameHeight);
    hostResizeObserver.observe(root);
    syncHostFrameHeight();
    updateDisplayMode(app.getHostContext()?.displayMode);
    setStatus("Waiting for score…");
  } catch (error) {
    console.error("MCP Apps connection failed", error);
    scoreElement.innerHTML = '<div class="error" role="alert">The score host could not be reached.</div>';
    setStatus("Host connection failed");
  }
}
