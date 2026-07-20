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
8. When YouTube's `In this video` panel is available, the content script mounts the unified compact `Chapters` view and `Summary` there. Without that shell, it mounts the standalone sidebar only after the shared transcript detector confirms usable captions; if both are absent, it leaves the page untouched.

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

Transcript acquisition is shared per video. Navigation reconciliation, status refresh, and automatic analysis may all ask for the same transcript while YouTube is still exposing captions, but compatible passive prefetch calls reuse the existing promise without registering another consumer. Direct Chapters and Summary consumers also report `transcript: waiting for shared transcript fetch` at most once per result kind for that in-flight request. This keeps the diagnostics readable without changing cache reuse, parallel Chapters/Summary generation, or the active retry that may open YouTube's native transcript panel after a passive fetch fails.

## Provider Paths

The stable provider uses the same broad ChatGPT/Codex approach seen in Hermes and OpenClaw:

- device-code sign-in through `auth.openai.com`
- token refresh through the Codex OAuth token endpoint
- timestamp generation through `https://chatgpt.com/backend-api/codex/responses`
- no OpenAI API key and no developer-operated backend

Provider settings and non-secret expiry metadata are kept in shared app-group preferences. ChatGPT and Grok access/refresh tokens use the local macOS data-protection Keychain with a shared access group, allowing the companion app and native extension to use the same account state without storing bearer credentials in preferences. Every `SecItem` query explicitly sets `kSecUseDataProtectionKeychain`; this is required on macOS for the entitlement-backed access group to apply and prevents the legacy file-based Keychain's per-item authorization prompts. On first use after an upgrade, the shared credential store migrates a complete legacy preference token pair to Keychain and removes the old preference values only after both items are present.

`Shared/GenerationSettings.swift`, `Shared/CodexAuthService.swift`, `Shared/SharedCredentialStore.swift`, and `Shared/XAITokenSession.swift` compile into both the containing app and extension targets. This gives settings normalization, ChatGPT authentication, credential storage, and Grok discovery/token parsing/refresh/network behavior one source of truth. Grok's browser/loopback/manual sign-in remains app-only; the extension wrapper only asks the shared session for status, access tokens, and sign-out.

The Grok provider uses xAI browser OAuth with PKCE. The companion app temporarily listens only on `127.0.0.1:56121` while a person explicitly signs in, receives the browser callback, and immediately closes the listener. The sandboxed extension then sends direct HTTPS Responses requests to `api.x.ai` using the shared OAuth session. No command-line client, background helper, Login Item, or developer-operated backend is involved.

The loopback listener was hardened after traces on the affected Mac showed Safari opening an empty speculative connection before retrying with the real callback. It now keeps non-terminal connections from consuming the OAuth session, reads a complete bounded HTTP header, verifies the callback path and state, and flushes the completion response before teardown. A signed integration test reproduces the probe/retry sequence, and a fresh Safari/xAI authorization subsequently completed without the manual workaround on that Mac. The companion app still exposes a recovery path for the same short-lived session: a person may paste the complete failed callback URL or the one-time authorization code, after which the app exchanges it with the in-memory PKCE verifier. Full callback URLs require the original OAuth state to match, and neither callback URLs nor authorization codes are stored. The detailed design and regression procedure are in [docs/grok-integration.md](docs/grok-integration.md).

For this app, Grok defaults to Grok 4.5 and keeps Grok 4.3 available as a fallback for timestamps and selected-provider summaries. When a Grok account is connected, the companion app also asks xAI's `/v1/language-models` endpoint for text-input/text-output `grok-*` models available to that account, so newly available Grok chat models can appear without a hard-coded app update. Grok 4.20, Grok Build, Imagine, and voice models are not valid timestamp/summary choices; any previously saved Grok 4.20 or Build choice normalizes to Grok 4.5 when settings load.

ChatGPT/Codex starts from a known-good static model list because this integration talks to ChatGPT's Codex backend, not a documented public OpenAI API model-catalog endpoint. To allow model-picker updates without shipping a new binary, the companion app also fetches a small static catalog from `docs/model-catalog.json` on the repository's `main` branch and caches it for one hour. Future-looking `gpt-*` selections are preserved instead of being normalized away, so a catalog-added ChatGPT model can be selected and sent through the existing Codex Responses backend. Known aliases are the exception: the public `gpt-5.6` Sol alias is canonicalized to the explicit Codex slug `gpt-5.6-sol` in saved settings, remote catalog results, and again at the native request boundary because the Codex endpoint rejects the alias with HTTP 400. The catalog format and maintenance procedure are in [docs/model-catalog.md](docs/model-catalog.md).

The default model pair targets the tested quality/speed balance: ChatGPT uses GPT-5.6 Terra, while Grok uses Grok 4.5 with explicit low reasoning. Defaults apply only when a provider has no valid saved model; existing user selections remain authoritative.

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

The production native request protocol accepts Apple Intelligence only for `summaryFull`; unknown generation kinds are rejected at both the WebExtension job and native-handler boundaries. Retired Apple timestamp, short-summary, video-analysis, and PCC implementations are compiler-excluded from the shipping target, reducing their exposure to Foundation Models SDK changes while retaining the investigation source for later removal or an entitlement-gated branch.

## Result Caption

The extension keeps generated-result tab labels stable. In the native panel, generated timestamps are presented as `Chapters`; in the standalone fallback they remain `Timestamps`. Successful results show generation attribution and elapsed time in the small caption below the result instead:

- generated chapters: `Chapters generated with <model> in <seconds> seconds.`
- selected-provider summaries: `Generated with <model> in <seconds> seconds.`
- Apple Intelligence summaries: `Generated with Apple Intelligence in <seconds> seconds.`

This keeps timing visible during testing without changing the tab title while generation results are cached or revisited.

## Native YouTube Panel Integration

The preferred YouTube surface is the native `In this video` engagement panel. The content script opens that panel and injects native-looking `Chapters` and `Summary` chips, while leaving YouTube-owned `Transcript`, `Timeline`, and close controls to YouTube. When YouTube exposes creator chapters, automatic chapters, or a `Key moments` surface, their timestamp/label data is imported into the compact extension Chapters view and the roomier YouTube chapter chip is hidden for that source.

The current tab order is:

1. `Chapters`
2. `Summary`
3. `Transcript`
4. `Timeline`

When YouTube provides native chapters, the content script uses them and skips timestamp generation for that video by default. The companion app sets the global default: prefer native YouTube chapters, or always generate extension chapters. The Chapters footer holds the current-video override. A YouTube result offers `Generate chapters from transcript` until a matching generated result exists, then changes to `View generated chapters`; a generated result offers `View YouTube chapters` only after usable native rows were extracted. The Safari popup contains only Settings and no longer mirrors page state, polls detection, or requires `activeTab`. This replacement does not rewrite YouTube's player scrubber chapter segments.

Chapter availability stays in the content script, which owns YouTube structured data, live DOM discovery, the displayed result, and the per-video override map. `chapter-state.js` supplies the shared 30-second discovery grace and monotonic status merge, so terminal `available`/`unavailable` decisions cannot regress for that video. Moving the action into the panel removed the redundant background page-action cache, popup picker formatter, polling backoff, and runtime-message relay.

Provider capability refresh has the same single-owner rule. `content-state.js` reduces each successful native status response into one coherent snapshot and a serial refresh coordinator coalesces overlapping focus, navigation, initialization, and recovery requests. A transport failure records a transient status error but preserves the last valid capabilities and settings, so a temporary native-message failure cannot change a connected page to an incorrect disconnected state.

The Chapters presentation is source-independent: imported YouTube chapters, automatic Key moments, and generated timestamps use the same compact rows, copy control, seeking behavior, and small origin caption. A YouTube result ends with one subtle left-aligned line: `Chapters provided by YouTube. View generated chapters.` when the alternate result is cached, or `Chapters provided by YouTube. Generate chapters from transcript.` before it exists. A generated result says `Chapters generated with <model> in <time>. View YouTube chapters.` Only the source action is underlined; it is not bold or separated into its own row. All three track video playback and bold the active chapter row.

YouTube-owned `Transcript` and `Timeline` remain native surfaces. The extension observes in-panel tab changes and restores native content. YouTube's page-level `Show transcript` command is a special case: current desktop builds open a separate modern transcript engagement panel, so the stable window capture boundary routes that command through the real Transcript chip already present in the integrated `In this video` row. The adapter preserves extension ownership during the synthetic click and lets the existing native-tab listener transfer ownership on the next event-loop turn, matching a direct user click and preventing stacked panels. If that integrated chip is unavailable, the command falls through untouched.

Close remains a native YouTube interaction, but the extension symmetrically finalizes the visibility of the shell it explicitly opened. A stable capture listener observes the parent panel's Close control and the Close controls of Transcript/Timeline sibling surfaces without cancelling YouTube's event. On the next event-loop turn it hides the integrated parent shell, records the local lifecycle as closed, and removes extension visibility markers. This covers the case where direct DOM mounting made the shell visible while YouTube's private state still considered it closed, and it prevents closing a reopened Transcript surface from revealing a Chapters/Summary panel underneath. Only a later explicit reopen clears the dismissal latch.

Extension-owned Chapters, Summary, Copy, timestamp links, and fallback-sidebar controls are routed through `page-controls.js`. Narrowly scoped capture handlers live at the stable window/document boundary, so YouTube can replace its private chip-row or header DOM without leaving the visible extension controls detached from their actions. Native Transcript, Timeline, and Chapters controls remain outside the extension-control router. Close has its own observer/finalizer because it must preserve YouTube's click while also closing the extension-opened parent shell.

Native-panel reconciliation is idempotent. The engagement-panel observer ignores changes made inside extension-owned controls, and synchronization updates text, ARIA attributes, icons, and visibility only when their desired values change. This prevents the observer from feeding its own DOM writes back into continuous reconciliation. While extension content owns the panel body, a wrapper marker and nested-chip CSS temporarily suppress stale native Transcript/Timeline pressed paint and ARIA state. The extension never mutates YouTube's `ytChipShapeSelected`, `ytChipShapeActive`, or `ytChipShapeInactive` classes: removing the marker and restoring button/wrapper ARIA hands selection back without breaking the second or later native-tab click. The same ownership contract applies to both Transcript and Timeline.

Watch-page navigation is handled as a first-class lifecycle rather than assuming a full page load. `content-state.js` owns a bounded transition coordinator. Every `yt-navigate-start` begins a non-destructive transition: the outgoing integration remains visually stable, while URL polling and mutation-observer reconciliation are gated so they cannot race YouTube's destination commit. A finish/page-data event owns the reset. Watch-to-watch navigation clears the previous video's result state and defers rebuilding until the replacement shell begins settling; watch-to-home or another non-video destination removes the integration only after the destination is committed. A short timeout resolves a missing finish event from the current URL.

Fresh SPA page data is accepted only after the transition resolves, and any declared response video ID must match the active URL. Player responses and unkeyed live macro-marker nodes are likewise accepted only after the player identifies itself as the active video. The integration mounts into an available native shell without waiting for chapter detection and performs a bounded series of post-navigation reconciliations while YouTube replaces that shell. A five-second placement deadline ends the native-shell grace period independently from the 30-second chapter-source deadline; after it, the standalone fallback is eligible only when the already-running shared transcript detector has succeeded. Outside an active transition, a lightweight URL-only check recovers when Safari drops a YouTube navigation event. Unlike the removed heartbeat, this check does no panel work unless the actual URL changed.

Tab chrome has a stricter latency rule than analysis. A watch-to-watch reset preserves the existing injected Chapters/Summary controls until YouTube replaces their row. When a replacement engagement-panel row appears, the mutation observer calls the idempotent tab synchronizer immediately, then schedules host placement/rendering for the next animation frame. Transcript acquisition and automatic generation run in a separately monitored promise and are never awaited by the reconciliation lock. Native Transcript/Timeline therefore must not appear alone while extension tabs wait on network or model work.

On non-video YouTube pages, only `route-guard.js` runs. It intercepts watch/live links and forces a real navigation so Safari injects the full watch-page scripts. A finish-event plus URL-change reload fallback covers YouTube interactions that bypass or outrun the click interceptor.

Transcript fetching is shared by timestamp generation, summary generation, and transcript copy. `transcript-orchestrator.js` owns completed-cache reuse, one in-flight request per video, and the escalation from a passive prefetch to a user-visible native-panel attempt after the passive request fails. Simultaneous generation/copy paths therefore do not fetch the same transcript twice. `content-state.js` supplies one eight-video LRU retention policy. Evicting a video removes its transcript, caption tracks, native chapter data/detection, generated results, chapter-source override, and matching `sessionStorage` entries together; the current video and active transcript/generation work remain protected until they finish.

`generation-orchestrator.js` owns request-kind preparation, summary timestamp stripping, transcript-size timeout budgets, independent automatic-generation decisions for Chapters and Summary, monotonic generation identity, per-video/kind request deduplication, and background-job polling/stale-result rejection. A continuation may mutate visible state only when both its video key and generation ID match; video resets invalidate IDs instead of recycling them. Native chapters block only generated Chapters, while an available Summary engine still starts from the shared transcript. `content.js` owns page-specific generation state and rendering, but no longer implements the reusable request/polling machinery.

Copy uses the manifest's `clipboardWrite` permission and three ordered paths: a synchronous selection copy during the click, the page Clipboard API, and an extension-background `ai:copyText` fallback. Success is confirmed with a temporary green checkmark pulse; failure is shown in the sidebar rather than being silent.

The standalone sidebar remains the fallback when the native panel cannot be mounted and a transcript is available. Native mounting requires positive `In this video` evidence: the exact title, or a target-less chip row containing recognized Transcript/Chapters/Timeline semantics. A generic button count is never sufficient because YouTube's structured Description surface can temporarily resemble a tabbed engagement panel. Transcript discovery likewise expands the video description only after YouTube has exposed a real transcript section. A page with neither a genuine native shell nor a usable transcript therefore receives no extension surface, automatic generation attempt, or extension-opened Description panel. Do not remove the transcript-backed fallback while YouTube's native engagement-panel DOM remains private and subject to change.

Implementation details, current caveats, and the regression checklist are documented in [docs/native-panel-integration.md](docs/native-panel-integration.md).

The repository-wide complexity review and prioritized cleanup plan are documented in [docs/code-complexity-review.md](docs/code-complexity-review.md). It also records which Safari/YouTube workarounds are intentional and should not be removed without browser regression testing.

## Timestamp Validation

The native extension:

- parses the topic candidates
- aligns each candidate to the nearest real transcript timestamp
- removes duplicate timestamps

The content script shares one transcript fetch across timestamp generation, summary generation, and transcript copy. Timestamp and summary results are generated and cached independently per video and model/engine, so reopening either result does not start another matching job.

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
