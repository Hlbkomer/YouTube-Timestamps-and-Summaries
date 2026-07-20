# Code Complexity Review

Date: 2026-07-19

## Scope

This review covers the production JavaScript, Swift app and extension code, release script, automated tests, and developer documentation. It focuses on unnecessary state ownership, dormant paths, duplicated implementations, unbounded state, brittle tests, and compatibility code whose cost is larger than its current purpose.

The review does not treat every timer, fallback, or duplicated-looking event listener as accidental. YouTube replaces private DOM nodes during navigation and tab changes, and Safari imposes user-activation and content-script injection constraints. The final section records the workarounds that remain justified by observed failures.

## Implementation Status

Highest-value work completed on 2026-07-18:

- resolved status failure preservation and overlapping-refresh ordering with a tested pure reducer and serial coordinator
- moved ChatGPT and Grok bearer credentials to a shared Keychain access group with safe legacy migration and sign-out cleanup
- narrowed the production Apple Intelligence protocol to full summaries and compiler-excluded retired timestamp, short-summary, video-analysis, and PCC paths
- compiled one shared `GenerationSettings`, `CodexAuthService`, and credential store into both native targets
- added one tested eight-video LRU that evicts all related page/session caches together while protecting active work
- made final stapler and Gatekeeper validation mandatory and made the public ZIP filename deterministic
- removed the popup double-send, dead status fields/helpers, and disabled Apple fallback branch

Additional work completed on 2026-07-18:

- extracted `XAITokenSession` as the single Grok discovery, token, refresh, storage, status, and HTTP core while retaining app-only interactive sign-in
- replaced the Swift source-string locks with executable settings, catalog, token, trust-boundary, Keychain migration, entitlement, and embedded-extension tests
- extracted transcript request sharing/escalation and generation preparation/deduplication/job polling into DOM-independent tested modules

Release-readiness follow-up completed on 2026-07-19:

- verified that the Safari popup is Settings-only and no longer owns page/chapter detection state
- documented the inline native/generated chapter-source contract, including YouTube creator chapters, automatic Key moments, cache-aware actions, and per-video overrides
- documented the non-destructive navigation transition for watch-to-watch and watch-to-home routes plus the homepage/feed route guard
- confirmed the hardened Grok loopback flow on the formerly affected Mac while retaining the manual recovery path
- restored the intentionally concise disconnected-provider labels and added a direct renderer regression test
- refreshed release, App Store, privacy, and architecture documentation against the current implementation

Behavioral follow-up completed on 2026-07-20:

- gated the standalone fallback on the shared transcript availability state so pages with neither a native shell nor a transcript remain untouched
- replaced the transient watch-to-watch empty Chapters copy with an explicit native chapter-discovery state and reversible duplicate-chip suppression
- replaced the shared automatic-analysis flag with independently tested Chapters and Summary attempt ownership, so native chapters cannot suppress Summary
- made generation identity monotonic across video resets and removed stale-task loading mutations, preventing old async work from changing a current tab's busy label
- audited the complete Grok generation path and confirmed Grok 4.5 low reasoning is injected by the one shared xAI Responses request builder for Chapters, Summary, and retries
- made compatible passive transcript prefetch idempotent and limited shared-request diagnostics to one line per request/result kind, removing reconciliation-driven log spam without weakening request sharing or active retry escalation

Work deliberately left for focused follow-up:

- share provider SSE parsing only after provider-specific error semantics have fixture coverage
- consider an always-loaded navigation bootstrap only with a dedicated Safari regression pass

## Priority 1: Correctness And Security

### Preserve the last valid provider status and sequence refreshes

Status: **Resolved.** `content-state.js` now owns the reducer and serial coordinator, with direct tests for transport failure preservation and overlapping refreshes.

Before the fix, `content.js` converted a failed `ai:getStatus` request into `null`, then immediately derived capability fields from that empty response. A transient native-message failure could therefore change previously valid capabilities to false. The same function could be started by initialization, focus, navigation, and generation-error recovery without one in-flight request owner, allowing an older response to overwrite newer state.

Recommended change:

- keep the last valid status unchanged when transport fails
- coalesce concurrent refreshes or attach a monotonically increasing request generation and apply only the latest response
- calculate the complete next status in one pure reducer, then assign it once
- retain an explicit transient status error separately from provider authentication errors
- add behavioral tests for a failed refresh and out-of-order responses

This is a real reliability issue, not only a refactoring preference.

### Store OAuth tokens in a shared Keychain access group

Status: **Resolved.** Both native targets have the same Keychain access group. ChatGPT and both Grok services use `SharedCredentialStore`; all operations explicitly target the data-protection Keychain so the access group actually governs macOS sharing instead of legacy per-item ACLs. Complete legacy preference pairs migrate before preference cleanup, and sign-out clears Keychain plus legacy values.

Before the fix, ChatGPT and Grok access and refresh tokens were stored in shared app-group `UserDefaults`. This made app/extension sharing simple, but refresh tokens are bearer credentials and preferences are not the macOS credential store.

Recommended change:

- move access/refresh tokens to Keychain items shared by the app and extension through a Keychain access group
- keep non-secret expiry and UI settings in app-group defaults
- migrate existing defaults once, then remove the old values
- test migration, sign-out deletion, refresh, and access from both targets

This is security hardening rather than evidence of a current compromise.

## Priority 2: Remove Or Consolidate Unnecessary Machinery

### Remove retired Apple Intelligence entry paths from the shipping target

Status: **Production exposure resolved; physical source removal deferred.** Web and native routing now reject unsupported kinds, and retired/PCC blocks are compiler-excluded. They remain visible as disabled investigation source until they are deleted or moved to an entitlement-gated branch.

At review time, `AppleIntelligenceService.swift` was 2,178 lines. Content/background routing selected provider timestamps and sent Apple Intelligence only `summaryFull`, yet the service still compiled older `timestamps`, `summary`, and `videoAnalysis` branches plus deferred Private Cloud Compute experiments. Several PCC entry helpers had no caller, and PCC was unreachable because the extension lacks the managed entitlement.

The dormant code is risky even when it cannot be selected: it still compiles against beta SDK APIs, obscures the active on-device summary path, and increases the surface affected by Foundation Models changes.

Recommended change:

- reduce the native protocol to an enum of supported generation requests
- keep only the macOS 26 and macOS 27 on-device `summaryFull` implementations in the shipping service
- move PCC experiments to a separate branch or a source file excluded from production targets until the entitlement exists
- delete old local timestamp/video-analysis helpers after confirming no released-version compatibility requirement
- reject unknown native `kind` values instead of routing every unknown value to timestamps

### Use one shared Swift source for shared contracts and token cores

Status: **Resolved.** Settings, Codex authentication, credential storage, and Grok post-login token/refresh/network behavior are shared sources compiled into both targets. Grok's interactive browser and loopback UI boundary remains intentionally app-only.

At review time, the app and extension contained near-identical copies of `GenerationSettings.swift` and `CodexAuthService.swift`. `GenerationSettings` differed mainly in declaration order and one provider-validation implementation; `CodexAuthService` differed by the extension-only `accessToken()` method. Swift tests scanned both files for matching source strings, detecting some drift while also confirming two sources of truth.

The app and extension `XAIAuthService` files are legitimately different at the UI boundary: only the app should own browser sign-in and the loopback server. Their token storage, refresh, discovery, error parsing, and sign-out core are nevertheless duplicated.

Recommended change:

- compile one shared `GenerationSettings` source into both targets
- share the Codex token/auth implementation and expose target-specific operations through small wrappers or protocols
- extract an `XAITokenSession` shared core while leaving loopback and manual sign-in in the app target
- keep the dynamic remote model catalog separate from the static offline fallback

### Bound all per-video caches through one retention policy

Status: **Resolved.** One tested eight-video LRU now evicts transcript, track, native-chapter, result, override, and matching session-storage entries together while protecting the current video and active work.

Before the fix, the transcript cache was limited to five videos, but native chapter data, chapter detection, caption-track results, generated results, per-video source overrides, and generated-result `sessionStorage` entries had no common limit or cleanup path. A long-running YouTube tab could therefore accumulate state for every visited video until the document or session ended.

Recommended change:

- create one per-video session store with an LRU limit
- retain the current video, active jobs, and a small number of recent videos
- evict all related map entries together
- prune generated-result `sessionStorage` keys by version and age/recency
- keep the existing background-job 30-minute retention policy

### Replace source-string assertions with behavior tests

Status: **Resolved for the reviewed suite.** Status reduction, refresh coordination, retention, popup messaging, chapter state, panel rules, control routing, transcript sharing, and generation polling have direct JavaScript tests. Swift tests now execute settings normalization, catalog validation, xAI token parsing and URL trust, a temporary shared-Keychain migration, entitlement parsing, and embedded-extension discovery instead of scanning production source strings.

The Swift suite contains 260 expectations and almost all of them assert that source files contain particular strings. Several JavaScript routing tests also inspect source text. These checks are useful as temporary regression locks, but they do not execute the status reducer, settings normalization, native bridge contract, provider SSE parsing, or navigation state transitions. They also make safe renaming/extraction expensive.

Recommended change:

- compile shared settings/auth code into the test target and assert behavior directly
- extract content status, per-video retention, chapter-source selection, and generation routing into DOM-independent modules
- test native request/response DTOs with typed fixtures
- keep only a small number of manifest/package structure assertions as source or file tests
- use DOM fixtures for the few YouTube integration rules that truly depend on markup shape

### Make release validation fail when the notarized artifact is invalid

Status: **Resolved.** The final stapler and Gatekeeper checks are fatal, the pre-notarization assessment is explicitly informational, the documented Xcode requirement matches the project, and the script emits the stable public ZIP name.

Before the fix, the release script ignored failures from `stapler validate` and the post-notarization Gatekeeper assessment with `|| true`, but still printed `Release build complete.` The pre-notarization Gatekeeper check could reasonably be informational; the final notarized checks needed to be mandatory. `RELEASING.md` also said Xcode 14 was sufficient even though the project targets macOS 26.4 and uses Foundation Models.

Recommended change:

- let stapler validation and the final `spctl` assessment fail the release
- label the pre-notarization `spctl` result as informational
- update the Xcode prerequisite to the actual supported toolchain
- make the stable public ZIP filename part of the script instead of a manual rename

## Priority 3: Small, Safe Cleanup

### Fix the popup compatibility wrapper

Status: **Resolved.** The Safari Promise API is called exactly once, with a regression test proving one click sends one message.

Before the fix, `popup.js` first called `runtime.sendMessage(message)` to test for a Promise and then called it again with a callback when no Promise was returned. On callback-style runtimes, one Settings click sent two `ai:openApp` messages. Safari's `browser` implementation normally returns a Promise, so this was latent compatibility behavior rather than the normal Safari path.

Use one API style exactly once, preferably the Safari `browser` Promise API used by the rest of the extension, and add a one-click/one-message test.

### Remove dead fields, duplicate assignments, and helpers

Status: **Resolved for the confirmed list.** Status reduction removed duplicate assignments and dead connection state, `canStartGeneration` is capability-specific, the unused caption helper is gone, and the disabled Apple provider fallback was deleted.

The confirmed small leftovers were:

- `selectCaptionTrack()` is declared but only `rankCaptionTracks()` is used
- `state.engine` is initialized and assigned but never read
- `state.codexLoginError` is maintained but never rendered independently from `providerError`
- `summaryAvailable` is calculated twice in one status refresh
- `canStartGeneration(kind)` ignores `kind` and duplicates caller capability checks
- the disabled Apple-summary provider fallback retains a feature-flag branch in production

Remove these only after the status reducer and behavior tests exist, so cleanup does not change capability semantics accidentally.

### Share provider response parsing where behavior is truly identical

Status: **Open by design.** This remains lower value than the completed correctness/security work and should wait for provider-specific fixtures.

The Codex and Grok generation services repeat language-context formatting, Responses-style SSE event accumulation, output-item extraction, and portions of success/error payload construction. Authentication headers, endpoints, account handling, and error semantics remain provider-specific.

A small shared SSE/output parser is appropriate. A single universal provider service is not; it would hide real protocol differences behind conditionals.

## Strategic Refactoring

### Split the watch-page controller by responsibility

Status: **Substantially progressed.** Status/refresh coordination and per-video retention live in `content-state.js`; transcript request sharing/escalation lives in `transcript-orchestrator.js`; generation preparation, deduplication, and background polling live in `generation-orchestrator.js`. YouTube-specific transcript discovery, visible generation state, and rendering remain in `content.js` by design.

At 4,544 lines, `content.js` still owns page lifecycle, YouTube data discovery, page-specific transcript acquisition, visible generation state, result caching, rendering and CSS, clipboard behavior, timestamp seeking, and chapter-source policy. The functions are reasonably named, but unrelated presentation changes still share one state object and one closure. The highest-risk reusable transitions are now imported and tested through the extracted status, retention, transcript, generation, chapter, navigation, control-routing, and native-panel modules.

Refactor incrementally after the Priority 1 fixes:

1. Extract the status reducer and request coordinator.
2. Extract the per-video session/LRU store.
3. Extract transcript acquisition and caching.
4. Extract generation job orchestration.
5. Leave the thin page lifecycle and rendering coordinator in `content.js`.

Do not perform a one-shot rewrite. Each extraction should preserve the current browser behavior and add direct tests first.

### Treat the route guard as architectural debt, not dead code

Status: **Retained and better isolated.** The guard and URL fallback remain covered by routing tests until an always-loaded bootstrap is proven in Safari. The watch controller now gates observer/URL reconciliation during a bounded navigation transition, so those recovery paths no longer compete with `yt-navigate-finish` or tear down the outgoing panel before YouTube commits a destination.

The extension currently has two navigation controllers: `route-guard.js` runs on non-video YouTube pages and forces real navigation into watch/live pages, while `content.js` handles watch-to-watch SPA changes and also polls the URL for missed events. This is not elegant, and full reloads are a UX cost. It exists because Safari injects the full integration only on matched watch/live documents and earlier all-page integration disturbed Shorts and feed layouts.

A future always-loaded, tiny bootstrap could own URL transitions and start/stop the watch controller without forcing reloads. That is a browser-tested redesign, not a safe deletion. Until it exists, removing the guard or either URL fallback will regress homepage-to-video or watch-to-watch navigation.

## Complexity That Is Currently Justified

The following mechanisms should remain unless browser testing proves a simpler replacement:

- one page-owned chapter detection/source state with monotonic per-video resolution
- the scoped native-panel `MutationObserver` and bounded post-navigation reconciliation delays
- stable capture routing for extension-owned controls at the window/document/Shadow Root boundaries
- `WeakSet` listener ownership for YouTube nodes that can survive a script reload
- reversible visual suppression for stale Transcript/Timeline pressed state without mutating YouTube's chip classes
- the transcript-gated standalone sidebar fallback and five-second native-panel discovery grace, which prevent visible panel migration and error-only surfaces
- transcript acquisition fallbacks, because YouTube has no stable public transcript API for this use case
- synchronous selection copy followed by page and background clipboard fallbacks, because Safari user activation is fragile
- background generation jobs, pending-job persistence, stale-video generation IDs, and job polling
- separate app-only Grok sign-in UI/loopback handling and extension-only token consumption

The native-message review found no orphaned Safari extension actions: every current native action has a background caller. The companion-app JavaScript actions also map to native handlers. The chapter-source redesign now has one authoritative page owner and no remaining popup/background relay.

## Original Recommended Order

1. Fix status failure preservation and refresh sequencing; add behavior tests.
2. Move OAuth credentials to a shared Keychain group.
3. Remove unreachable Apple Intelligence/PCC paths from the production target.
4. Consolidate shared Swift sources.
5. Add unified per-video retention.
6. Replace brittle source assertions as modules are extracted.
7. Harden release validation.
8. Apply the small dead-code and popup cleanups.
9. Consider the bootstrap/navigation redesign only with a dedicated Safari regression pass.
