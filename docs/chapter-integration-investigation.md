# Chapter Integration Investigation

Date: 2026-07-01

This note captures the investigation before changing the current sidebar implementation. It is intended as a checkpoint for the planned move from an extension-owned sidebar toward the native YouTube `In this video` surface.

## Current App Baseline

The current Safari WebExtension injects one shadow-root sidebar on supported YouTube watch and live pages.

- Host ID: `youtube-timestamps-sidebar-root`
- Mount target: `ytd-watch-flexy #secondary-inner` or `#secondary`
- Current tabs: `Timestamps` and `Summary`
- Timestamp generation: selected provider only
- Summary generation: Apple Intelligence or selected provider
- Autogeneration: both available jobs can start automatically when the panel is present

Important current files:

- `YouTube Timestamps and Summaries Extension/Resources/content.js`
- `YouTube Timestamps and Summaries Extension/Resources/youtube-helpers.js`
- `YouTube Timestamps and Summaries Extension/Resources/background.js`
- `YouTube Timestamps and Summaries Extension/SafariWebExtensionHandler.swift`
- `YouTube Timestamps and Summaries Extension/CodexGenerationService.swift`
- `YouTube Timestamps and Summaries Extension/GrokGenerationService.swift`

## YouTube Chapter Findings

YouTube exposes chapters through structured page data and hidden engagement-panel DOM, not only through visible UI.

The key native structures observed:

- Parent panel title: `In this video`
- Parent panel chip labels can include `Timeline`, `Chapters`, and `Transcript`
- Chapter source panel renderer: `macroMarkersListRenderer`
- Chapter item renderer: `macroMarkersListItemRenderer`
- Player-bar chapter renderer: `chapterRenderer`
- Transcript source panel target: `engagement-panel-searchable-transcript`

Observed chapter source target IDs:

- `engagement-panel-macro-markers-description-chapters`
- `engagement-panel-macro-markers-auto-chapters`

For videos with native chapters, usable chapter data can be read from:

1. `ytInitialData.engagementPanels[*].engagementPanelSectionListRenderer.content.macroMarkersListRenderer.contents[*].macroMarkersListItemRenderer`
2. `ytInitialData.playerOverlays.playerOverlayRenderer.decoratedPlayerBarRenderer.decoratedPlayerBarRenderer.playerBar.multiMarkersPlayerBarRenderer.markersMap[*].value.chapters[*].chapterRenderer`
3. Existing hidden DOM nodes such as `ytd-macro-markers-list-item-renderer`

The engagement-panel source is preferred because it contains the same list used by the `Chapters` panel. The player-bar source is a useful fallback.

## Tested Videos

Screenshot video:

- `https://www.youtube.com/watch?v=4ZsuvcGNYYU`
- Parent panel: `In this video`
- Chips: `Timeline`, `Chapters`, `Transcript`
- Chapter source: `engagement-panel-macro-markers-description-chapters`
- Chapter count found: 8 real items, duplicated in description card data
- Example chapters matched the screenshot: `0:00 Show Open & ATS Fight Partnership Announcement`, `5:00 Headlines: UFC Fight Night Kape vs. Horiguchi II Recap`

Automatic chapters sample:

- `https://www.youtube.com/watch?v=32TziHAcKQg`
- Chapter source: `engagement-panel-macro-markers-auto-chapters`
- Notice text in native panel: `These chapters are auto-generated`
- Chips observed: `Chapters`, `Transcript`

Short historic video:

- `https://www.youtube.com/watch?v=jNQXAC9IVRw`
- Native automatic chapters were present despite the video not obviously having creator-authored description chapters
- This confirms detection must use YouTube's structured chapter data, not only description timestamp text

No-chapter samples:

- `https://www.youtube.com/watch?v=VYOjWnS4cMY`
- `https://www.youtube.com/watch?v=9bZkp7q19f0`
- `https://www.youtube.com/watch?v=YQHsXMglC9A`
- These still exposed an `In this video` parent shell plus description/transcript panels, but no non-empty chapter source panel

## Native Integration Direction

Preferred direction:

1. Detect native YouTube chapters before requesting provider timestamp generation.
2. If native chapters exist, use them as the `Chapters` result and skip generated timestamps for that video.
3. Continue generating `Summary`.
4. Inject our `Summary` section/chip into YouTube's existing `In this video` surface when that surface exists.
5. When native chapters do not exist, generate our timestamp list as `Chapters` and inject it into the same surface.
6. Keep the current standalone sidebar behind a fallback path or feature flag until the native integration is stable.

This is more native than rendering a separate lookalike panel in the secondary column, while still avoiding player scrubber-bar patching.

## If The Native Panel Is Missing

Observed no-chapter videos still had the `In this video` parent shell. That suggests most desktop watch pages expose enough native panel structure to attach to.

If a future page does not expose that shell, it is still possible for the extension to add DOM because the current sidebar already does so. The safer fallback is:

- create an extension-owned panel entry in the same general panel area, or
- show the current standalone sidebar behavior for that video

Creating a real YouTube-managed Polymer renderer from scratch is not a stable contract. We can create DOM that matches the panel visually and behaviorally, but YouTube will not automatically own our chips, visibility state, or command routing unless we wire those interactions ourselves.

## What We Should Avoid

- Do not patch scrubber-bar internals just to make generated chapters appear as native player segments.
- Do not rely on visible translated labels alone. Use target IDs and renderer names first.
- Do not remove the current sidebar until the native path has a tested fallback.
- Do not broaden the content script beyond watch/live pages.
- Do not let model output become final chapter timing without the existing validation path.

## Expected Implementation Pieces

Likely content-script additions:

- `extractNativeChapters(videoKey)` from `ytInitialData` and hidden engagement-panel DOM
- `state.nativeChapters` and `state.usesNativeChapters`
- skip `requestGeneration("timestamps")` when native chapters exist
- render native or generated chapter items into a `Chapters` surface
- inject a `Summary` chip/content area into the parent `In this video` panel
- a `MutationObserver` to re-attach injected controls after YouTube SPA navigation or panel re-rendering
- feature flag or fallback switch for the old sidebar

Potential tests:

- parse native chapters from `macroMarkersListRenderer`
- parse native chapters from `chapterRenderer`
- no chapters returns an empty list
- generated timestamp text still parses into chapter items
- autogeneration skips timestamp generation when native chapters exist
- fallback sidebar still mounts when native panel injection is unavailable

## Open Risks

- YouTube DOM and renderer names are private implementation details.
- Panel chips and source panels are hidden until user interaction, so injection must survive delayed rendering.
- YouTube may localize visible labels, so labels are not stable selectors.
- Mobile YouTube may differ from desktop YouTube and may need a separate fallback.
- Native panel insertion needs careful testing around livestreams, transcript-unavailable videos, comments panels, and Shorts navigation.

## External Reference

YouTube documents that chapters can be creator-provided or automatic, and automatic chapters are not guaranteed for every video:

- https://support.google.com/youtube/answer/9884579
