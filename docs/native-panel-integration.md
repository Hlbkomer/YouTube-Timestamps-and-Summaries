# Native YouTube Panel Integration

Date: 2026-07-07

This note documents the implemented move from the extension-owned YouTube sidebar toward YouTube's native `In this video` engagement panel. The original investigation remains in [chapter-integration-investigation.md](chapter-integration-investigation.md); this file describes the current implementation.

## Goals

- Prefer YouTube's native `In this video` panel when it exists.
- Use YouTube's own `Chapters` when a video already has native chapters by default.
- Generate our own transcript-based chapters when YouTube does not provide chapters, when the global setting says to always generate, or when the current video is overridden from the Safari popup.
- Keep `Summary` in the same native panel.
- Reuse YouTube's native `Transcript` and `Timeline` tabs when they exist.
- Keep the old standalone sidebar as a fallback when the native panel is unavailable.
- Avoid patching YouTube player scrubber-bar internals.

## Code Map

Primary files:

- `YouTube Timestamps and Summaries Extension/Resources/background.js`
- `YouTube Timestamps and Summaries Extension/Resources/content.js`
- `YouTube Timestamps and Summaries Extension/Resources/native-panel.js`
- `YouTube Timestamps and Summaries Extension/Resources/popup.html`
- `YouTube Timestamps and Summaries Extension/Resources/popup.js`
- `YouTube Timestamps and Summaries Extension/Resources/youtube-helpers.js`
- `tests/js/manifest-routing.test.cjs`
- `tests/js/youtube-helpers.test.cjs`

Key `content.js` state:

- `state.timestampsSource`: distinguishes generated timestamps from `youtubeChapters`.
- `state.activeTab`: extension result kind, still `timestamps` or `summary` internally.
- `state.nativeExtensionTab`: currently selected extension-owned native tab.
- `state.nativeYouTubeTab`: currently selected YouTube-owned tab such as `transcript` or `timeline`.
- `state.nativePanelDismissed`: tracks that the user closed the native panel for the current video so heartbeat/resync passes do not immediately reopen it.
- `state.userSelectedTab`: prevents automatic default selection from overriding a person's tab choice.
- `state.nativeChaptersOverridden`: marks the current video session as using generated chapters instead of YouTube native chapters.
- `state.chapterSourceOverride`: the current video's explicit override, if any.
- `chapterSourceOverrideByVideoKey`: stores current-session per-video overrides from the popup.
- `transcriptCache`: completed transcript results by video ID.
- `transcriptRequestCache`: one in-flight transcript request by video ID.

Key `content.js` flows:

- `applyNativeChaptersIfAvailable()` runs before provider timestamp generation and switches videos with YouTube chapters to the native chapter result when the preference/override allows it.
- `setVideoChapterSourceFromPopup()` sets the current-video override, clears the current chapter result, selects the right `Chapters` surface, and starts the existing timestamp generation path when generated chapters are requested.
- `getPanelMount()` chooses native-panel placement first and standalone sidebar placement second.
- `getTranscript()` owns transcript caching and in-flight request de-duplication.
- `syncActiveGeneratedChapterTracker()` and `syncActiveGeneratedChapterHighlight()` own active generated-chapter highlighting.
- Summary rendering uses `renderSummaryHTML()` from `youtube-helpers.js` so safe formatting behavior is unit-tested.

Key `native-panel.js` flow:

- `createNativePanelController()` receives explicit hooks for state, rendering, transcript copy, and generation retries.
- `getMount()` finds the native `In this video` panel and returns its shell, content body, and tab list.
- `syncTabs()` injects, orders, selects, and resyncs extension-owned native chips.
- `syncNativeOwnedTabVisibility()` hides YouTube's native `Chapters` chip while a generated-chapter override is active.
- `syncContentVisibility()` hides YouTube-owned body content while an extension tab is active and restores it for native tabs.
- `syncHeaderCopyButton()` owns the header copy button beside YouTube's close button.
- `syncBodyViewport()` owns native panel body height and scrolling.
- native close clicks set `state.nativePanelDismissed`; explicit tab/source actions clear it.

Key `youtube-helpers.js` flow:

- `parseNativeYouTubeChapters()` reads native chapters from YouTube structured data.
- It prefers engagement-panel macro markers and falls back to player-bar chapter renderers.
- It deduplicates repeated chapter entries before returning normalized `{ time, label, seconds }` items.
- `renderSummaryHTML()` safely renders summary paragraphs, bold text, bold section labels, top-level bullets, and one nested bullet level while escaping raw HTML.

## User-Facing Behavior

When YouTube exposes the `In this video` panel, the extension opens and uses that panel by default.

The intended tab order is:

1. `Chapters`
2. `Summary`
3. `Transcript`
4. `Timeline`

`Timeline` is shown only when YouTube provides it. `Transcript` is YouTube-owned. `Summary` and generated `Chapters` are extension-owned tabs injected into the native tab row.

If YouTube already has native chapters:

- the extension uses those chapters by default
- timestamp generation is skipped for that video unless the global setting or current-video override requests generated chapters
- the native panel opens to `Chapters`
- `Summary` remains available

If YouTube has no native chapters:

- the extension generates transcript-based timestamps as `Chapters`
- generated chapters appear in the native panel
- the active generated chapter is bolded as video playback moves

If the native panel cannot be mounted, the extension falls back to the standalone sidebar behavior.

## Native Panel Mounting

The content script looks for the YouTube engagement panel whose visible title normalizes to `In this video`.

Important implementation points in `content.js`:

- `nativePanel.getMount()` finds the native parent panel, direct `#content` child, and native tab list.
- `nativePanel.open()` opens the native panel and chooses the default extension/native tab when appropriate.
- `nativePanel.syncTabs()` keeps extension-owned chips ordered and synced with YouTube-owned chips.
- `getPanelMount()` prefers the native panel and falls back to the old sidebar target only when native mounting is unavailable.

Once the host has been placed natively for the current video, transient native-panel lookup failures do not immediately move it back to the standalone sidebar. This avoids flicker when YouTube briefly rebuilds the panel during `Timeline` or `Transcript` tab switches.

When the user closes the native `In this video` panel, the extension records that dismissal for the current video. Scheduled resync passes and the heartbeat respect that state instead of forcing the panel open again. The dismissal resets on YouTube video navigation, and explicit user actions such as selecting an extension tab, using the popup chapter-source selector, or clicking YouTube's transcript entry point clear the dismissal.

## Native Chapters

Native YouTube chapters are parsed before timestamp generation.

Current chapter sources:

- `ytInitialData` engagement-panel `macroMarkersListRenderer`
- player overlay `chapterRenderer`
- hidden macro-marker DOM nodes

When native chapters are found, `applyNativeChaptersIfAvailable()` sets the timestamps result to chapter text and marks the source as `youtubeChapters`. That source marker prevents provider timestamp generation for that video.

The chapter source preference lives in shared app-group settings as `generation.chapterPreference`.

Supported values:

- `preferNative`: use YouTube chapters when they exist, otherwise generate extension chapters.
- `alwaysGenerate`: skip YouTube chapters and generate extension chapters for every supported video.

Generated chapter timing still uses the existing validated timestamp path. Model output is not trusted directly; generated timestamp candidates are aligned back to real transcript cue times before rendering.

## Chapter Source Preference And Override

The companion app exposes the global chapter source preference. The Safari toolbar popup does not show this default setting; it only shows a current-video override. Changing the app setting writes through the native extension bridge, then asks the active YouTube tab to refresh status. If the new preference requires generated chapters, the native panel switches to the generated `Chapters` tab and starts generation without waiting for the full job to finish.

The Safari toolbar popup also includes a current-video `Current video chapters` selector. The selected value reflects the effective chapter source after combining the global setting and any current-video override.

- `Generated`: force generated extension chapters for the current video session.
- `Native`: force native YouTube chapters for the current video session when they exist.
- `Native (Not Available)`: disabled when the active video has no native YouTube chapter source.

Important implementation points:

- the native extension handles `saveChapterPreference` and persists the shared `GenerationSettings`
- the popup sends `ai:setVideoChapterSource` for the current-video override
- the background script relays `content:setVideoChapterSource` to the active YouTube video tab
- the manifest includes `activeTab`, and the background script tries current-window, last-focused-window, and any active tab lookup so Safari popup focus does not leave the action disabled
- the content script stores per-video session overrides in `chapterSourceOverrideByVideoKey`
- `applyNativeChaptersIfAvailable()` skips YouTube native chapters when generated chapters are preferred or forced
- `state.nativeChaptersOverridden` lets `native-panel.js` reflect the override in tab visibility
- the native panel hides YouTube's native `Chapters` chip while the generated `Chapters` tab replaces it
- existing timestamp generation, transcript fetching, alignment, caching, and active-row highlighting are reused
- the content script rejects attempts to switch back to native chapters when the active video has no native chapter source

This replacement is panel-only. It does not rewrite YouTube's player scrubber chapter segments.

## Extension Tabs

The extension injects tab wrappers into YouTube's native tab list.

Important implementation points:

- `extensionTabKinds()` returns extension-owned tab kinds.
- `nativeTabWrapper()` creates extension-owned native-looking chips.
- `reorderTabs()` keeps a stable order across YouTube tab layouts.
- `syncNativeOwnedTabPressedState()` prevents both a YouTube-owned tab and an extension-owned tab from looking selected at the same time.
- `syncContentVisibility()` hides YouTube-owned content while an extension tab is active and restores it when a YouTube tab is active.

The injected tabs are not real YouTube renderer objects. They are DOM elements that match the native chip behavior closely enough for the current desktop watch page.

## Transcript Copy And Shared Transcript Fetching

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

## Sizing And Scrolling

The native panel body has a stable scroll viewport so tab switches do not resize the whole panel around short and long extension content.

Important implementation points:

- `syncBodyViewport()` calculates a stable body height.
- The height is capped by YouTube's native panel bottom and the browser viewport.
- `.native-body` owns scrolling for generated `Chapters` and `Summary`.
- The old `max-height`-only behavior was avoided because it let short tabs shrink and long tabs grow, causing visible panel jumps.

This keeps `Summary` scrollable without letting text get clipped below the visible native panel.

## Timeline And Native Tab Switching

YouTube's `Timeline` tab can briefly rebuild or switch engagement-panel surfaces. To keep the UI from feeling unstable:

- native tab clicks are handled through `scheduleNativeOwnedTabSelection()`
- YouTube description `Show transcript` clicks are intercepted when the integrated panel already has a native `Transcript` tab; the existing panel is selected, scrolled into view, and reused instead of letting YouTube create a second engagement panel.
- YouTube-owned sibling engagement panels are restored before native tab handoff
- native-tab handoff keeps a short grace window so transient missing mounts do not trigger tab cleanup
- switching to YouTube-owned tabs hides the extension host without clearing its shadow DOM
- after `Timeline` is selected by the user, `open()` and resync passes restore YouTube-owned elements but do not force the `In this video` panel visible
- `scheduleResync()` performs several delayed resync passes
- resyncs reinsert extension chips if YouTube rebuilt the tab row; while `Timeline` is active they avoid forcing the `In this video` panel visible
- sibling engagement panels are hidden only while an extension-owned tab is active

This avoids the old standalone sidebar briefly overlaying the native panel, reduces tab disappearance during native tab switches, and keeps extension tab round-trips responsive.

## Active Generated Chapter Highlight

Generated chapters track the current video time.

Important implementation points:

- only generated chapters receive `data-generated-chapter="true"`
- the current generated chapter receives `data-active="true"` and `aria-current="true"`
- CSS bolds the active generated chapter row
- a lightweight video event tracker listens to `timeupdate`, seeking events, metadata load, and play
- the tracker updates DOM attributes without re-rendering the panel

Native YouTube chapters are not modified by this feature.

## Fallback Behavior

The standalone sidebar remains available for cases where the native `In this video` panel cannot be found.

The fallback remains important because:

- YouTube DOM is private and can change
- livestreams and transcript-unavailable videos can expose different engagement panels
- localized or experimental YouTube layouts may not have the same native structure

Do not remove the fallback until the native path has been tested across enough YouTube layouts.

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
- video without native chapters
- video with `Timeline`, `Chapters`, and `Transcript`
- video with `Chapters` and `Transcript` only
- generated `Chapters` active-row highlighting during playback and seeking
- companion app chapter source setting
- popup `Current video chapters` selector on a video with native chapters
- popup disabled `Native (Not Available)` selector option on a video without native chapters
- no duplicate `Chapters` chip while regenerated chapters replace native chapters
- native `Transcript` copy button
- generated `Chapters` copy button
- generated `Summary` copy button
- scrolling long summaries
- switching repeatedly between `Chapters`, `Summary`, `Transcript`, and `Timeline`
- YouTube SPA navigation between videos
- fallback sidebar behavior when the native panel is unavailable

Run at minimum:

```sh
node --check "YouTube Timestamps and Summaries Extension/Resources/content.js"
node --check "YouTube Timestamps and Summaries Extension/Resources/native-panel.js"
node tests/js/youtube-helpers.test.cjs
node tests/js/apple-summary-redaction.test.cjs
node tests/js/manifest-routing.test.cjs
```
