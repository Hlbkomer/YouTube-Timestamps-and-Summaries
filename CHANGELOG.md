# Changelog

## v1.0.3 - 2026-05-02

- Allow Apple Intelligence summaries to work without ChatGPT sign-in, defaulting the sidebar to Summary and gating only Timestamps behind ChatGPT.
- Update companion app setup wording so ChatGPT sign-in is optional instead of required.
- Refresh the companion app checklist for the optional ChatGPT flow.
- Add regression tests for the no-ChatGPT Summary default and generation availability logic.

## v1.0.2 - 2026-04-30

- Restore the stable Apple Intelligence summary path after the token-aware structured-output experiment proved slower and more likely to hit local safety refusals.
- Temporarily show generation duration in the Timestamps and Summary tab labels while testing provider performance.
- Preserve the sidebar scroll position while background generation polling refreshes debug/progress state.
- Tune Apple Intelligence multi-chunk summaries so the first chunk uses the full-summary format and later chunks append useful bullet points.
- Experiment with Apple Intelligence summary-only transcript redaction for explicit terms before local summarization.
- Pass caption language metadata into ChatGPT timestamp and summary prompts so both use the detected caption language.
- Revert Apple Intelligence summary prompts to the previous baseline for non-English testing.
- Add a subtle sidebar copy button that copies the active timestamps or summary with a short extension attribution.
- Pass caption language metadata into Apple Intelligence prompts, keep prompts in English, ask for supported caption languages directly, request English for unsupported caption languages, and reduce Apple summary chunk size for unsupported languages.
- Normalize model-facing caption language names in English so prompts are consistent regardless of the user's Safari language.

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
