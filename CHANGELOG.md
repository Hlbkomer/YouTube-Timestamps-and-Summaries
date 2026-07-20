# Changelog

## Unreleased

- Synchronize the README, GitHub Pages project site, App Store preparation notes, privacy/terms dates, and version 1.1 publication record after the GitHub release.

## v1.1 - 2026-07-20

- Prepare the app and WebExtension metadata for public version 1.1 with internal build 7.
- Standardize iterative Safari testing on the signed Debug host only; reserve Release builds for final packaging so Launch Services cannot expose duplicate Debug/Release extension entries during development.
- Reduce Grok 4.5 chapter and summary latency by explicitly using low reasoning effort, while retaining Grok 4.3 as the provider-default fallback.
- Add Grok request diagnostics for time to first output, reasoning effort, token usage (including reasoning and cached input), and service tier; remove the Responses-inapplicable random Chat Completions conversation header and document why prompt caching remains measurement-gated.
- Keep Grok 4.5 as the default after low reasoning made it typically only about 20% slower than Grok 4.3 in broader hands-on testing while preserving better perceived quality; retain Grok 4.3 as the fastest option and deliberately avoid benchmark UI, adaptive effort, priority-tier, or prompt-cache complexity.
- Make GPT-5.6 Terra the default ChatGPT model for fresh or missing settings while preserving existing valid user selections on upgrade.
- Integrate results into YouTube's native `In this video` panel when available, with injected `Chapters` and `Summary` tabs plus the existing standalone sidebar fallback.
- Make native-panel close/reopen ownership deterministic: let YouTube receive every native Close click, then symmetrically hide the parent shell the extension opened, including when Close came from a Transcript/Timeline sibling surface. Route the description's separate `Show transcript` command through the already-integrated Transcript chip without clearing extension ownership before YouTube processes that native click, so initial Chapters close and repeated close/reopen cycles work without stacked panels.
- Gate the standalone fallback on the shared transcript availability state: when both YouTube's native `In this video` shell and a usable transcript are absent, leave the page untouched instead of mounting an error-only sidebar or starting automatic generation.
- Require positive `In this video` title/tab evidence before native mounting and expand a collapsed description for transcript discovery only when YouTube has already exposed a real transcript section, preventing transcript-free pages from showing the structured `Description` engagement panel in the sidebar area.
- Replace the transient empty Chapters message during watch-to-watch navigation with an explicit `Checking for YouTube chapters...` state while the configured native/Key moments source is resolving. The extension Chapters tab is busy immediately, and the duplicate YouTube-owned Chapters chip stays hidden during that reversible decision window.
- Track automatic Chapters and Summary attempts independently per video, so imported YouTube/Key moments chapters or an earlier Chapters attempt can never suppress automatic Summary creation when a transcript and the configured summary engine are available.
- Keep generation identities monotonic across video resets and forbid stale async work from mutating current loading state, so an old request with the same former numeric ID cannot remove the `Chapters...` busy label while the destination video's chapters are still generating.
- Make passive transcript prefetch idempotent during reconciliation/status refresh and report shared-request waiting only once per request and result kind, removing repeated `transcript: waiting for shared transcript fetch` lines without changing the one-request sharing or active retry behavior.
- Use native YouTube chapters when present and skip generated timestamp creation for those videos.
- Recognize YouTube's automatic `Key moments` presentation and nested macro-marker data as a native chapter source.
- Import YouTube chapters and Key moments into the compact extension Chapters view, hide the roomier native chapter chip, and show a small YouTube origin caption instead.
- Add a chapter source setting in the companion app: prefer YouTube chapters by default, or always generate extension chapters.
- Add cache-aware inline Chapters-footer source actions: YouTube results offer `Generate chapters from transcript` before a matching result exists and `View generated chapters` after it is cached; generated results offer `View YouTube chapters` when extracted YouTube rows exist. Keep the companion-app preference as the default and scope overrides to the current video session.
- Remove the Safari popup's custom `Extension enabled` toggle; extension enablement now stays in Safari's own extension settings.
- Simplify the Safari popup to Settings only; remove its `activeTab` permission and the redundant background page-state cache, picker normalization, polling, content-message relay, and unused native preference-save action.
- Generate transcript-based chapters inside the native panel when YouTube does not provide chapters.
- Share transcript fetching across timestamp generation, summary generation, and native transcript copy so one in-flight transcript request is reused per video.
- Add native-panel copy controls for imported/generated chapters, summaries, and transcripts.
- Request Safari clipboard-write access, rewire preserved native-header controls after script reloads, add an extension-context clipboard fallback, and show a checkmark pulse after successful copies.
- Route extension-owned native-panel and sidebar controls through a stable document-level capture handler so YouTube chip-row and header replacements cannot create intermittent dead-click windows.
- Stop native-panel reconciliation from observing and unconditionally rewriting its own controls, eliminating a self-triggered render loop that could replace or mutate tabs and copy controls during clicks.
- Clear stale native Transcript/Timeline pressed styling and ARIA state with a reversible nested-chip CSS guard while extension Chapters or Summary owns the shared `In this video` content surface. Preserve YouTube's selected/active/inactive chip classes so repeated native -> extension -> native round trips restore both native content and the pressed appearance on every selection.
- Match inactive Chapters, Summary, Transcript, and Timeline chips to YouTube's current five-percent overlay, and suppress retained selected-state backgrounds on native wrappers, buttons, and pseudo-layers so the translucent fill is painted exactly once.
- Keep generating tab colors identical to their normal idle or selected state instead of fading native chips or applying a separate fallback palette; consolidate standalone light/dark tab colors into shared state variables so cascade order cannot override the active theme.
- Stabilize native panel tab order, sizing, scrolling, and Timeline/Transcript tab switching, including a non-destructive native-tab handoff.
- Decouple native-panel placement from chapter-source detection: mount immediately when the native shell exists and make the standalone fallback eligible after a separate five-second placement window plus successful shared transcript discovery.
- Reinitialize the panel reliably during YouTube watch-to-watch SPA navigation with destination-validated data, bounded post-navigation reconciliations, and a URL-only event-loss fallback.
- Keep the outgoing panel visually stable until YouTube commits an SPA destination, prevent the URL fallback and panel observer from racing `yt-navigate-finish`, and defer watch-to-watch result rebuilding until the replacement shell begins settling.
- Keep Chapters/Summary tab injection on the immediate DOM path during SPA transitions: preserve existing extension chrome, inject into replacement tab rows from the observer, and run transcript/generation startup outside the reconciliation lock.
- Force homepage/feed-to-video transitions through a real reload, including finish-event and URL-change recovery, so Safari injects the watch-page integration scripts.
- Keep terminal native-chapter availability monotonic per video in the page-owned detection layer, and refresh the inline source action when late YouTube rows resolve.
- Respect YouTube's native `Timeline` surface after it is selected instead of forcing the `In this video` panel back open during resync.
- Highlight the active imported or generated chapter during playback and seeking.
- Render summary bold text, bold section labels, and one nested bullet level in the native panel and sidebar fallback.
- Restore YouTube-owned sibling engagement panels before handing off to native tabs such as `Timeline`.
- Extract native YouTube panel mounting, tab, visibility, sizing, and header-copy behavior into `native-panel.js`.
- Document the native panel implementation in `docs/native-panel-integration.md`.
- Add a repository-wide code-complexity review covering status refresh reliability, credential storage, dormant generation paths, duplicated shared code, per-video retention, test design, release validation, and the Safari/YouTube workarounds that remain intentional.
- Preserve the last valid provider capabilities across transient native-message failures and serialize overlapping status refreshes through a tested page-state reducer/coordinator.
- Add one eight-video LRU policy that evicts transcript, caption-track, native-chapter, generated-result, source-override, and matching session-storage state together while protecting the current video and active jobs.
- Move ChatGPT and Grok access/refresh tokens from shared preferences to a shared macOS Keychain access group, safely migrate existing complete token pairs on first use, and clear both Keychain and legacy values on sign-out.
- Explicitly use the macOS data-protection Keychain for every credential operation so the shared app/extension access-group entitlement applies and legacy login-Keychain password prompts do not appear; document the one-time reconnect and stale-item cleanup for credentials written by the affected development build.
- Simplify disconnected provider copy in the companion app to `ChatGPT is not connected.` and `Grok is not connected.`, and remove the persistent SuperGrok subscription hint.
- Keep those disconnected-provider labels concise even when the native status includes a provider error, with direct renderer coverage.
- Keep disconnected providers visible but disabled in the companion-app picker, mute a saved unavailable selection, disable the picker when neither provider is connected, and remove the redundant connection hint and UI-state payload.
- Sort account-fetched and saved model choices by version from highest to lowest, so Grok 4.5 appears above Grok 4.3 while equal-version ChatGPT variants retain their curated order.
- Harden the Grok OAuth loopback callback by ignoring Safari's empty speculative connection until the real callback retry arrives, rejecting non-matching state without consuming the session, reading a complete bounded HTTP header, flushing a final browser response before OAuth continuation and listener teardown, retaining an early callback until its async waiter registers, disabling endpoint reuse, adding privacy-safe stage logging, and covering the real listener with a signed integration test.
- Compile one shared GenerationSettings, Codex authentication service, and credential store into the app and extension targets instead of maintaining matching copies.
- Restrict native Apple Intelligence generation to the supported full-summary request, reject unknown job kinds, and compiler-exclude retired timestamp, short-summary, video-analysis, and Private Cloud Compute experiments from production.
- Remove the disabled Apple-to-provider summary fallback, make generation-start checks capability-specific, and ensure one Safari popup click sends exactly one Settings message.
- Make post-notarization stapler and Gatekeeper checks mandatory, document the current Xcode toolchain requirement, and emit the stable public ZIP filename directly from the release script.
- Add direct JavaScript regression tests for status reduction, refresh sequencing, video retention, and popup message count; update Swift contract tests for the shared source layout and Keychain migration boundary.
- Extract one shared Grok token session for discovery validation, token parsing/storage, refresh, HTTP helpers, status, and sign-out while keeping interactive browser/loopback/manual login app-only.
- Replace the Swift source-string regression suite with executable settings normalization, model-catalog, xAI token parsing/trust boundary, temporary Keychain migration, entitlement, and embedded-extension tests.
- Extract transcript request sharing/escalation and generation request preparation/deduplication/background polling from `content.js` into DOM-independent modules with direct tests.
- Restore the Chapters source footer to one compact left-aligned line with a normal-weight underlined action, no preserved template indentation, and the same standard result spacing used by summary captions.
- Make chapter-source wording cache-aware: use `Generate chapters from transcript` before a matching generated result exists, `View generated chapters` when switching to a cached result, and `View YouTube chapters` when switching back to imported chapters.
- Default Grok to Grok 4.5, keep Grok 4.3 as a fallback, and refresh connected xAI text model options from the account-scoped catalog when available.
- Filter old Grok 4.20 models out of the dynamic Grok model catalog.
- Add a remote ChatGPT/Codex model catalog so new `gpt-*` picker options can be added from the repository without a binary update.
- Add GPT-5.6 Sol, Terra, and Luna to the remote ChatGPT/Codex model catalog.
- Send GPT-5.6 Sol to the ChatGPT/Codex backend as `gpt-5.6-sol`, migrate the rejected legacy `gpt-5.6` alias at every settings/catalog/request boundary, exclude that alias from older picker fallbacks, and surface error details from non-200 Codex SSE responses.
- Document Grok catalog filtering and the ChatGPT/Codex remote catalog format, cache behavior, and publication process.
- Complete a version 1.1 code/documentation review covering the removed Safari chapter picker, single-owner native/generated source switching, Key moments, native tab/control behavior, watch-to-watch and watch-to-home transitions, homepage/feed routing, provider credentials, App Store copy, privacy caveats, and release regression gates.

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
