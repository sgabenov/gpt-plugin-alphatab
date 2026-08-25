# Phase 0 Runtime Constraints

Last verified: 2026-08-26

## Content security policy

The MCP Apps resource declares one exact origin in both `connectDomains` and `resourceDomains`. The origin comes from `ASSET_BASE_URL`; no public CDN is required. The runtime, render worker, audio worklet, fonts, and SoundFont are all served from versioned paths on that origin.

The local `/preview` route applies a restrictive browser CSP that permits only:

- inline component bootstrap code and scripts from the configured plugin origin;
- styles embedded by the component;
- fonts, network connections, workers, worklets, and media from the configured plugin origin;
- `blob:` only for worker/media behavior and local file downloads;
- `data:` only for images.

The Chromium smoke test reached alphaTab `playerReady`, rendered notation and tablature, and played the fixture without CSP console errors. OpenAI requires exact allowlists for connections and static assets and recommends keeping them narrow: [OpenAI MCP Apps CSP guidance](https://developers.openai.com/plugins/build/chatgpt-ui#content-security-policy-csp).

For plugin submission, the UI also needs a dedicated HTTPS `_meta.ui.domain` unique to the plugin. Localhost is a development-only configuration: [OpenAI plugin UI reference](https://developers.openai.com/plugins/reference#component-resource-meta-fields).

## SoundFont and browser audio policy

The player uses the vendored Sonivox SF2 file. Controls remain disabled until alphaTab emits `playerReady`. alphaTab defines that event as the point at which workers, audio output, SoundFont, and MIDI data are ready: [alphaTab playerReady reference](https://www.alphatab.net/docs/reference/api/playerready/).

Playback never starts automatically. The user must click Play/Pause because Web Audio playback can be blocked until user interaction: [MDN autoplay guidance](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).

The UI reports SoundFont loading progress, exposes renderer errors, and calls `AlphaTabApi.destroy()` on both `beforeunload` and `pagehide`.

The inline host lifecycle is handled separately from alphaTab rendering. The component reports its stable inline height through the MCP Apps size bridge, refreshes display mode after host focus and visibility changes, and ignores nested tool results that are not score payloads. A 30-second notation timeout exposes an in-place retry instead of leaving the loading overlay indefinitely.

## Guitar Pro file delivery

alphaTab 1.8.4 provides `Gp7Exporter`, which serializes a score to a `Uint8Array`: [alphaTab exporter guide](https://www.alphatab.net/docs/guides/exporter).

Phase 0 implements three delivery paths:

1. `export_demo_gp` returns an MCP `resource_link` plus a structured download URL.
2. The plugin server serves the deterministic `.gp` bytes with an attachment content disposition.
3. For stored scores in Codex, the SVG and GP buttons send an exact `export_score` follow-up request into the chat instead of navigating the sandboxed iframe. The assistant embeds the returned SVG `localPath` as one Markdown image or returns the GP `localPath` as one Markdown link.
4. Standalone preview mode retains host file-bridge and browser object-URL fallbacks for development diagnostics.

ChatGPT documents its file upload/download helpers as optional extensions, so the component does not assume they exist: [OpenAI file APIs](https://developers.openai.com/plugins/reference#file-apis).

The generated Phase 0 file is deterministic, starts with the GP7 ZIP signature, and round-trips through the pinned alphaTab importer with the same title, bar count, and track count.

## Production boundary

Before public deployment:

- set `ASSET_BASE_URL` to the public HTTPS plugin origin;
- configure the dedicated UI domain required by plugin review;
- serve the MCP endpoint, assets, and download endpoint over HTTPS;
- repeat the CSP, playback, and file-download checks inside ChatGPT itself;
- keep the browser Blob path as the portable MCP Apps fallback.
