# Architecture

This project generates YouTube timestamps and summaries from the video's available transcript. Summaries can run locally with Apple Intelligence without a cloud provider. ChatGPT/Codex and Grok are available for timestamps and optional model summaries.

## Current Generation Pipeline

The current approach is split into transcript extraction, optional provider timestamp generation, configurable summary generation, deterministic timestamp validation, and native YouTube panel integration:

1. The Safari content script runs only on supported YouTube watch and live pages.
2. The content script fetches the available YouTube captions/transcript for the current video.
3. The companion app lets the user choose a provider and model, and optionally sign in with ChatGPT or Grok.
4. The background script starts separate timestamp and summary jobs so each tab can report its own progress and failure state.
5. If the selected provider is ready, the native extension sends the timestamped transcript to that provider for timestamp generation.
6. The native extension sends the transcript to Apple Intelligence or the selected provider for summary generation.
7. Generated timestamp candidates are aligned back to real transcript cue times before the content script renders clickable chapters.
8. When YouTube's `In this video` panel is available, the content script mounts generated `Chapters` and `Summary` there; otherwise it falls back to the standalone sidebar.

Generated chapters and summaries start automatically when a supported video opens and the required provider/engine is available. Without the selected provider, `Summary` remains available when Apple Intelligence is ready, while generated chapters/timestamps show a provider connection prompt.

The core rule is:

- code owns timing
- the selected provider owns timestamp topic wording when connected
- the selected summary engine owns summary wording

ChatGPT may choose topic titles, but generated timestamp candidates are validated against real transcript timestamps before they become clickable chapters/timestamps.

## Why This Approach

Earlier versions asked the model to create timestamps directly from raw caption lines. That produced plausible topic names, but timings could drift, collapse into the wrong part of the video, or extend beyond the video's duration.

The current approach is more stable than sending YouTube video input directly because:

- transcript timestamps remain the source of truth
- the selected provider receives transcript text instead of asking a video-input API to infer timing
- summary and timestamp generation run from the same fetched transcript
- generated timestamps are aligned back to real transcript cue times in code

## Transcript Preparation And Validation

YouTube captions often arrive as tiny fragments, for example:

```text
[00:03] so when did you get interested in the
[00:06] subject
[00:07] of ufos that happened at a surprisingly
```

Older local timestamp experiments lightly merged these into shorter readable blocks while preserving the first real timestamp for each block. The current default timestamp path sends the original timestamped transcript to the selected provider and validates the returned timestamps against the original transcript cue times.

For summaries, timestamp prefixes are stripped before sending transcript text to the selected summary engine because summaries do not need cue-level timing.

## Provider Paths

The stable provider uses the same broad ChatGPT/Codex approach seen in Hermes and OpenClaw:

- device-code sign-in through `auth.openai.com`
- token refresh through the Codex OAuth token endpoint
- timestamp generation through `https://chatgpt.com/backend-api/codex/responses`
- no OpenAI API key and no developer-operated backend

ChatGPT settings and sign-in tokens are kept locally in the shared app group container so the companion app and native extension can use the same account state.

The Grok provider uses xAI browser OAuth with PKCE. The companion app temporarily listens only on `127.0.0.1:56121` while a person explicitly signs in, receives the browser callback, and immediately closes the listener. The sandboxed extension then sends direct HTTPS Responses requests to `api.x.ai` using the shared OAuth session. No command-line client, background helper, Login Item, or developer-operated backend is involved.

On the tested macOS 27 beta system, Safari can still display a `127.0.0.1` connection error after a successful xAI approval even though the app attempted the normal loopback callback flow. The cause is unresolved; do not describe it as fixed or attribute it to the OS beta without further evidence. To keep sign-in usable, the companion app displays a manual fallback for the same short-lived OAuth session. A person may paste the complete failed callback URL or the one-time authorization code, after which the app exchanges it with the in-memory PKCE verifier. Full callback URLs still require the original OAuth state to match. No callback URL or authorization code is stored. The detailed status and follow-up work are in [docs/grok-integration.md](docs/grok-integration.md).

For this app, Grok defaults to Grok 4.5 and keeps Grok 4.3 available as a fallback for timestamps and selected-provider summaries. When a Grok account is connected, the companion app also asks xAI's `/v1/language-models` endpoint for text-input/text-output `grok-*` models available to that account, so newly available Grok chat models can appear without a hard-coded app update. Grok 4.20, Grok Build, Imagine, and voice models are not valid timestamp/summary choices; any previously saved Grok 4.20 or Build choice normalizes to Grok 4.5 when settings load.

ChatGPT/Codex starts from a known-good static model list because this integration talks to ChatGPT's Codex backend, not a documented public OpenAI API model-catalog endpoint. To allow model-picker updates without shipping a new binary, the companion app also fetches a small static catalog from `docs/model-catalog.json` on the repository's `main` branch and caches it for one hour. Future-looking `gpt-*` selections are preserved instead of being normalized away, so a catalog-added ChatGPT model can be selected and sent through the existing Codex Responses backend. The catalog format and maintenance procedure are in [docs/model-catalog.md](docs/model-catalog.md).

Both the containing app and Safari extension remain sandboxed in Debug and Release. The app has loopback-server entitlement solely for the temporary user-initiated OAuth callback; the extension has no server entitlement.

The provider abstraction is intentionally small: provider ID, separate timestamp and summary model IDs, sign-in status, timestamp generation, and optional summary generation. This keeps the door open for future providers such as Ollama or OpenRouter without changing the YouTube content-script routing.

## Summary Engine

The summary request runs in parallel with timestamp generation. Users can independently choose timestamp and summary models. The summary model can be:

- `Apple Intelligence`, which keeps the summary on the Mac
- any model available from the selected provider, which sends the transcript to that provider for generation

Apple Intelligence is optional and is not used as a silent fallback. If the user chooses Apple Intelligence and it fails, the transcript is not silently sent to the selected provider.

When the selected summary engine is Apple Intelligence, the ordinary `Summary` tab chooses its implementation by macOS version:

- On macOS 26, it uses the established character-based chunking path unchanged.
- On macOS 27, it uses the on-device `SystemLanguageModel` with the newer token-aware planning APIs. The planner reads the model context size, counts prompt tokens before choosing chunk boundaries, and prewarms generation requests.

Selected-provider summaries are unchanged on both operating-system versions: they continue to use the selected Grok or ChatGPT model. The Summary diagnostics identify the macOS 27 on-device Apple path so it can be evaluated without creating a second sidebar tab.

Private Cloud Compute is intentionally not in any active app path while the managed `com.apple.developer.private-cloud-compute` entitlement is pending. The former T27/S27 tabs were removed because attempting PCC without that entitlement terminated the Safari extension process instead of returning a recoverable generation error. See [docs/macos27-summary.md](docs/macos27-summary.md) for the observed behavior and test plan.

## Result Caption

The extension keeps generated-result tab labels stable. In the native panel, generated timestamps are presented as `Chapters`; in the standalone fallback they remain `Timestamps`. Successful results show generation attribution and elapsed time in the small caption below the result instead:

- timestamps and selected-provider summaries: `Generated with <model> in <seconds> seconds.`
- Apple Intelligence summaries: `Generated with Apple Intelligence in <seconds> seconds.`

This keeps timing visible during testing without changing the tab title while generation results are cached or revisited.

## Native YouTube Panel Integration

The preferred YouTube surface is the native `In this video` engagement panel. The content script injects extension-owned `Chapters` and `Summary` chips into that panel while preserving YouTube-owned `Transcript`, `Timeline`, and native `Chapters` behavior.

The current tab order is:

1. `Chapters`
2. `Summary`
3. `Transcript`
4. `Timeline`

When YouTube provides native chapters, the content script uses them and skips timestamp generation for that video by default. The companion app and Safari toolbar popup expose a chapter source setting: prefer native YouTube chapters, or always generate extension chapters. The Safari popup also has a current-video override, so weak YouTube chapters can be replaced with generated chapters for the current video session and restored back to YouTube chapters when desired. This replacement does not rewrite YouTube's player scrubber chapter segments.

When YouTube does not provide chapters, generated timestamp results are rendered as `Chapters` in the native panel. Generated chapters track video playback and bold the active generated chapter row.

YouTube-owned `Timeline` remains a native surface. After a person selects it, the extension restores YouTube-owned content and avoids forcing the `In this video` panel visible during resync.

Transcript fetching is shared by timestamp generation, summary generation, and transcript copy. One completed transcript and one in-flight transcript request are cached per video so simultaneous generation/copy paths do not fetch the same transcript twice.

The standalone sidebar remains the fallback when the native panel cannot be mounted. Do not remove that fallback while YouTube's native engagement-panel DOM remains private and subject to change.

Implementation details, current caveats, and the regression checklist are documented in [docs/native-panel-integration.md](docs/native-panel-integration.md).

## Timestamp Validation

The native extension:

- parses the topic candidates
- aligns each candidate to the nearest real transcript timestamp
- removes duplicate timestamps

The content script caches the resulting analysis per video, so whichever tab is opened first can populate the other tab without another full pass.

## Important Guardrails

- Do not broaden `content.js` to all YouTube pages. Shorts and non-video pages have fragile layouts.
- Do not let any model output final timestamps without code validation.
- Do not add bundled generation credentials or a developer backend.
- Be explicit in docs/privacy copy that transcript text is sent to the selected cloud provider for timestamp generation and optionally for summary generation.
- Keep Apple Intelligence local and Apple Private Cloud Compute separate in UI/settings copy because local summary generation has no cloud quota while cloud experiments may have quota limits.
- Treat YouTube transcript extraction as best-effort because YouTube does not provide a stable public transcript API for this use case.

## Tuning Knobs

The main timestamp quality controls currently live in `CodexGenerationService.swift` and `GrokGenerationService.swift`:

- timestamp and summary model choices
- timestamp prompt wording
- transcript-time alignment tolerance
- timestamp title cleanup and duplicate removal

The older local timestamp experiment controls still live in `AppleIntelligenceService.swift`:

- analysis chunk size
- light-merge maximum line length
- light-merge maximum elapsed time per block
- number of topic candidates requested per chunk

When tuning, test across several video types before committing:

- short normal video, around 5-10 minutes
- longer normal video, 30-60 minutes
- interview or podcast
- tutorial or explainer
- recently finished live stream
- video without captions/transcript
- Shorts navigation and non-video YouTube pages
