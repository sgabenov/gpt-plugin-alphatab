# GuitarPro Tab Composer

An MCP-based ChatGPT Plugin for generating, rendering, playing, importing, and exporting Guitar Pro music notation and tablature with [alphaTab](https://www.alphatab.net/).

## Project status

The local MVP is implemented. It includes the plugin package, MCP server, MCP Apps UI, the canonical `MusicScoreSpec` v1 contract, deterministic validation and alphaTab compilation, expiring versioned score sessions, Guitar Pro/MusicXML/alphaTex import, Guitar Pro export, notation rendering, and playback controls.

## Planned workflow

1. ChatGPT translates a natural-language musical request into strict structured score data.
2. The MCP server validates and compiles that data into an alphaTab-compatible score.
3. The MCP Apps UI renders standard notation and tablature and provides playback controls.
4. The server imports and exports supported formats, including Guitar Pro 7+ `.gp`.

## Development

Requirements:

- Node.js 20 or newer
- npm
- Python 3 for plugin manifest validation

Install and verify:

```bash
npm install
npm run sync:assets
npm run check
```

## Vendored alphaTab resources

The repository stores the pinned alphaTab 1.8.4 browser runtime, worker and worklet modules, Bravura notation fonts, Sonivox SoundFont, upstream licenses, and a SHA-256 manifest under `vendor/alphatab/1.8.4/`. The UI does not depend on a public CDN.

Run `npm run sync:assets` after installing dependencies whenever the pinned alphaTab package is updated. The build copies these resources to `dist/assets/alphatab/1.8.4/`, and the local server exposes them under `/assets/alphatab/1.8.4/`.

For a deployed server, set `ASSET_BASE_URL` to its public HTTPS origin so the ChatGPT component can load the runtime, fonts, worker, worklet, and SoundFont from that server.

Run the local Streamable HTTP MCP endpoint and asset server:

```bash
npm run dev
```

The endpoint defaults to `http://localhost:8787/mcp`.

Open `http://localhost:8787/preview` to run the same score component with the deterministic Phase 0 fixture outside an MCP host. This route is intended for local rendering and playback smoke tests.

The recorded Phase 0 browser results are available in [`docs/phase-0-rendering-playback-spike.md`](docs/phase-0-rendering-playback-spike.md).

Runtime constraints and the pinned support matrix are documented in:

- [`docs/phase-0-runtime-constraints.md`](docs/phase-0-runtime-constraints.md)
- [`docs/alphatab-compatibility-matrix.md`](docs/alphatab-compatibility-matrix.md)

The canonical Phase 1 score contract is documented in [`docs/music-score-spec-v1.md`](docs/music-score-spec-v1.md) and published as [`schemas/music-score-spec-v1.schema.json`](schemas/music-score-spec-v1.schema.json).

The headless score workflow exposes four MCP tools:

- `validate_score` validates a score without storing it.
- `create_score` creates an expiring session with an opaque score ID and immutable version 1.
- `get_score` reads the latest or a selected historical version.
- `update_score` appends a version only when `expectedVersion` matches the current version and the stable MusicScoreSpec `id` is unchanged.

Sessions default to a one-hour TTL. `create_score` accepts an explicit TTL from 60 seconds to 24 hours and returns the exact `expiresAt` timestamp. Updates do not silently extend the session lifetime. Storage is process-local in this phase, so restarting the MCP server clears all sessions.

## MCP tools

- `validate_score`, `create_score`, `get_score`, and `update_score` manage validated immutable score versions.
- `compile_score` returns deterministic alphaTex for a stored version.
- `render_score` opens a stored version in the interactive notation and playback component.
- `import_score` accepts Guitar Pro, MusicXML, or alphaTex data up to 5 MB.
- `export_score` returns a local Guitar Pro 7+ or alphaTex download link.
- `get_demo_score`, `render_demo_score`, and `export_demo_gp` remain deterministic diagnostics for the original Phase 0 fixture.

The viewer supports track selection, play/pause/stop, playback tempo, looping, metronome, mute, solo, fullscreen requests, score import, and Guitar Pro download. Playback uses alphaTab's default master volume, and users can select a playback position directly in the rendered score.

## Local connection

Run the stdio transport used by the local plugin configuration:

```bash
npm run build
npm run start:stdio
```

The included [`.mcp.json`](.mcp.json) starts this command when the repository is installed as a local Codex plugin. Start a new task after installing or updating the plugin so Codex reloads its Skill and MCP tools.

To test the Streamable HTTP endpoint directly, run MCP Inspector:

```bash
npx @modelcontextprotocol/inspector@latest
```

To connect from ChatGPT Developer mode, expose `http://127.0.0.1:8787/mcp` through OpenAI Secure MCP Tunnel or another HTTPS development tunnel, then add that endpoint under ChatGPT Plugins. Do not expose the unauthenticated local server directly to an untrusted network.

## Example requests

- “Create an eight-bar Drop D metal riff at 140 BPM, render it, and export Guitar Pro.”
- “Write a four-bar fingerstyle study in 6/8 with a repeating bass line.”
- “Import this MusicXML score, show the guitar part, and export it as Guitar Pro.”
- “Change the last bar while preserving the existing notes' stable IDs.”

## Current limitations

- Storage is process-local and expires after the selected TTL.
- Import converts the MusicScoreSpec v1 subset. Unsupported source features are reported or rejected rather than silently trusted.
- The server is intended for a single local user and does not include authentication or durable storage.
- The canonical contract currently focuses on pitched fretted-instrument notation; advanced layout, lyrics, percussion, and exhaustive Guitar Pro techniques remain post-MVP work.

Security, privacy, file limits, and public-deployment requirements are documented in [`docs/security-privacy.md`](docs/security-privacy.md). alphaTab and bundled asset licensing is preserved under [`vendor/alphatab/1.8.4/`](vendor/alphatab/1.8.4/).

## Repository language

All source code, identifiers, documentation, issues, pull requests, commit messages, and developer-facing output must be written in English.

## References

- [OpenAI Plugin architecture](https://developers.openai.com/plugins/concepts/plugins)
- [OpenAI MCP server guide](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI MCP Apps UI guide](https://developers.openai.com/plugins/build/chatgpt-ui)
- [alphaTab documentation](https://www.alphatab.net/docs/introduction)
