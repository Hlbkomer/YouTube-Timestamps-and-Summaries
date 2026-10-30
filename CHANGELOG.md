# Changelog

## Unreleased

## v1.2: 2026-10-30

- Show the actual Gemini model version returned by Google in new Chapters and Summary result notes, while retaining the Flash latest alias in Settings. Keep the selected model label as a fallback when Google omits a version.

- Accept Gemini chapter timestamps wrapped in Markdown or brackets and equivalent clock padding, while still requiring an exact transcript cue time. Keep Grok's strict formatting contract. Clarify Gemini's plain-text chapter instructions and preserve response-model, length, usage, and accepted-count diagnostics when no usable chapters remain.

- Add Gemini 3.5 Flash-Lite and Gemini 4 Argon for Chapters and Summary, retaining Flash latest as the default. Use explicit low thinking for all three Gemini models, with matching diagnostics. Give Argon a 32,768-token output ceiling for thinking and text, and omit candidate-count overrides. Sort Summary choices alphabetically by provider with newer models first within the selected provider; Apple Intelligence appears first when available.

- Hide YouTube's Timeline chip in the integrated sidebar while keeping Transcript available and preserving native panel cleanup. Rename the displayed provider to `Gemini` throughout Settings and provider messages; keep its existing internal identifier and saved settings.

- Add Google Gemini API-key support for Chapters and Summary using Gemini Flash latest (`gemini-flash-latest`) with explicit low thinking. Use generic default fallback for unsupported saved model IDs, with no model-specific migration. Record the resolved response model in diagnostics. Validate model access before saving keys in the shared macOS Keychain; add masked key entry that stays locked until the saved key is removed, native provider routing, token diagnostics, safe error handling, and response/credential regressions. Google AI Pro developer credits can fund eligible API usage; Gemini subscription OAuth is not used.

- Survive Safari suspending the extension background page under tab pressure. A generation status poll that gets no answer within 20 seconds is retried after 1 second (logged as `status poll N got no answer`) and only fails after six consecutive misses or the overall generation budget. The provider-status check on page open now retries timeouts or missing answers up to three attempts with a 1 s / 2 s backoff, shows a neutral `Checking provider status...` state until a real answer arrives instead of the misleading `Apple Intelligence is not available on this Mac` message, and ends with a `Couldn’t check provider status` error and a Try Again button if every attempt fails.
- Offer exactly two ChatGPT/Codex models: GPT-6 Luna (`gpt-6-luna`, the new fast/economical default) and the flagship GPT-6.1 Sol (`gpt-6.1-sol`). Remove GPT-6 Astra and the GPT-5.6 Sol/Terra/Luna choices from the built-in picker, JavaScript fallbacks, and published `docs/model-catalog.json`. Both models send explicit `reasoning.effort = low` and never send sampling parameters; retired or unknown saved selections (GPT-6 Astra, GPT-5.x, GPT-4.x, GPT-3.x) now fall back to GPT-6 Luna, and the old Sol-alias / GPT-5.4 / GPT-5.5 migrations are gone.
- Add Grok 4.7 (`grok-4.7`) as the built-in Grok default for Chapters and Summary. Send explicit low reasoning for Grok 4.7, 4.6, and 4.5 at the final shared xAI request boundary; retain Grok 4.3 with the provider default. Canonicalize 4.7 aliases, expand regression coverage, and add an opt-in signed-Debug Grok 4.7 backend smoke test.

### Earlier 1.2 candidate work (August–September 2026)

- Add GPT-6 Astra (`gpt-6-astra`) to the built-in and remote ChatGPT/Codex catalogs for Chapters and Summary. Preserve Luna as the fast default and all existing valid choices; retain Astra's provider-default reasoning without unsupported sampling parameters. Add picker/settings regressions and an opt-in signed-Debug backend smoke test.
- Remove GPT-5.5 ahead of its ChatGPT/Codex retirement; old saved GPT-5.5 settings now use the normal GPT-5.6 Luna default.
- Prepare public version 1.2 with internal build 8, refreshed GitHub Pages product copy, current companion/native-panel imagery, and release documentation.
- Derive provider request user agents from the app or extension bundle version instead of continuing to identify every release as version 1.0.
- Package future GitHub release downloads with the app and a Finder-visible `Applications` shortcut, while keeping the temporary Apple notarization upload app-only.
- Close the remaining post-live Description-panel race: explicit engagement targets can never qualify as the targetless `In this video` parent shell, even when YouTube temporarily exposes stale title or chip semantics, and a shell auto-opened by the extension is hidden again if YouTube reuses it or its positive caption/chapter/result evidence disappears.
- Prevent an empty native panel shell from authorizing panel opening or automatic generation until caption tracks, a completed transcript, real YouTube chapters, or an existing result provide positive content evidence. Also require an explicitly transcript-labelled control before transcript discovery clicks inside YouTube's transcript-section renderer. Together these close the remaining captionless-live paths where YouTube reused empty shells or generic controls for the structured Description panel.
- Prefer freshly requested YouTube player caption URLs for transcript acquisition, while retaining page-embedded caption URLs and the existing transcript-panel/timed-text sources as fallbacks. This removes repeated empty page-caption requests without changing transcript sharing, caption selection, or generated output.
- Prevent captionless live videos from opening YouTube's Description engagement panel during transcript discovery. An empty transcript-section shell no longer authorizes a generic description expansion; only a real transcript control can be clicked.
- Consolidate the duplicate ChatGPT and Grok summary instructions into one shared, versioned provider prompt builder and one production-version switch. Carry verified title, channel, cleaned description, duration, and caption source through the selected-provider summary boundary while keeping production on the exact legacy Prompt 1 contract.
- Add a gated signed-Debug provider prompt comparison runner that preserves the one-call full-transcript architecture, enforces the configured low reasoning for the curated Grok models, captures latency/first-output/token metrics, resumes completed calls, and exports sandbox-safe Xcode attachments. Retain the full eight-video, 32-output Prompt 1/Prompt 2 corpus under `test-results/provider-prompt-comparisons`; Prompt 2 improved names and attribution but remained too verbose and slow for production.
- Record the post-comparison decision to keep provider Prompt 1: Prompt 2 and the earlier elaborate Prompt 3 direction are not recommended. Defer a lean shared Prompt 1.1 using only compact title, channel, and cleaned-description context, and separately document that Apple Intelligence does not yet receive those fields.
- Fix the background completion path so successful native Chapters and Summary responses cannot fail while formatting optional diagnostics. Add executable start-to-completion coverage for ChatGPT Chapters and Summary, Grok Chapters and Summary, and Apple Intelligence Summary jobs.
- Keep one `Apple Intelligence` choice in the existing Summary model picker, backed by the more precise adaptive-grounded pipeline, with result captions using the same name.
- Replace the legacy Apple Intelligence `<= 2`-chunk baseline branch: exactly one chunk now uses a strict one-call reader-facing Markdown contract, while two or more chunks use the grounded multi-chunk pipeline. Narrow protocol-leak detection to actual schema/tool markers so an ordinary JSON code fence is treated as an invalid output format rather than mislabeled as model-internal text.
- Rework long Apple Intelligence summaries around token-aware transcript thought lines with model-facing timestamps removed: the production pipeline extracts self-contained grounded points, recursively reduces only when required, and performs one final composition. Retain the concise rolling-joined pipeline only for Debug comparisons.
- Preserve timed captions until native Apple chunk planning so cue gaps can improve local thought boundaries, while keeping timestamps out of every Apple summary prompt and continuing to strip them before selected-provider summary requests.
- Harden Apple Intelligence generation with native-boundary transcript redaction, permissive String intermediates, tagged/JSON/prose format recovery, deterministic final rendering, generic-heading removal, protocol-leak cleanup, and stage/retry/recovery/token diagnostics. Targeted reruns of every reproduced format-retry case completed without a repeated retry.
- Fail an Apple long-summary request when a source chunk cannot be recovered instead of silently composing a successful but incomplete summary. Validate the complete final response for JSON/code-fence output and narrow model-protocol detection to line-anchored signatures.
- Make native Swift the sole Apple transcript-redaction boundary, removing the duplicate JavaScript word list and reporting the native redaction count with the completed result.
- Make `Grok 4.6` the built-in Grok default, retain Grok 4.5 and Grok 4.3, canonicalize 4.6/4.5 provider aliases to their curated choices, and preserve existing valid saved selections on upgrade.
- Force Grok 4.6 and Grok 4.5 to explicit low reasoning at the final shared xAI request boundary after hands-on testing found 4.6's implicit high reasoning too slow for the extension UI. Derive `{"effort":"low"}` from the serialized provider model and fail locally if it is ever missing, covering Chapters, Summary, aliases, migrated settings, and repeated attempts.
- Make GPT-5.6 Luna the ChatGPT/Codex default for fresh, reset, or otherwise missing/invalid settings across the native and JavaScript fallback paths while preserving every valid saved model selection on upgrade.
- Remove GPT-5.4 Thinking and GPT-5.4 mini from the ChatGPT model picker now that the GPT-5.6 family covers their roles. Migrate saved GPT-5.4 Thinking selections to GPT-5.6 Terra and saved GPT-5.4 mini selections to GPT-5.6 Luna.
- Keep comparison summary strategies available only to Debug test runners; production stores and routes no Apple strategy preference and always uses the adaptive-grounded pipeline.
- Move Chapters source actions onto a second caption line and remove their terminal periods while preserving the attribution sentence's period.
- Remove redundant generation-log lines for both Chapters and Summary, including the `step: asking…` and `step: waiting…` lifecycle entries. Keep one start, timeout budget, transcript input with language, polling timer, provider metrics, and final outcome.
- Include the YouTube video ID in each Summary and Chapters generation log so diagnostics can be matched to the correct SPA video session.
- Lock in one transcript retrieval per video across native chapters, automatic Summary, and the later `Generate chapters from transcript` action. Concurrent consumers share the in-flight request and later consumers use the completed cache; Chapters keeps cue times, selected-provider Summary removes them on the page, and Apple removes them only after native boundary planning.
- Serialize access-token refresh per provider within each process, reuse shared credentials refreshed by a competing app/extension request, and preserve accounts on rate limits or transient server failures. Only confirmed invalid or revoked refresh credentials now sign the provider out.
- Require both ChatGPT/Codex and Grok streaming responses to reach a terminal completion event so a truncated HTTP 200 stream cannot be accepted as a partial summary or chapter list.
- Remove the redundant provider-status network round trip before generation, refresh only the selected provider when full status is requested, load independent companion-app state concurrently, and reject stale state pushes.
- Render dynamic provider model labels with DOM text nodes, safely reject duplicate Grok OAuth callback query keys, and cover both boundaries with regressions.
- Record the reversible pre-hardening checkpoint and the speed/quality/complexity impact of every review item in `docs/code-review-hardening-2026-07-24.md`; defer the large compiler-disabled Apple cleanup and speculative token-planner optimization to isolated measured changes.
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
