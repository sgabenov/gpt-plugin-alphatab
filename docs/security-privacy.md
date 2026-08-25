# Security and Privacy

## Local data handling

The local MCP server stores validated MusicScoreSpec sessions as private JSON files in `$GUITARPRO_TAB_DATA_DIR`, `$XDG_DATA_HOME/guitarpro-tab-composer`, or `~/.local/share/guitarpro-tab-composer`. Session files are written atomically with owner-only file permissions, use opaque identifiers, preserve immutable versions across process restarts, expire after an explicit TTL, and are removed lazily after expiration. Corrupt or schema-invalid session files are rejected rather than loaded.

The server does not send score content to third-party services. The browser component loads alphaTab, fonts, workers, the audio worklet, and the SoundFont from the configured plugin origin. No public asset CDN is required.

## File safety

Imports are limited to 5 MB and to supported Guitar Pro, MusicXML, and alphaTex filename extensions. Filenames containing path separators or null bytes are rejected. Parsing is delegated to the pinned alphaTab version and the resulting score is converted into and validated against MusicScoreSpec before storage.

Exports use server-generated filenames and immutable score versions. Dynamic download responses are private, use `no-store`, and remain available only while the related in-memory score session exists.

## Network exposure

The development server binds to `127.0.0.1` by default and has no authentication. Do not expose it directly to an untrusted network. Use an authenticated secure tunnel for remote development access. Authentication, authorization, rate limiting, database-backed multi-process storage, and multi-user isolation are required before a public deployment.

## Privacy and terms

This repository does not provide a hosted service and does not collect telemetry. A future hosted deployment must publish operator-specific privacy and terms URLs, describe retention and subprocessors, and comply with applicable OpenAI plugin review requirements before submission.
