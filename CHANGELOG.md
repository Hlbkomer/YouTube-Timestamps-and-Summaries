# Changelog

## Unreleased

- Integrate results into YouTube's native `In this video` panel when available, with injected `Chapters` and `Summary` tabs plus the existing standalone sidebar fallback.
- Use native YouTube chapters when present and skip generated timestamp creation for those videos.
- Add a chapter source setting in the companion app: prefer YouTube chapters by default, or always generate extension chapters.
- Add a Safari popup `Show generated chapters (Override native chapters)` checkbox so weak YouTube-provided chapters can be replaced with generated chapters, or restored, for the current video session.
- Remove the Safari popup's custom `Extension enabled` toggle; extension enablement now stays in Safari's own extension settings.
- Keep the Safari popup's generated-chapter override checkbox in sync after the popup closes and reopens.
- Keep Safari popup chapter controls enabled on active YouTube video tabs by using `activeTab` permission and a resilient active-tab lookup.
- Generate transcript-based chapters inside the native panel when YouTube does not provide chapters.
- Share transcript fetching across timestamp generation, summary generation, and native transcript copy so one in-flight transcript request is reused per video.
- Add native-panel copy controls for generated chapters, summaries, and transcripts.
- Stabilize native panel tab order, sizing, scrolling, and Timeline/Transcript tab switching, including a non-destructive native-tab handoff.
- Respect YouTube's native `Timeline` surface after it is selected instead of forcing the `In this video` panel back open during resync.
- Highlight the active generated chapter during playback and seeking.
- Render summary bold text, bold section labels, and one nested bullet level in the native panel and sidebar fallback.
- Restore YouTube-owned sibling engagement panels before handing off to native tabs such as `Timeline`.
- Extract native YouTube panel mounting, tab, visibility, sizing, and header-copy behavior into `native-panel.js`.
- Document the native panel implementation in `docs/native-panel-integration.md`.
- Default Grok to Grok 4.5, keep Grok 4.3 as a fallback, and refresh connected xAI text model options from the account-scoped catalog when available.
- Filter old Grok 4.20 models out of the dynamic Grok model catalog.
- Add a remote ChatGPT/Codex model catalog so new `gpt-*` picker options can be added from the repository without a binary update.
- Add GPT-5.6 Sol, Terra, and Luna to the remote ChatGPT/Codex model catalog.
- Document Grok catalog filtering and the ChatGPT/Codex remote catalog format, cache behavior, and publication process.

## v1.0.5 - 2026-07-01

- Add optional Grok browser OAuth, shared between the sandboxed companion app and Safari extension, with direct xAI Responses requests and no command-line client, Login Item, background helper, or developer backend.
- Add a manual Grok OAuth callback fallback: when Safari cannot connect to the temporary `127.0.0.1` callback after approval, the companion app accepts the complete callback URL or the one-time authorization code and finishes the same PKCE sign-in attempt.
- Keep the unresolved automatic loopback-callback issue visible in the Grok integration notes; the manual fallback is a tested workaround, not a claim that the underlying Safari/macOS 27 beta behavior is fixed.
- Offer only Grok 4.3 for Grok timestamps and selected-provider summaries. Existing saved Grok Build 0.1 choices automatically normalize to Grok 4.3.
- Let Timestamps and Summary choose different models from the selected provider, while retaining Apple Intelligence as the local summary option.
- Keep Apple Intelligence as the independent local summary option when the selected provider is unavailable.
- Remove the experimental `T27` and `S27` sidebar tabs and defer all Private Cloud Compute use until the managed entitlement is approved.
- Keep the established character-based Apple Intelligence Summary path frozen for macOS 26.
- Route the ordinary Apple Intelligence Summary tab to the macOS 27 on-device token-aware path on macOS 27, while preserving selected-provider summaries and exposing the active Apple path in Summary diagnostics.
- Move successful generation timing from the Timestamps/Summary tab titles into the small result caption, alongside the active model or macOS 27 Apple Intelligence path.
- Prewarm Apple Intelligence summary requests and log macOS 27 token usage metrics when the Xcode 27 SDK/runtime exposes them.

## v1.0.4 - 2026-05-10

- Refresh the app and extension icon set to replace the previous YouTube-derived branding with original artwork.
- Add a Safari extension toolbar popup with an Extension enabled toggle for temporarily hiding the sidebar.
- Add a Settings shortcut in the toolbar popup that opens the companion app through the native Safari bridge.
- Add regression coverage for the toolbar popup manifest wiring and permissions.

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
