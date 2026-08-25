---
name: guitarpro-tab-composer
description: Create, inspect, revise, render, play, import, and export music notation and guitar tablature through alphaTab. Use when a user asks for a riff, guitar tab, playable score, Guitar Pro file, or changes to an existing score.
---

# GuitarPro Tab Composer

Use the plugin tools to turn a user's musical intent into validated notation.

The MCP tools are the only supported execution path. If `validate_score`, `create_score`, or `render_score` is unavailable or returns a connection error, stop and report that the GuitarPro Tab Composer MCP server is unavailable. Do not generate substitute scripts, standalone HTML players, browser fallbacks, synthesized audio previews, or files inside the installed plugin directory.

## Workflow

1. Infer reasonable musical defaults when the request is underspecified. Ask a question only when a missing choice would materially change the result.
2. Build a complete MusicScoreSpec v1 document with stable kebab-case IDs. Never construct a binary Guitar Pro file directly.
3. Call `validate_score`. Correct every error diagnostic before continuing.
4. Call `create_score` and retain its opaque `scoreId`, current `version`, and `expiresAt` values.
5. For every successful request to create, compose, or generate a score, call `render_score` with exactly the `scoreId` and `version` returned by `create_score`. The interactive player is the complete user-facing response: after a successful `render_score`, end the turn without prose, a recap, playback instructions, session details, or file links.
6. For revisions, call `get_score`, preserve existing entity IDs, and call `update_score` with the current `expectedVersion`. If a version conflict occurs, fetch the latest version before retrying. Render the final updated version, then end the turn without an additional text response.
7. Skip `render_score` only when the user explicitly requests no inline preview or player, or asks solely for validation or textual inspection. Use `compile_score` when only model-readable alphaTex is needed.
8. `create_score`, `update_score`, and `render_score` generate persistent Guitar Pro, alphaTex, and SVG artifacts, but never expose those artifacts automatically after rendering. File communication begins only after an explicit export request, normally sent by a player button.
9. For an explicit SVG export request, call `export_score` with `svg`, then reply with no prose and exactly one Markdown image using the exact returned `localPath`: `![SVG score](/absolute/path/file.svg)`. Do not escape the path or wrap it in a normal link.
10. For an explicit GP or alphaTex export request, call `export_score` with the requested format, then reply with no prose and exactly one Markdown link using the exact returned `localPath`.

Opening the inline player does not bypass browser audio policy. Never claim that playback started automatically. The player itself exposes the Play control, so do not add playback instructions after rendering.

Use `import_score` for supported Guitar Pro, MusicXML, or alphaTex content. Imports are limited to 5 MB and create a new expiring score session. The interactive viewer also provides a file picker when the host supports MCP Apps tool calls.

## Rendering and files

- Keep data operations separate: create or update the score first, then render the final stored version once.
- Every successful creation or revision generates persistent `.gp`, `.alphatex`, and `.svg` files internally, even though the initial response shows only the player.
- Do not list, summarize, or attach generated artifacts after `render_score`.
- The viewer's Send GP and Send SVG actions post explicit export requests into the chat. Follow those requests without regenerating or rerendering the score.
- Embed SVG exports as an inline Markdown image. Return GP and alphaTex exports as a single clickable Markdown link.
- Discuss session expiry or artifact persistence only when the user explicitly asks about it.
- Never claim that unsupported or skipped source-file features were preserved; report import warnings.
