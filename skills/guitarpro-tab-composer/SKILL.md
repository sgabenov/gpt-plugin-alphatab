---
name: guitarpro-tab-composer
description: Create, inspect, revise, render, play, import, and export music notation and guitar tablature through alphaTab. Use when a user asks for a riff, guitar tab, playable score, Guitar Pro file, or changes to an existing score.
---

# GuitarPro Tab Composer

Use the plugin tools to turn a user's musical intent into validated notation.

## Workflow

1. Infer reasonable musical defaults when the request is underspecified. Ask a question only when a missing choice would materially change the result.
2. Build a complete MusicScoreSpec v1 document with stable kebab-case IDs. Never construct a binary Guitar Pro file directly.
3. Call `validate_score`. Correct every error diagnostic before continuing.
4. Call `create_score` and retain its opaque `scoreId`, current `version`, and `expiresAt` values.
5. For revisions, call `get_score`, preserve existing entity IDs, and call `update_score` with the current `expectedVersion`. If a version conflict occurs, fetch the latest version before retrying.
6. Call `render_score` only after the final score version is valid. Use `compile_score` when only model-readable alphaTex is needed.
7. Call `export_score` with `gp` or `alphatex` when the user requests a file.
8. Summarize the resulting tempo, meter, tuning, tracks, form, score version, and session expiry.

Use `import_score` for supported Guitar Pro, MusicXML, or alphaTex content. Imports are limited to 5 MB and create a new expiring score session. The interactive viewer also provides a file picker when the host supports MCP Apps tool calls.

## Rendering and files

- Keep data operations separate from rendering. Do not call `render_score` when the user only asks for validation or textual inspection.
- Prefer `export_score` for downloadable files. The viewer's Export GP action is a user-controlled fallback.
- Explain that local sessions are process-local and disappear when the MCP server restarts or the returned TTL expires.
- Never claim that unsupported or skipped source-file features were preserved; report import warnings.
