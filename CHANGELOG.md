# Changelog

## v1.0.1 - 2026-04-26

- Prevent duplicate timestamp and summary generation requests when Safari focus, visibility, or content-script lifecycle events fire while a generation job is already starting or running.
- Reuse the existing background generation job for the same video, model, and tab instead of starting a second request.
- Cache accepted timestamp and summary results per video, model, and summary engine so late duplicate responses cannot replace an already displayed result.
- Clean up Apple Intelligence summaries by removing duplicate lines, leftover part/section labels, and excess whitespace.
- Ask Apple Intelligence summary chunks to avoid repeating the same point across bullets.

## v1.0.0 - 2026-04-26

- Initial public release.
- Generate transcript-based YouTube timestamps with the user's selected ChatGPT model.
- Generate summaries automatically with the selected ChatGPT model or optional Apple Intelligence.
- Validate generated timestamps against transcript cue times before rendering clickable timestamp links.
- Provide a macOS companion app for ChatGPT sign-in, generation settings, and Safari extension setup.
- Provide a Developer ID signed, notarized, and stapled GitHub download.
