# Version 1.1 Release Readiness

Review date: 2026-07-20

This document is the release handoff for version 1.1. It complements the detailed implementation history in [CHANGELOG.md](../CHANGELOG.md), the system design in [ARCHITECTURE.md](../ARCHITECTURE.md), and the manual release procedure in [RELEASING.md](../RELEASING.md).

The ready-to-paste public GitHub description is in [github-release-1.1.md](github-release-1.1.md). It deliberately uses only the public version name `1.1`; Xcode's required internal build number is not exposed in the release title or notes.

## Reviewed Product Contracts

### Chapter sources

- The companion-app chapter preference supplies the default: prefer YouTube chapters when available, or always generate chapters from the transcript.
- YouTube creator chapters and automatic `Key moments` are imported into the same compact Chapters rows as generated results.
- Imported/native Chapters suppress only provider timestamp generation. Summary has its own automatic-attempt state and still starts when its configured engine and the shared transcript are available.
- The Safari toolbar popup contains only Settings. The removed `Current video chapters` picker has no background cache, poller, native save action, or page-message relay left behind.
- The content script is the single owner of detected native rows, generated-result availability, the displayed source, and the current-video override.
- The Chapters footer identifies the active source. It offers `Generate chapters from transcript` before a matching generated result exists, `View generated chapters` after it is cached, and `View YouTube chapters` when imported rows are available.
- Per-video source overrides are session state; changing the companion-app preference changes the default rather than rewriting old cached results.

### Native panel and controls

- The preferred surface is YouTube's `In this video` panel with extension `Chapters` and `Summary` tabs beside YouTube's `Transcript` and optional `Timeline` tabs.
- The standalone sidebar remains a fallback after the bounded native-shell placement window only when a usable transcript has been confirmed.
- That standalone fallback mounts only after the shared transcript detector confirms usable captions. If both the native shell and transcript are unavailable, the extension leaves the page untouched and does not start automatic generation or expose transcript errors.
- Native-shell discovery rejects generic/targeted Description surfaces and transcript discovery never expands a generic description without a real transcript section, so transcript-free pages cannot display YouTube's structured Description panel as an extension side effect.
- Extension-owned tabs, source links, copy controls, and chapter links use stable capture routing so private YouTube DOM replacement cannot create dead-click windows.
- Native Transcript/Timeline selection is handed back without mutating YouTube's selected/active/inactive classes. Extension-owned content suppresses stale native pressed paint reversibly.
- A stable Close route lets YouTube receive its native click, then hides the extension-opened parent shell on the next event-loop turn. It handles Close from Chapters/Summary and from Transcript/Timeline sibling surfaces, remains latched across reconciliation, and is reset only by an explicit reopen.
- The video-description `Show transcript` command reuses the integrated native Transcript chip when available; it does not stack YouTube's separate transcript-only engagement panel underneath Chapters/Summary.
- Idle and generating chips use the same five-percent overlay contract; selected chips keep the selected palette. Busy state changes only text/availability, not color.
- Copy tries a synchronous selection operation first, then the page Clipboard API, then the extension background. Success shows the checkmark pulse and failure is visible.
- While a preferred YouTube Chapters/Key moments source is still resolving, the panel shows `Checking for YouTube chapters...`, marks Chapters busy immediately, and temporarily suppresses the duplicate native chapter chip instead of flashing a generic empty state.

### YouTube navigation

- A direct watch/live load initializes the integration normally.
- During watch-to-watch navigation, `yt-navigate-start` opens a bounded non-destructive transition. The outgoing chrome stays stable, observer/URL fallbacks are gated, and the destination commit owns reset/rebuild.
- Previous-video rows and results are cleared before destination data is accepted. Player responses, macro markers, and structured data must identify the active video.
- Async generation continuations also require the active video key plus a monotonic generation ID. Stale requests cannot clear a destination video's loading state or make `Chapters...` lose its ellipsis during tab switching.
- During watch-to-home or another non-video navigation, the outgoing integration is not dismantled before the page change; it is removed after the non-video destination commits.
- On homepage/feed pages, the lightweight route guard turns watch/live SPA transitions into real navigations so Safari injects the watch-only scripts. Finish-event and URL-change fallbacks cover missed clicks.
- Shorts and other non-video layouts do not run the full integration.

### Providers and credentials

- Disconnected ChatGPT and Grok options remain visible but disabled. Their labels are exactly `ChatGPT is not connected.` and `Grok is not connected.`
- ChatGPT/Codex and Grok access/refresh tokens use the shared macOS data-protection Keychain; only non-secret settings and expiry metadata use app-group preferences.
- The Grok listener fix has completed a fresh normal Safari/xAI authorization on the formerly affected Mac. Manual callback/code completion remains a recovery path.
- Timestamp and summary model lists sort higher versions before lower versions, while equal-version curated variants retain their intended order.
- Grok 4.5 timestamp and summary requests explicitly use low reasoning effort; Grok 4.3 remains available with its provider default, and request diagnostics expose first-output latency plus provider token/service-tier metrics.
- A code-path audit confirmed that both Grok request kinds use the same `GrokGenerationService.requestText` Responses builder, so exact and version-suffixed Grok 4.5 model IDs cannot bypass the low-reasoning injection.
- Hands-on testing reduced the initial Grok 4.5 gap from roughly 36s versus 9s to 14s versus 7s after the low-reasoning change. Broader follow-up testing found Grok 4.5 typically only about 20% slower than Grok 4.3, with better perceived 4.5 quality. Grok 4.5 therefore remains the default without adding benchmark UI, adaptive effort, priority processing, or prompt-cache complexity.
- GPT-5.6 Terra is the ChatGPT default for fresh, reset, or otherwise missing/invalid settings; upgrades preserve every valid saved user selection.

## Code Review Result

No unresolved high-severity correctness or security issue was found in the reviewed routing, chapter-state, provider-status, credential, clipboard, or generation boundaries. The review and subsequent hands-on sessions found and fixed nine lower-severity but user-visible ownership problems:

- provider errors could expand the intentionally concise disconnected labels
- the standalone fallback could mount before transcript failure was known and become an error-only sidebar
- pending native chapter discovery could briefly render generic empty copy and duplicate the native Chapters chip during navigation
- one shared automatic-analysis flag allowed Chapters resolution or an earlier Chapters attempt to suppress an unattempted Summary
- recycled per-video generation IDs let an old async continuation clear a new video's loading flag when both happened to use the same number
- repeated reconciliation/status consumers joined one correctly shared transcript request but each appended the same shared-fetch diagnostic
- the extension could make the shell visible without changing YouTube's private open state, so the native Close handler could do nothing; the local listener also recorded dismissal while the panel was still visible, allowing reconciliation to misread that frame as a reopen
- the description's `Show transcript` command opened a second modern transcript panel while reconciliation restored and stacked the integrated Chapters shell above it
- a generic target-less button-count fallback could classify YouTube's structured Description surface as `In this video`, while transcript discovery could expand the description without positive transcript evidence

The resulting contracts now have one owner each: shared transcript availability gates fallback placement, chapter detection owns the pending source presentation, Chapters/Summary track automatic attempts independently, and the transcript orchestrator owns one shared-wait notification per request/result kind. The Grok request audit also confirmed one shared Responses builder applies low reasoning to every Grok 4.5 Chapters, Summary, and retry path.

The remaining complexity is documented and intentionally deferred:

- provider SSE/output parsing remains separate until provider-specific error fixtures exist
- `content.js` remains a large page controller, although status, retention, transcript sharing, generation polling, chapter state, native-panel logic, routing, and navigation coordination have been extracted and tested
- the route guard remains until an always-loaded bootstrap has a dedicated Safari regression pass
- retired Apple Intelligence/PCC investigation source remains compiler-excluded rather than physically deleted

These items are maintenance opportunities, not version 1.1 release blockers.

## Release Gates

Before cutting version 1.1:

1. During iterative Safari validation, use only the signed Debug build from Xcode. Do not register Debug and Release host apps together; reserve Release builds for the final packaging gate.
2. Complete the automated validation recorded below.
3. Run the Safari manual matrix in [RELEASING.md](../RELEASING.md), especially repeated tab switching, copy feedback, native/generated switching, native-Chapters plus automatic-Summary behavior, delayed chapter discovery, transcript-free pages, and all four navigation routes.
4. After explicit approval, build, sign, notarize, staple, and Gatekeeper-validate the release candidate.
5. Test that exact notarized candidate as both a fresh install and an upgrade from version 1.0.5 so Safari extension visibility/enablement does not require deleting the app.
6. If submitting to the Mac App Store, finish the provider-retention review called out in [APP_STORE_CONNECT_COPY.md](../APP_STORE_CONNECT_COPY.md) before finalizing App Privacy answers.

The App Store update is intentionally deferred until the GitHub build has received additional real-world testing. GitHub publication does not imply that the App Store submission gate is complete.

After the user approves the tested candidate:

1. Change the `Unreleased` heading in [CHANGELOG.md](../CHANGELOG.md) to `v1.1` with the release date.
2. Run the full automated and manual release gates from a clean candidate commit.
3. Run `NOTARIZE=1 NOTARY_PROFILE=yts-notary ./scripts/build-release.sh`; do not keep that Release host registered alongside the Debug test host.
4. Verify the exported app's signature, notarization ticket, Gatekeeper acceptance, public version, embedded extension version, and SHA-256 checksum.
5. Test that notarized artifact on a clean user account or Mac as a fresh install and as an upgrade over public version 1.0.5.
6. Tag that exact candidate commit as `v1.1`, push the commit and tag, and create the GitHub release with the public title `1.1`, using [github-release-1.1.md](github-release-1.1.md) as its description and attaching `build/release/artifacts/Timestamps-and-Summaries-for-YT.zip`.
7. Confirm the repository's `releases/latest/download/Timestamps-and-Summaries-for-YT.zip` URL downloads the new asset, then unregister the Release host before returning to Debug development.

## Automated Validation

Completed on 2026-07-20:

- JavaScript behavior suite: **78 passed, 0 failed**
- signed Swift/Xcode behavior suite: **14 passed, 0 failed**
- signed Release configuration build: **succeeded**
- Xcode Release static analysis: **succeeded**
- JavaScript syntax checks: **passed**
- WebExtension manifest JSON and native property lists: **valid**
- release shell script syntax: **valid**
- repository whitespace/error check: **passed**
- local Markdown links, including generated `.html` documentation targets: **resolved**

The Release results above are one-time release-readiness checks, not the active Safari test build. All continuing hands-on testing uses the single signed Debug host until the final packaging gate.

Release metadata is prepared as public version `1.1` in Xcode and the WebExtension manifest. Xcode uses internal build `7`; the build number is not part of the public release name.

GitHub/package prerequisites were rechecked on 2026-07-20 without creating a Release build:

- GitHub CLI authentication targets `Hlbkomer/YouTube-Timestamps-and-Summaries`, whose current latest release is `v1.0.5`.
- The current public release includes the stable `Timestamps-and-Summaries-for-YT.zip` asset expected by the repository's latest-download links.
- A Developer ID Application identity for team `3PHWBNH53Z` is installed.
- The `yts-notary` keychain profile authenticates successfully with Apple's notary service.
- Only the signed DerivedData Debug host and its embedded extension are registered with Launch Services.
- The signed Debug app, extension, and WebExtension manifest all report public version `1.1`; the embedded `native-panel.js` and `content.js` hashes match the working sources.

## Final GitHub Candidate

The user completed the hands-on Safari testing pass without finding a release blocker and approved GitHub publication on 2026-07-20. The Mac App Store update remains intentionally deferred.

The final Developer ID candidate was archived from this source tree, accepted by Apple's notary service, stapled, and re-zipped on 2026-07-20:

- notarization submission: `1494e532-ef31-473c-af50-09ddfe8090ee` (`Accepted`)
- public artifact: `Timestamps-and-Summaries-for-YT.zip`
- artifact size: `5,324,232` bytes
- SHA-256: `49d5698ba0b44d453a8c0f87dfdae929bdcc198f0469cf1c5f3afd169a415295`
- host app: public version `1.1`, internal build `7`, universal `x86_64 arm64`
- embedded extension: public version `1.1`, internal build `7`, universal `x86_64 arm64`
- WebExtension manifest: version `1.1`

A fresh extraction of that final ZIP passed deep/strict code-signature verification, stapler validation, and Gatekeeper assessment as `Notarized Developer ID`. The host and extension both carry the expected shared app-group and Keychain access-group entitlements, and the embedded integration resources match the reviewed source files byte-for-byte.
