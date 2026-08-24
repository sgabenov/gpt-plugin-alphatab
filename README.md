# alphaTab ChatGPT Plugin

An MCP-based ChatGPT Plugin for generating, rendering, playing, importing, and exporting music notation and guitar tablature with [alphaTab](https://www.alphatab.net/).

## Project status

The project is in Phase 1, the headless-core stage. The implementation includes the plugin package, MCP server, MCP Apps UI boundary, the canonical `MusicScoreSpec` v1 contract, deterministic validation, and expiring versioned score sessions.

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

Run the local Streamable HTTP MCP endpoint:

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

The `export_demo_gp` MCP tool returns the deterministic Phase 0 Guitar Pro file as a resource link. The same file is available from `/downloads/phase-0-drop-d-riff.gp` while the local server is running.

Run the stdio transport used by the local plugin configuration:

```bash
npm run build
npm run start:stdio
```

## Repository language

All source code, identifiers, documentation, issues, pull requests, commit messages, and developer-facing output must be written in English.

## References

- [OpenAI Plugin architecture](https://developers.openai.com/plugins/concepts/plugins)
- [OpenAI MCP server guide](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI MCP Apps UI guide](https://developers.openai.com/plugins/build/chatgpt-ui)
- [alphaTab documentation](https://www.alphatab.net/docs/introduction)
