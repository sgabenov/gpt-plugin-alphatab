# Phase 0 Rendering and Playback Spike

Date: 2026-08-24
alphaTab: 1.8.4
Fixture: `phase-0-drop-d-riff`

## Scope

This spike verifies that the MCP Apps score component can render a deterministic alphaTex score and initialize AlphaSynth using only resources served by the plugin's local asset server.

The `/preview` development route injects the same structured score payload that the `render_demo_score` MCP tool returns. It runs the production UI bundle without requiring an MCP host, so browser behavior can be tested deterministically.

## Verification

The following checks passed in the Codex in-app Chromium browser:

- The component reached the `Ready` state after loading the local runtime, worker, Bravura font, and Sonivox SoundFont.
- Standard notation and six-string guitar tablature rendered for both bars.
- Play/Pause and Stop controls became enabled only after `playerReady`.
- Playback started after an explicit Play/Pause click.
- The visible beat cursor moved from approximately 132 px to 326 px over 1.4 seconds.
- The active beat was highlighted while playback was running.
- Pause and Stop completed without browser console warnings or errors.
- The component registers both `beforeunload` and `pagehide` cleanup handlers, and cleanup calls `AlphaTabApi.destroy()` before clearing the score DOM.

## Reproduction

```bash
npm install
npm run sync:assets
npm run build
npm start
```

Open `http://127.0.0.1:8787/preview`, wait for `Ready`, and use the Play/Pause and Stop controls.

## Boundary

The automated browser can verify AlphaSynth readiness, transport state through cursor movement, and error-free resource loading. Perceived audio output still depends on the host device, output routing, and browser audio policy. The UI therefore starts playback only after explicit user interaction and does not attempt autoplay.
