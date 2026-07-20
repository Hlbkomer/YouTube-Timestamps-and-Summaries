# Native YouTube Panel Integration

Date: 2026-07-20

This note documents the implemented move from the extension-owned YouTube sidebar toward YouTube's native `In this video` engagement panel. The original investigation remains in [chapter-integration-investigation.md](chapter-integration-investigation.md); this file describes the current implementation.

## Goals

- Prefer YouTube's native `In this video` panel when it exists.
- Import YouTube's creator chapters, automatic chapters, and `Key moments` into the compact extension Chapters view by default.
- Generate our own transcript-based chapters when YouTube does not provide chapters, when the global setting says to always generate, or when the Chapters footer overrides the current video.
- Keep `Summary` in the same native panel.
- Reuse YouTube's native `Transcript` and `Timeline` tabs when they exist.
- Keep the old standalone sidebar as a fallback when the native panel is unavailable and a transcript is confirmed.
- Avoid patching YouTube player scrubber-bar internals.

## Code Map

Primary files:

- `YouTube Timestamps and Summaries Extension/Resources/background.js`
- `YouTube Timestamps and Summaries Extension/Resources/chapter-state.js`
- `YouTube Timestamps and Summaries Extension/Resources/content-state.js`
- `YouTube Timestamps and Summaries Extension/Resources/transcript-orchestrator.js`
- `YouTube Timestamps and Summaries Extension/Resources/generation-orchestrator.js`
- `YouTube Timestamps and Summaries Extension/Resources/content.js`
- `YouTube Timestamps and Summaries Extension/Resources/manifest.json`
- `YouTube Timestamps and Summaries Extension/Resources/page-controls.js`
- `YouTube Timestamps and Summaries Extension/Resources/native-panel.js`
- `YouTube Timestamps and Summaries Extension/Resources/popup.html`
- `YouTube Timestamps and Summaries Extension/Resources/popup.js`
- `YouTube Timestamps and Summaries Extension/Resources/youtube-helpers.js`
- `tests/js/manifest-routing.test.cjs`
- `tests/js/chapter-state.test.cjs`
- `tests/js/content-state.test.cjs`
- `tests/js/transcript-orchestrator.test.cjs`
- `tests/js/generation-orchestrator.test.cjs`
- `tests/js/native-panel.test.cjs`
- `tests/js/page-controls.test.cjs`
- `tests/js/youtube-helpers.test.cjs`
- `YouTube Timestamps and SummariesTests/YouTube_Timestamps_and_SummariesTests.swift`

Key `content.js` state:

- `state.timestampsSource`: distinguishes generated timestamps from `youtubeChapters`.
- `state.activeTab`: extension result kind, still `timestamps` or `summary` internally.
- `state.nativeExtensionTab`: currently selected extension-owned native tab.
- `state.nativeYouTubeTab`: currently selected YouTube-owned tab such as `transcript` or `timeline`.
- `state.nativePanelDismissed`: latches an explicit native close across observer/reconciliation passes; only an explicit reopen path clears it.
- `state.userSelectedTab`: prevents automatic default selection from overriding a person's tab choice.
- `state.nativeChaptersOverridden`: marks the current video session as using generated chapters instead of YouTube native chapters.
- `chapterSourceOverrideByVideoKey`: stores current-session per-video overrides selected from the Chapters footer.
- `transcriptCache`: completed transcript results by video ID.
- `transcriptRequestCache`: one in-flight transcript request by video ID.
- `videoRetention`: one eight-video LRU owner that evicts every cache/session entry associated with an old video.

Key `content.js` flows:

- `applyNativeChaptersIfAvailable()` runs before provider timestamp generation, converts YouTube chapter data to compact timestamp rows, and marks their source when the preference/override allows it.
- `switchVideoChapterSource()` sets the current-video override directly on the page, clears the current chapter result, keeps the Chapters surface selected, and starts the existing timestamp generation path when generated chapters are requested.
- `chapterSourceSwitch()` exposes the alternate source action only when it is valid; generated results offer YouTube chapters only after native rows were actually discovered.
- `getPanelMount()` chooses native-panel placement first and transcript-confirmed standalone sidebar placement second.
- `getTranscript()` owns transcript caching and in-flight request de-duplication. Repeated compatible passive prefetch calls return the current promise directly, and the transcript orchestrator emits the shared-fetch diagnostic only once per request/result kind.
- `syncActiveChapterTracker()` and `syncActiveChapterHighlight()` own source-independent active-chapter highlighting.
- `startNativePanelObserver()` watches engagement-panel DOM changes and schedules one animation-frame reconciliation when YouTube rebuilds the panel.
- Summary rendering uses `renderSummaryHTML()` from `youtube-helpers.js` so safe formatting behavior is unit-tested.

Key `chapter-state.js` flow:

- `normalizeDetectionStatus()` is the page's single chapter-detection normalization rule.
- `mergeDetectionStatus()` makes a resolved per-video result monotonic: `available` or `unavailable` cannot regress to `pending` or `unknown`.
- `NATIVE_CHAPTER_DISCOVERY_GRACE_MS` keeps the structured-data and lazy-DOM discovery paths on one 30-second deadline.
- Popup presentation, background page-action caches, retry backoff, effective-source merging, and the unused native preference-save bridge action were removed when the per-video switch moved into the page that already owns the authoritative state.

Key `content-state.js` flow:

- `reduceStatusState()` preserves the last valid capabilities when a status transport request fails and derives each successful capability snapshot once.
- `createSerialRefreshCoordinator()` coalesces overlapping refresh triggers and applies a queued follow-up only after the current request completes, preventing an older response from overwriting newer state.
- `createVideoRetention()` owns recency and whole-video eviction. The current video and active transcript/generation keys are protected, while old transcript, caption, chapter, result, override, and `sessionStorage` entries are pruned together at an eight-video limit.

Key orchestration-module flows:

- `transcript-orchestrator.js` owns cache hits, in-flight request sharing, one shared-wait notification per request/result kind, request cleanup, and a retry with native-panel access when a passive prefetch fails.
- `generation-orchestrator.js` owns request-kind/timeout/transcript preparation, per-video request deduplication, background-job polling, progress callbacks, timeout normalization, and stale-result rejection.
- YouTube DOM transcript discovery and visible generation state remain in `content.js`; the extracted modules have no DOM dependency and are tested directly.

Key `native-panel.js` flow:

- `createNativePanelController()` receives explicit hooks for state, rendering, transcript copy, and generation retries.
- `getMount()` finds the native `In this video` panel and returns its shell, content body, and tab list.
- `syncTabs()` injects, orders, selects, and resyncs extension-owned native chips.
- `syncNativeOwnedTabVisibility()` hides YouTube's native `Chapters` or `Key moments` chip while imported or replacement chapters use the compact extension view.
- `syncNativeOwnedTabSelectionAppearance()` temporarily suppresses native Transcript/Timeline pressed styling while an extension tab owns the shared content surface, without changing YouTube's internal chip classes.
- `syncContentVisibility()` hides YouTube-owned body content while an extension tab is active and restores it for native tabs.
- `syncHeaderCopyButton()` owns the header copy button beside YouTube's close button.
- `syncBodyViewport()` owns native panel body height and scrolling.

Key `page-controls.js` flow:

- `createPageControlHandler()` routes only extension-owned controls identified by extension data attributes.
- The same handler is attached at the stable window and document capture boundaries, with the standalone Shadow Root as a fallback.
- Replaced YouTube chip rows and headers therefore do not create a period where extension tabs or Copy lack a listener.
- YouTube-owned Transcript, Timeline, chapter/Key moments, and Close controls do not match the click router. Transcript, Timeline, and Close remain visible native interactions; the native chapter chip is presentation-only and is hidden when its data has been migrated.
- `isExtensionOwnedNativeControlNode()` identifies observer records created inside injected tabs and header actions so reconciliation ignores its own DOM work.

Key `youtube-helpers.js` flow:

- `parseNativeYouTubeChapters()` reads native chapters from YouTube structured data.
- It prefers engagement-panel macro markers, searches nested macro-marker data used by `Key moments`, and falls back to player-bar chapter renderers.
- It deduplicates repeated chapter entries before returning normalized `{ time, label, seconds }` items.
- `renderSummaryHTML()` safely renders summary paragraphs, bold text, bold section labels, top-level bullets, and one nested bullet level while escaping raw HTML.

## User-Facing Behavior

The extension opens and augments YouTube's native `In this video` panel for its own results. It does not prevent, replace, or redirect the Close, Transcript, or Timeline controls inside that panel. Because the extension can make the existing shell visible while YouTube's private state still considers it closed, it observes Close and finalizes hiding that same shell after YouTube receives the click. The separate `Show transcript` command in the video description is routed through the existing in-panel Transcript chip when the integrated shell is available, because YouTube otherwise opens a second transcript-only engagement panel without Chapters or Summary.

The intended tab order is:

1. `Chapters`
2. `Summary`
3. `Transcript`
4. `Timeline`

### Close and reopen ownership contract

The panel has two state owners that can temporarily disagree: the extension controls the DOM visibility needed to mount Chapters/Summary, while YouTube keeps a private open/closed state for its native engagement surfaces. Showing the existing DOM node does not necessarily tell YouTube that it is open. This was the root cause of Close working only after visiting Transcript and failing again after a `Show transcript` reopen.

Keep these invariants together:

- Observe Close at the stable window capture boundary, not only on a header element that YouTube can replace.
- Do not cancel, replace, or stop the native Close click. YouTube must receive it first.
- Finalize closure on the next event-loop turn by hiding the integrated parent shell the extension made visible and marking the local lifecycle `closed`.
- Apply that finalization when Close originates from the parent Chapters/Summary shell or from a Transcript/Timeline sibling surface; otherwise closing Transcript can reveal a second panel underneath.
- Keep `state.nativePanelDismissed` latched through mutation-observer reconciliation. A still-visible frame during Close is not a reopen.
- Route the description-level `Show transcript` command through the integrated Transcript chip when available. Reset the close latch for that explicit reopen, but preserve extension ownership until YouTube processes the native chip click on the next turn.
- Do not add polling, repeated synthetic clicks, or YouTube-private chip-class mutations to this lifecycle. The symmetric open/close boundary plus the existing observer is sufficient.

The automated regression tests cover direct Close from Chapters, Close from a reopened Transcript sibling, and three repeated Close -> `Show transcript` -> Close cycles. The manual release matrix repeats the same sequence in Safari because YouTube's private state cannot be reproduced completely by DOM mocks.

`Timeline` is shown only when YouTube provides it. `Transcript` is YouTube-owned. `Summary` and the unified compact `Chapters` view are extension-owned tabs injected into the native tab row.

If YouTube already has native chapters:

- the extension uses those chapters by default
- timestamp generation is skipped for that video unless the global setting or current-video override requests generated chapters
- the YouTube timestamps and labels are rendered as compact rows in our `Chapters` tab
- the native YouTube `Chapters` or `Key moments` chip is hidden to avoid a duplicate, roomier list
- a small caption identifies YouTube as the source
- `Summary` remains available

If YouTube has no native chapters:

- the extension generates transcript-based timestamps as `Chapters`
- generated chapters appear in the native panel
- the active chapter is bolded as video playback moves

If the native panel cannot be mounted, the extension falls back to the standalone sidebar only after shared transcript discovery succeeds.

## Unified Chapter Source And Presentation

Chapter source selection and chapter presentation are intentionally separate:

- `View YouTube chapters` means “switch to timestamps and labels supplied by YouTube.” It does not mean “show YouTube's native card list.”
- `Generate chapters from transcript` means the matching generated result does not exist yet and must be created with the selected provider.
- `View generated chapters` means a matching generated result is already cached and switching does not start another provider request.
- Both sources render through the same compact extension `Chapters` view, use the same timestamp-link behavior, copy control, scrolling, and active-row highlight.
- Imported rows end with `Chapters provided by YouTube.` and, when timestamp generation is available, either `Generate chapters from transcript` or `View generated chapters` according to cache state. Copied imported rows end with `Chapters provided by YouTube.`
- Generated rows use `Chapters generated with <model> in <time>.` When YouTube chapters were actually discovered, the caption adds a `View YouTube chapters` action.

YouTube's chapter-like surface is treated first as a discovery signal and then as a data source. The extension does not hide that surface merely because a `Chapters` or `Key moments` label exists. It waits until one of these outcomes is stable:

1. Timestamp/label rows are extracted. Detection becomes `available`, the rows are cached for the video, the compact Chapters view is selected, and the duplicate native chapter chip is hidden.
2. The current data proves there are no chapters and no lazy chapter surface is visible. Detection becomes `unavailable` and generated chapters may start.
3. A lazy Chapters/Key moments surface exists but has not exposed rows. Detection stays `pending` until rows arrive or the shared 30-second deadline expires; after the deadline, generation is the safe fallback.

Do not reintroduce source-specific chapter renderers. Uniform presentation is now an invariant; only the origin caption and the source-selection state should differ.

## Native Panel Mounting

The content script identifies YouTube's parent `In this video` engagement panel by its visible title or its native chip row. The creator/automatic macro-marker panels are separate sibling panels and are used only as live chapter-data sources, not mistaken for the parent mount.

Important implementation points in `content.js`:

- `nativePanel.getMount()` finds the native parent panel, direct `#content` child, and native tab list.
- Parent recognition is positive rather than shape-only: accept the exact `In this video` title, or a target-less tab row with recognized Transcript/Chapters/Timeline semantics. Never accept an arbitrary target-less panel merely because it contains two buttons; YouTube's structured Description panel can briefly expose similar markup.
- `nativePanel.open()` makes the existing native panel visible, chooses the default extension/native tab when appropriate, and respects a person's explicit close.
- Close uses a three-phase local lifecycle (`idle`, `closing`, `closed`) alongside `state.nativePanelDismissed`. A stable window capture listener observes—but does not cancel—the native Close click. On the next event-loop turn, after YouTube's handler has run, it hides the extension-opened parent shell and marks the lifecycle closed. The same route recognizes Close on Transcript/Timeline sibling surfaces, so closing a reopened native surface cannot reveal the integrated shell underneath. A later explicit reopen resets the latch.
- `nativePanel.syncTabs()` keeps extension-owned chips ordered and synced with YouTube-owned chips.
- `getPanelMount()` prefers the native panel and falls back to the old sidebar target only when native mounting is unavailable.
- Native placement is independent from chapter-source detection. As soon as the `In this video` shell exists, Chapters/Summary mount there even if native chapter detection is still pending.
- A separate five-second placement window covers ordinary shell replacement and short pre-roll transitions. If the native shell still does not exist, a confirmed transcript releases the standalone sidebar; pending or unavailable transcripts keep it unmounted. Chapter-source detection may continue independently for up to 30 seconds.

Once the host has been placed natively for the current video, transient native-panel lookup failures do not immediately move it back to the standalone sidebar. This avoids flicker when YouTube briefly rebuilds the panel during `Timeline` or `Transcript` tab switches.

### Watch-to-watch SPA navigation

Clicking another YouTube video usually changes the current document through YouTube's single-page navigation instead of reloading Safari. The original page's inline `ytInitialData` remains stale, so the integration must not treat it as data for the new video.

The navigation lifecycle is:

1. `yt-navigate-start` opens a bounded transition window but never removes tabs, resets results, or caches response/chapter data. YouTube fires it while the outgoing page is still visible and may still attach the previous video's response; an empty destination URL is therefore treated as ambiguous. Shorts retain their explicit full-navigation handling without first dismantling the visible watch UI.
2. While that transition window is active, the URL fallback and native-panel observer do not reconcile the outgoing shell. This prevents two competing early resets while YouTube is still replacing the destination DOM.
3. `yt-navigate-finish` closes the transition window, records the current URL, caches its destination-validated page response, restarts the scoped observer if necessary, and schedules bounded follow-up reconciliations. A watch-to-watch change restores extension tab chrome immediately but defers the destructive per-video result reset to the replacement-panel mutation or first bounded reconciliation; committed non-video destinations clean up normally at this point.
4. `yt-page-data-updated` refreshes the per-video SPA response cache when YouTube publishes the new data separately from the finish event.
5. A 500 ms URL-only check calls the same reconciliation path if Safari misses a YouTube event. It performs no DOM scan or render while the URL is unchanged and waits up to three seconds for an in-progress navigation's normal finish event before taking over.
6. `reconcilePanel()` detects the new video key, resets visible result/loading/tab state, preserves caches keyed to other videos, starts a new chapter-discovery window, removes the old host, and mounts a fresh host into the new native panel or fallback location.

Every chapter-bearing SPA data source must prove ownership before it can populate the destination video:

- navigation data with a declared player video ID is rejected when that ID differs from the active URL's video key
- the live player response is parsed only when `videoDetails.videoId` matches the active video key
- macro-marker DOM rows with their own endpoint are accepted only when that endpoint matches the active video
- macro-marker rows without an endpoint are accepted only after the current player response matches the active video

These checks prevent the previous video's still-mounted panel/player data from being cached under the destination video during YouTube's transition.

Async generation work follows the same ownership rule. Generation IDs are monotonically invalidated rather than reset to zero when the video changes, and a continuation is current only when both its video key and generation ID match. Stale work returns without clearing loading state. This prevents an old video's request from colliding with the destination video's first numeric ID and making `Chapters...` lose its ellipsis the next time a tab click repaints the row.

The follow-up reconciliation delays are bounded to 100 ms, 300 ms, 700 ms, 1.5 seconds, 3 seconds, and 5 seconds, and each timeout is discarded if the URL changes again. This covers YouTube builds where the finish event precedes the new engagement-panel DOM without creating a permanent heartbeat.

Tab-row synchronization uses a fast path:

- watch-to-watch reset removes the old result host but preserves injected Chapters/Summary controls and the header action until YouTube replaces that native chrome
- when the scoped observer sees a replacement engagement-panel row, it calls `nativePanel.syncTabs()` synchronously in the observer callback
- host placement, content rendering, and sizing follow on the scheduled animation frame
- `maybeAutogenerateAnalysis()` is started through `autogenerateAnalysisInBackground()` and is never awaited inside `reconcilePanel()`
- automatic attempts are tracked independently for Chapters and Summary; resolving or attempting one kind cannot mark the other kind complete
- generation failures are logged by that background wrapper without holding or rejecting the DOM reconciliation lock

This ordering is intentional. Do not await transcript acquisition, background jobs, or provider generation from `reconcilePanel()`; doing so lets native Transcript/Timeline render first while Chapters/Summary wait behind unrelated work.

The URL check is not a panel heartbeat. Do not change it to call `ensurePanel()` unconditionally; repeated panel reconciliation previously contributed to unstable controls and unnecessary YouTube DOM churn.

The extension uses a scoped `MutationObserver` for engagement-panel changes instead of a periodic heartbeat. This lets it restore its own chips after YouTube rebuilds the panel without reopening a panel the user explicitly closed or reacting to unrelated page updates.

The observer must not react to extension-owned mutations. Earlier synchronization unconditionally rewrote injected tab text and the copy-button SVG; the observer saw those changes, scheduled another reconciliation, and created a frame-by-frame feedback loop that made clicks unreliable. The current invariants are:

- records whose target is inside an extension-owned native tab or header action are ignored
- tab text and ARIA values are written only when the value changed
- the copy SVG is replaced only when its `copy`/`copied` visual state changes
- native tab visibility is changed only when the desired hidden state changes

Keep these operations idempotent. Do not replace an injected control merely to refresh its appearance.

## Native Chapters

Native YouTube chapters are parsed before timestamp generation.

Current chapter sources:

- `ytInitialData` engagement-panel `macroMarkersListRenderer`
- nested `macroMarkersListItemRenderer` data used by automatic `Key moments` surfaces
- player overlay `chapterRenderer`
- hidden macro-marker DOM nodes
- the live YouTube `Chapters`/`Key moments` tab and segmented player bar as signals that list data may still be loading

Chapter availability has an explicit `pending`, `available`, or `unavailable` state. `Available` means timestamp/label rows were actually extracted and can be migrated, not merely that YouTube displayed a chapter-like tab or segmented scrubber. A current `ytInitialData` response is authoritative unless a visible lazy Chapters/Key moments surface indicates that its macro-marker list may still arrive; in that case the extension waits until the discovery deadline. Once resolved, the source stays stable for that video instead of changing after generation has begun.

### In-panel chapter source state

The content script owns source discovery, the displayed result, and the per-video override. No popup/background copy of that state exists.

Source precedence is:

1. An explicit footer choice for the current video from `chapterSourceOverrideByVideoKey`.
2. The companion-app default: `preferNative` or `alwaysGenerate`.
3. Native rows when the default prefers them and detection resolves `available`.
4. Generated rows when generation is preferred or native detection resolves `unavailable`.

The displayed result's `state.timestampsSource` is the rendering authority: `youtubeChapters` produces the YouTube attribution and generated results produce the provider/time attribution. Detection remains monotonic for that video. A source action changes only that video's session override; a different video starts from the companion-app default unless it already has its own session override.

Footer presentation follows these rules:

- YouTube result with a connected timestamp provider and no matching generated cache: `Chapters provided by YouTube. Generate chapters from transcript.`
- YouTube result with a matching cached result: `Chapters provided by YouTube. View generated chapters.`
- YouTube result without an available timestamp provider: show only the YouTube attribution
- generated result with discovered YouTube rows: `Chapters generated with <model> in <time>. View YouTube chapters.`
- generated result without YouTube rows, or while native discovery is unresolved: show only the generation attribution
- Summary captions never show a chapter source action

All chapter footer variants are one compact left-aligned line after the final chapter, separated by the same standard result spacing used for summary captions. The HTML contains no leading template whitespace because captions preserve whitespace for other result text. Only the action is underlined and it inherits the caption's normal font weight.

The action is a semantic button styled as a small inline link. It is routed through the same stable `page-controls.js` capture boundary as Chapters, Summary, Copy, and timestamp links, so a YouTube rerender cannot leave it visibly present but detached from its handler. Switching to generated chapters reuses a cached generated result when available; otherwise it starts the existing transcript/provider generation flow. Switching to YouTube chapters uses cached extracted rows and never displays YouTube's roomier native list.

When native chapters or Key moments are found, `applyNativeChaptersIfAvailable()` sets the timestamps result to chapter text and marks the source as `youtubeChapters`. That source marker prevents provider timestamp generation for that video and makes the compact result caption say the chapters came from YouTube.

Native chapter resolution never satisfies or suppresses Summary. If the configured summary engine is available, Summary starts independently and shares the video's transcript fetch with any other consumer. A late provider-status refresh can also start an unattempted Summary even when Chapters was already resolved or attempted.

The chapter source preference lives in shared app-group settings as `generation.chapterPreference`.

Supported values:

- `preferNative`: use YouTube chapters when they exist, otherwise generate extension chapters.
- `alwaysGenerate`: skip YouTube chapters and generate extension chapters for every supported video.

Generated chapter timing still uses the existing validated timestamp path. Model output is not trusted directly; generated timestamp candidates are aligned back to real transcript cue times before rendering.

## Chapter Source Preference And Override

The companion app exposes the global chapter source preference. It remains the default for each video. The Safari toolbar popup now contains only the Settings action; it does not inspect the active tab or hold chapter-source state.

The Chapters footer offers the valid alternate source for the current video:

- `Generate chapters from transcript` / `View generated chapters`: select generated extension chapters for the current video session. The label reflects whether a matching cached result already exists and is omitted when timestamp generation is unavailable.
- `View YouTube chapters`: select extracted YouTube chapters for the current video session. This action is omitted until usable native rows exist.

Important implementation points:

- the companion app persists the shared `GenerationSettings.chapterPreference`
- the content script stores per-video session overrides in `chapterSourceOverrideByVideoKey`
- `switchVideoChapterSource()` applies the override directly; no runtime-message relay is involved
- `applyNativeChaptersIfAvailable()` skips YouTube native chapters when generated chapters are preferred or forced
- `state.nativeChaptersOverridden` lets `native-panel.js` reflect the override in tab visibility
- `chapter-state.js` owns the 30-second native-discovery grace and monotonic status merge
- the native panel hides YouTube's native `Chapters` or `Key moments` chip whenever the compact extension `Chapters` tab presents imported or replacement rows
- existing timestamp generation, transcript fetching, alignment, caching, and active-row highlighting are reused
- the generated footer does not render a YouTube-source action when the active video has no extracted native chapter rows

This replacement is panel-only. It does not rewrite YouTube's player scrubber chapter segments.

## Extension Tabs

The extension injects tab wrappers into YouTube's native tab list.

Important implementation points:

- `extensionTabKinds()` returns extension-owned tab kinds.
- `nativeTabWrapper()` creates extension-owned native-looking chips.
- `reorderTabs()` keeps a stable order across YouTube tab layouts.
- `attachNativeOwnedTabListener()` observes native tab clicks without preventing them, then restores the extension host after YouTube has handled the click.
- `syncContentVisibility()` marks the native content container while an extension tab is active. A scoped stylesheet also suppresses expanded YouTube-owned sibling panels without rewriting their visibility state, then removes those markers for a YouTube-owned tab.
- `handlePagePanelCloseClick()` recognizes the parent and Transcript/Timeline sibling Close controls at the stable window boundary. It preserves YouTube's event, then `dismissIntegratedPanel()` finalizes hiding the extension-opened parent shell on the next event-loop turn and keeps reconciliation latched closed.
- `handlePageTranscriptOpenClick()` recognizes the video-description transcript action at the stable window capture boundary. When an integrated Transcript chip exists, it cancels only that separate page command, reopens the existing shell if necessary, and clicks the real native chip. It deliberately preserves the current extension ownership during that click, exactly like a direct in-panel selection; the existing native-tab listener hands ownership to YouTube on the next event-loop turn after YouTube finishes its transition. If no integrated mount/chip exists, YouTube receives the original command unchanged.
- Extension-owned clicks are routed by `page-controls.js` at the stable page boundary instead of depending on listeners attached only to replaceable YouTube nodes.
- When Chapters or Summary becomes active, `syncNativeOwnedTabSelectionAppearance()` clears stale native `aria-selected`/`aria-pressed` values and applies a visually inactive marker to the wrapper. Marker CSS reaches the nested `.ytChipShapeChip` and its paint pseudo-elements, so a delayed YouTube rerender cannot make Transcript or Timeline look selected alongside the active extension tab.
- The extension deliberately does not mutate YouTube's `ytChipShapeSelected`/`ytChipShapeActive`/`ytChipShapeInactive` classes. Keeping YouTube's internal chip state intact lets a second Transcript or Timeline selection repaint normally. When a native tab is clicked again, the marker is removed and ARIA selection is restored from `state.nativeYouTubeTab` while YouTube resumes responsibility for its own chip classes.

The injected tabs are not real YouTube renderer objects. They are DOM elements that match the native chip behavior closely enough for the current desktop watch page.

### Tab color and paint-layer contract

The tab row must use one visual palette across extension-owned Chapters/Summary and YouTube-owned Transcript/Timeline controls. Loading is a state change, not a color state.

Native-panel rules:

- An inactive extension tab uses YouTube's `--yt-spec-badge-chip-background` and `--yt-spec-text-primary` tokens. Hover uses `--yt-spec-button-chip-background-hover`.
- A selected extension tab uses YouTube's primary/inverse text colors; the dark-theme selected fallback uses YouTube's static white token with dark text.
- `aria-busy="true"` remains on a generating tab for accessibility, and its label gains an ellipsis, but there is deliberately no busy-specific opacity, background, or text-color rule. A busy inactive tab must look exactly like an idle inactive tab; a busy selected tab must remain selected.
- While Chapters or Summary owns the panel, the reversible native-tab marker clears retained backgrounds and shadows from the YouTube wrapper, button, tab-role node, and their paint pseudo-elements. Exactly one inactive fill is then applied to the exact `.ytChipShapeChip` element.
- Do not use a broad `[class*='ytChipShapeChip']` paint selector. YouTube can use that stem on more than one nested element, causing the same translucent color to be composited multiple times.

Standalone fallback rules:

- `.wrap` owns `--tab-background`, `--tab-background-hover`, `--tab-selected-background`, and `--tab-selected-text`.
- The light and dark theme branches set those variables; the shared `.tab`, `.tab:hover`, and `.tab.active` rules only consume them. This keeps later base rules from accidentally overriding dark-mode colors through cascade order.
- The standalone fallback also has no busy-specific color selector. Its label and `aria-busy` state follow the same contract as the native panel.

Pixel comparisons during the fix exposed two distinct layering failures in the current light YouTube theme: an ordinary inactive chip measured `#F5F5F5`, a retained native selected layer plus the inactive layer measured `#EBEBEB`, and applying `opacity: 0.72` to the inactive chip produced `#F8F8F8`. These values are diagnostic examples, not hardcoded palette constants; YouTube's live theme tokens remain authoritative. When comparing screenshots, sample a flat interior area away from text, rounded-edge antialiasing, hover state, and the cursor.

The JavaScript regression suite locks the structural invariants: native inactive paint occurs on one exact chip layer, retained outer layers are transparent, no broad chip-class substring selector exists, and neither native nor fallback tabs define busy-specific colors.

## Copy Controls, Clipboard Flow, And Shared Transcript Fetching

Transcript acquisition is shared across:

- timestamp generation
- summary generation
- native transcript copy

Important implementation points:

- `transcriptCache` stores completed transcript results by video ID.
- `transcriptRequestCache` stores one in-flight transcript request per video ID.
- `getTranscript()` owns cache reuse and in-flight de-duplication.
- `prefetchTranscript()` starts passive transcript fetching when generation can use it.
- `prefetchTranscriptForCopy()` starts the shared transcript fetch when the native `Transcript` tab is active.

Passive prefetch does not click open YouTube UI. Generation and explicit copy flows may use stronger fallbacks, including the native transcript panel, when needed.

The native header copy button is injected beside YouTube's close control. It copies:

- generated/native chapters while `Chapters` is active
- generated summary while `Summary` is active
- the full transcript while `Transcript` is active

The transcript copy path avoids async transcript discovery during the clipboard click. The transcript is read or prefetched before enabling the copy button, which avoids Safari losing the user activation needed for clipboard writes.

Clipboard behavior is shared by the native header control and standalone sidebar control:

- the WebExtension manifest requests `clipboardWrite`
- Safari's selection-based `document.execCommand("copy")` path runs synchronously inside the user gesture
- `navigator.clipboard.writeText()` is the page-context fallback
- `ai:copyText` asks the extension background context to write when page-context methods are denied
- failed writes render an explicit error instead of failing silently
- a successful write changes the copy icon to a green checkmark with a short pulse, then restores the copy icon after 1.4 seconds

Native header hosts, buttons, tab lists, and close controls are tracked with per-script `WeakSet` instances. DOM marker attributes are useful for discovery and styling but are not proof that a listener still exists: Safari can reload the script while YouTube preserves the marked DOM node.

## Sizing And Scrolling

The native panel body has a stable scroll viewport so tab switches do not resize the whole panel around short and long extension content.

Important implementation points:

- `syncBodyViewport()` calculates a stable body height.
- The height is capped by YouTube's native panel bottom and the browser viewport.
- `.native-body` owns scrolling for generated `Chapters` and `Summary`.
- The old `max-height`-only behavior was avoided because it let short tabs shrink and long tabs grow, causing visible panel jumps.

This keeps `Summary` scrollable without letting text get clipped below the visible native panel.

## Timeline And Native Tab Switching

YouTube's `Timeline` and `Transcript` can rebuild engagement-panel surfaces. The extension observes native tab-row clicks without intercepting them, then clears its own selected tab on the next event-loop turn. YouTube remains responsible for switching its native in-panel surfaces and receives every native Close click. The extension then finalizes hiding the parent shell it opened, because YouTube cannot close a shell its private state already regards as closed. A scoped mutation observer replaces delayed polling and keeps the fallback sidebar from appearing during transient native-panel rebuilds.

The page-level `Show transcript` control is not the same command as the Transcript chip. Live DOM inspection showed that it expands `PAmodern_transcript_view` while the target-less `In this video` shell remains separately hidden. Allowing both paths to run let reconciliation force the old Chapters shell visible above the new transcript panel. The page control is therefore routed once through the real integrated Transcript chip. The adapter must not clear extension ownership before that native click: doing so changes YouTube's transition ordering and can leave the integrated shell underneath the transcript surface, making one Close reveal the other. The normal next-turn native-tab handoff preserves one visible engagement-panel owner.

After the round trip from Transcript or Timeline back to Chapters/Summary, only the extension tab may look selected. Native selected styling is suppressed for as long as extension content owns the panel body.

### Native tab selection ownership contract

The tab row combines two independent state owners:

- the extension owns `Chapters` and `Summary`
- YouTube owns `Transcript` and `Timeline`

The handoff must preserve both owners' state instead of trying to make YouTube's private chip classes the extension's state model:

1. When Transcript or Timeline is clicked, the capture listener observes the click but does not prevent it. The extension waits until the next event-loop turn so YouTube can process its own control first, then clears `state.nativeExtensionTab`, records the native kind in `state.nativeYouTubeTab`, removes the temporary visual marker, and restores native ARIA selection.
2. When Chapters or Summary is clicked, the extension selects its own tab and applies `data-yts-native-owned-tab-visually-inactive` to each YouTube-owned tab wrapper. It temporarily changes stale native `aria-selected` and `aria-pressed` values to `false` while extension content is visible.
3. The marker's scoped CSS clears the wrapper/button/tab-role paint layers and their pseudo-elements, then paints the exact nested `.ytChipShapeChip` once. This is necessary because changing only the outer button or ARIA state does not remove every version of YouTube's selected background, while painting multiple translucent layers makes the chip visibly darker.
4. The extension must leave YouTube's `ytChipShapeSelected`, `ytChipShapeActive`, and `ytChipShapeInactive` classes untouched. Returning to Transcript or Timeline removes the marker and exposes YouTube's retained native selection state, so the native button paints correctly on the second and every later round trip.

The marker exists only while `state.nativeExtensionTab` is non-empty. Native ARIA restoration is applied to both the button and its tab wrapper using `state.nativeYouTubeTab`. This same path handles Transcript and Timeline; Timeline may show a different sibling engagement panel, but it does not get a separate selection-state implementation.

Two previous partial fixes explain why every part of this contract matters:

- Clearing only outer ARIA/CSS state allowed Transcript to remain visibly pressed beside Chapters or Summary because the selected paint lived on a nested chip layer.
- Removing YouTube's selected/active classes made the first switch away look correct, but corrupted YouTube's internal selection state. A later click could display Transcript content without repainting its button as selected.

Do not replace native in-row handlers or add/remove/toggle YouTube chip-state classes. Extension controls are routed by `page-controls.js`; native Transcript and Timeline clicks must continue through YouTube. The only intentional synthetic native click is the description-level `Show transcript` adapter, which invokes the existing Transcript chip instead of allowing YouTube's separate transcript-only panel command to compete with the integrated shell.

## Active Chapter Highlight

Imported YouTube chapters, automatic Key moments, and generated chapters all track the current video time in the compact view.

Important implementation points:

- compact chapter rows receive `data-chapter="true"` regardless of source
- the current chapter receives `data-active="true"` and `aria-current="true"`
- CSS bolds the active chapter row
- a lightweight video event tracker listens to `timeupdate`, seeking events, metadata load, and play
- the tracker updates DOM attributes without re-rendering the panel

The imported list is highlighted only inside the extension view; YouTube's player scrubber is not modified.

## Fallback Behavior

The standalone sidebar remains available when the native `In this video` panel cannot be found **and** the shared transcript detector has confirmed a usable transcript. Native placement remains independent from transcript availability because imported YouTube chapters and Key moments can still be useful without transcript-backed generation.

The fallback remains important because:

- YouTube DOM is private and can change
- transcript-backed generation should remain usable on layouts that omit the native shell
- localized or experimental YouTube layouts may not have the same native structure

If neither a genuine native shell nor a usable transcript exists, the extension leaves the page untouched: it does not mount the fallback, start automatic generation, show a transcript error, or open YouTube's structured Description engagement panel. While passive transcript discovery is pending, fallback placement also remains pending so an error-only sidebar never flashes before disappearing. One availability state in `transcript-orchestrator.js` owns `unknown`, `pending`, `available`, and `unavailable`; placement and generation consume that state instead of running separate transcript detectors.

The native transcript fallback may expand a collapsed video description only when `ytd-video-description-transcript-section-renderer` already exists. A generic description `More` control is not evidence that a transcript exists. This guard is paired with strict native-shell recognition so a transcript-free Description surface cannot be mistaken for, or opened in place of, `In this video`.

When the configured preference is to use YouTube chapters when available, a newly committed video can have a short, legitimate chapter-source discovery phase before generation begins. The unified Chapters surface renders `Checking for YouTube chapters...` during that phase instead of the generic empty-state copy. Its tab uses the same busy ellipsis as generation, and a duplicate YouTube-owned Chapters chip is hidden only while the decision is pending. Discovery then resolves directly to migrated YouTube/Key moments chapters or to transcript-backed generation; if the native source cannot be migrated, its chip is restored.

Do not remove the transcript-backed fallback until the native path has been tested across enough YouTube layouts.

## Known Caveats

- Generated chapters do not become native player scrubber-bar segments.
- YouTube may change private renderer names or tab structure without notice.
- Native chip labels are localized, so target IDs and renderer structure are preferred where possible.
- The extension-owned chips look and behave like native chips, but YouTube does not own their state internally.
- `Timeline` remains the most fragile native tab because it can trigger additional YouTube panel churn.

## Regression Checklist

When changing this area, test:

- video with creator-provided native chapters
- video with automatic native chapters
- video where automatic chapters are labeled `Key moments`
- native/Key moments Chapters populate without provider timestamp generation while Summary still starts automatically from the shared transcript
- video without native chapters
- video with `Timeline`, `Chapters`, and `Transcript`
- video with `Chapters` and `Transcript` only
- imported and generated `Chapters` active-row highlighting during playback and seeking
- companion app chapter source setting
- Safari popup contains Settings only and does not request `activeTab`
- native result footer shows `Generate chapters from transcript` before generation and `View generated chapters` after the matching result is cached
- generated result footer shows `View YouTube chapters` only when extracted YouTube rows exist
- chapter source footer is left-aligned with no blank line or preserved indentation before it
- switching native -> generated -> native repeatedly preserves the correct rows, attribution, active highlight, and source action
- without a connected timestamp provider, the native result remains intact and does not offer a generation action
- a new video starts from the companion-app default instead of inheriting the previous video's override
- no duplicate `Chapters`/`Key moments` chip while imported or regenerated chapters use the compact view
- native `Transcript` copy button
- generated `Chapters` copy button
- generated `Summary` copy button
- green copied-checkmark confirmation and automatic reset
- copy failure produces visible feedback instead of a silent no-op
- first-click response after YouTube rebuilds the native chip row or header
- repeated rapid switching does not lose Summary/Chapters/Copy clicks
- Transcript -> Chapters -> Transcript repeated at least three times; exactly one tab looks selected, the content matches it, and button/wrapper ARIA matches the visible owner on every cycle
- Transcript -> Summary -> Transcript repeated at least three times with the same visual, content, and ARIA checks
- Timeline -> Chapters -> Timeline and Timeline -> Summary -> Timeline repeated where Timeline is available, with the same checks
- returning from Transcript/Timeline leaves only Chapters or Summary visually selected
- selecting Transcript/Timeline again restores its pressed appearance as well as its native content
- no extension code adds, removes, or toggles YouTube's `ytChipShapeSelected`, `ytChipShapeActive`, or `ytChipShapeInactive` classes
- inactive Chapters, Summary, Transcript, and Timeline fills match with the cursor away in both light and dark themes
- generating `Chapters…` or `Summary…` keeps the same inactive or selected colors it had before generation began
- native inactive styling has no doubled wrapper/button/chip paint layer, including after Transcript/Timeline -> Chapters/Summary handoff
- scrolling long summaries
- switching repeatedly between `Chapters`, `Summary`, `Transcript`, and `Timeline`
- load on Chapters, press Close once without visiting Transcript first, and confirm the panel closes without reconciliation reopening it
- use the video-description `Show transcript` action to reopen, close again from Transcript, and confirm the panel closes while Chapters/Summary remain available on the next reopen
- repeat Close -> `Show transcript` -> Close at least three times and confirm every Close works and no underlying or duplicate panel is revealed
- while Chapters is visible, use `Show transcript` and confirm the page does not scroll to or reveal a second transcript-only panel beneath the integrated shell
- YouTube SPA navigation between videos
- watch-to-watch navigation when `yt-navigate-start` has no destination URL
- watch-to-watch navigation with delayed native chapter discovery shows `Checking for YouTube chapters...` immediately, never the generic empty-state copy, and does not duplicate the YouTube Chapters chip
- watch-to-live and live-to-watch navigation
- navigation recovery when the finish event is missing but the URL changes
- homepage/feed-to-video navigation forces a real reload so Safari injects the watch-page content scripts
- previous-video chapter rows never appear or become cached on the destination video
- while generated chapters are running after a video/source transition, repeatedly switch Summary -> Chapters; `Chapters...` and `aria-busy="true"` remain stable until that exact video/job finishes
- Chapters and Summary appear with, or before, native Transcript/Timeline rather than arriving after analysis startup
- fallback sidebar behavior when the native panel is unavailable
- no standalone sidebar or automatic generation when both the native panel and transcript are unavailable
- on a transcript-free video such as `RlLPXhP-Qxk`, confirm no extension surface appears and YouTube's `Description` engagement panel remains hidden unless the user explicitly opens it

Run at minimum:

```sh
node --check "YouTube Timestamps and Summaries Extension/Resources/content.js"
node --check "YouTube Timestamps and Summaries Extension/Resources/chapter-state.js"
node --check "YouTube Timestamps and Summaries Extension/Resources/page-controls.js"
node --check "YouTube Timestamps and Summaries Extension/Resources/native-panel.js"
node --check "YouTube Timestamps and Summaries Extension/Resources/background.js"
node --test tests/js/*.test.cjs
xcodebuild -project "YouTube Timestamps and Summaries.xcodeproj" -scheme "YouTube Timestamps and Summaries" -destination 'platform=macOS' test
```

On a development Mac where this extension is enabled in Safari, keep normal development signing enabled for the Xcode test. The hosted test build is registered with Launch Services; forcing `CODE_SIGNING_ALLOWED=NO` can make Safari resolve the production bundle identifier to an unsigned DerivedData copy until a signed build is run again. Use an isolated CI machine or disposable environment for deliberately unsigned builds.
