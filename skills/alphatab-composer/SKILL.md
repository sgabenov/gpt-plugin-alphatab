---
name: alphatab-composer
description: Create, inspect, revise, render, play, import, and export music notation and guitar tablature through alphaTab. Use when a user asks for a riff, guitar tab, playable score, Guitar Pro file, or changes to an existing score.
---

# alphaTab Composer

Use the plugin tools to turn a user's musical intent into validated notation.

## Workflow

1. Infer reasonable musical defaults when the request is underspecified. Ask a question only when a missing choice would materially change the result.
2. Use strict structured score data. Never attempt to construct a binary Guitar Pro file directly.
3. Validate a score before rendering or exporting it.
4. Keep data operations separate from rendering. Call the render tool only after the score data is ready.
5. Summarize the resulting tempo, meter, tuning, tracks, and form for the user.

During the technical-spike phase, use `get_demo_score` to inspect the known score and `render_demo_score` to open the interactive alphaTab viewer.
