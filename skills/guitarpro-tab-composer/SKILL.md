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
5. For every successful request to create, compose, or generate a score, call `render_score` with exactly the `scoreId` and `version` returned by `create_score` before giving the final response. This is mandatory even when the user also requests a Guitar Pro or alphaTex export.
6. For revisions, call `get_score`, preserve existing entity IDs, and call `update_score` with the current `expectedVersion`. If a version conflict occurs, fetch the latest version before retrying. Render the final updated version before giving the final response.
7. Skip `render_score` only when the user explicitly requests no inline preview or player, or asks solely for validation or textual inspection. Use `compile_score` when only model-readable alphaTex is needed.
8. Call `export_score` with `gp` or `alphatex` when the user requests a file. Exporting never replaces the required inline render for a score-creation request.
9. Summarize the resulting tempo, meter, tuning, tracks, form, score version, and session expiry.

Opening the inline player does not bypass browser audio policy. Never claim that playback started automatically; after `render_score` opens the player, tell the user to press Play when a user gesture is required.

Use `import_score` for supported Guitar Pro, MusicXML, or alphaTex content. Imports are limited to 5 MB and create a new expiring score session. The interactive viewer also provides a file picker when the host supports MCP Apps tool calls.

## Rendering and files

- Keep data operations separate: create or update the score first, then render the final stored version once.
- A request for both a new score and a downloadable file requires both `render_score` and `export_score`.
- Prefer `export_score` for downloadable files. The viewer's Export GP action is a user-controlled fallback.
- Explain that local sessions are process-local and disappear when the MCP server restarts or the returned TTL expires.
- Never claim that unsupported or skipped source-file features were preserved; report import warnings.
