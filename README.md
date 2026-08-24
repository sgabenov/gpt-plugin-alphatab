# alphaTab ChatGPT Plugin

An MCP-based ChatGPT Plugin for generating, rendering, playing, importing, and exporting music notation and guitar tablature with [alphaTab](https://www.alphatab.net/).

## Project status

The project is in Phase 0, the technical-spike stage. The current implementation proves the plugin package, MCP server, MCP Apps UI boundary, and a known alphaTex score flow before the full `MusicScoreSpec` model is introduced.

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
