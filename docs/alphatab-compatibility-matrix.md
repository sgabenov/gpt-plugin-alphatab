# alphaTab Compatibility Matrix

Last verified: 2026-08-26

## Pinned stack

| Component | Pinned version or artifact | Supported use | Verification |
| --- | --- | --- | --- |
| alphaTab | 1.8.4 | Browser rendering, AlphaSynth playback, alphaTex import, GP7+ export | Automated tests and Chromium smoke test |
| Browser runtime | `alphaTab.min.js` | Global `window.alphaTab` API in the MCP Apps iframe | Loaded from the plugin origin |
| Render worker | `alphaTab.worker.min.mjs` | Background score layout and rendering | `playerReady` reached under the preview CSP |
| Audio worklet | `alphaTab.worklet.min.mjs` | AlphaSynth audio output | AlphaSynth initialized and playback cursor advanced |
| Notation font | Bravura WOFF2 with bundled fallbacks | Standard notation glyphs | Standard notation and tablature rendered |
| SoundFont | Sonivox SF2 | AlphaSynth instruments | SoundFont loaded before `playerReady` |
| Node.js | 20 or newer | MCP server, alphaTex parsing, GP export | Type checking, unit tests, and production build |
| MCP Apps SDK | `@modelcontextprotocol/ext-apps` 1.7.5 | Portable iframe bridge | Tool/resource integration tests |
| MCP SDK | `@modelcontextprotocol/sdk` 1.30.0 | stdio and Streamable HTTP transports | In-memory MCP integration tests |

## Format compatibility

| Format | Direction | Phase 0 status | Notes |
| --- | --- | --- | --- |
| alphaTex | Import | Verified | Deterministic two-bar fixture parses and renders |
| Guitar Pro 7+ `.gp` | Export | Verified | `Gp7Exporter` output starts with a ZIP signature and round-trips through alphaTab 1.8.4 |
| Guitar Pro 7+ `.gp` | Import | Verified for generated fixture | Full third-party corpus coverage remains a Phase 1 task |
| GP3/GP4/GP5/GPX | Import | Not verified | Planned after the v1 score model is stable |
| MusicXML | Import/export | Not verified | Outside the Phase 0 acceptance scope |

alphaTab documents the GP7 format as mature and well tested, with 98% total feature coverage at the time of this verification: [Guitar Pro 7 format compatibility](https://www.alphatab.net/docs/formats/guitar-pro-7/).

## Host compatibility

| Host capability | Strategy | Fallback |
| --- | --- | --- |
| MCP Apps UI | Standard `ui://` resource and bridge | Headless tools remain usable without UI |
| MCP Apps display lifecycle | Explicit inline/fullscreen requests plus host-context and size resynchronization | In-place notation retry and inline fallback remain available |
| ChatGPT file bridge | Feature-detect `uploadFile` and `getFileDownloadUrl` | Browser Blob download |
| Codex stored-score export | Post an explicit `export_score` request into chat | Server-provided local path is embedded as SVG or linked as GP |
| Tool-generated file | MCP `resource_link` pointing to the plugin download endpoint | Structured `downloadUrl` in the tool result |
| Public CDN access | Not required | All alphaTab resources are vendored and served by the plugin |

## Upgrade rule

An alphaTab upgrade must update all of the following in one change:

1. The exact npm dependency version.
2. `ALPHATAB_VERSION` and the build asset version.
3. The vendored runtime, worker, worklet, fonts, SoundFont, licenses, and SHA-256 manifest.
4. The GP export round-trip test and browser rendering/playback smoke test.
5. This compatibility matrix.
