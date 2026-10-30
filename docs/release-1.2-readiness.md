# Version 1.2 Release Record

Original candidate review: 2026-08-21. Model-support follow-ups: 2026-09-19 and 2026-09-24.

Status: **GitHub version 1.2/build 8 approved for publication on October 30, 2026, using the verified notarized ZIP below. Both public websites are included in this publication. App Store work is explicitly excluded and remains local/unsubmitted.**

This document records the version 1.2 code, documentation, visual, signing, and packaging gates. Public GitHub copy is in [github-release-1.2.md](github-release-1.2.md). The reusable procedure remains in [RELEASING.md](../RELEASING.md).

## Verified Publication Candidate — October 30, 2026

This section supersedes the older readiness/status findings below.

- Latest GitHub release checked live: `v1.1`, published July 20, 2026. Remote `main` and the latest GitHub Pages build remain at `405538e3c7a34fa3bb512651380e7112d58dac11`.
- Next minor version: `1.2`, build `8`, matching the host, extension, and WebExtension manifest.
- Built from local base `92e166f` plus the current working tree. Changes have not been committed, tagged, pushed, or uploaded. The unrelated modified Apple benchmark output remains untouched.
- Current package: `build/release-1.2-20261030/artifacts/Timestamps-and-Summaries-for-YT.zip` (5,609,828 bytes).
- SHA-256: `c80623a12b288d74d48e8c25193d7eb181ee8e92a9c54207e4faf0fb9a669dbc`.
- Developer ID signature: `Developer ID Application: Matus Vojtek (3PHWBNH53Z)`.
- Apple notarization: **Accepted**, submission `e5701cbc-b987-4420-a232-c2060fa2bd3f`. Initial agreement errors were resolved by the account holder accepting the outstanding agreements.
- Ticket stapled and validated. The finished ZIP was extracted; strict deep signature verification, ticket validation, Gatekeeper assessment, and the `/Applications` shortcut target all passed. Gatekeeper reports `Notarized Developer ID`.
- **112 JavaScript checks passed; 44 signed Debug native cases passed across 48 runs.** App/extension plist files, manifest JSON, model-catalog JSON, and whitespace checks passed. The Release archive and Developer ID export succeeded using Xcode 27.2.
- Fixed release-script handling of an omitted provisioning-update flag under macOS Bash. Added executable regression coverage. Verification now uses local temporary storage outside cloud-managed project folders and cleans up its host registration even on failure.
- Release hosts and temporary verification registrations were removed. The normal signed Debug app was rebuilt, registered, and launched for development.
- Website copy includes Gemini API-key use, all three Gemini model choices, low thinking, and Chapters/Summary/Transcript without Timeline. Captured a current Debug companion screenshot; rebuilt the two illustrative panel previews from `scripts/release-showcase.html` and labelled example content. The local website preview loaded every image without horizontal overflow at the default desktop width.
- Review files: `docs/github-release-1.2.md`, `CHANGELOG.md`, and the local `build/release-1.2-20261030/site-preview/index.html`. `release-manifest.json` records app-input hashes and package provenance; `artifacts/SHA256SUMS` records the upload checksum.
- No live generation calls or new clean-account install/upgrade checks were performed in this packaging pass. The earlier Safari checks below are historical. App Store copy, screenshots, archive/upload, and submission are not part of this GitHub preparation.

Publication authorization: the user requested everything except App Store. Publish the app/site/release source, matching `v1.2` tag, verified notarized ZIP and checksum, then deploy both GitHub Pages sites. App Store metadata drafts, installer and submission are excluded. Do not reuse the older August archive listed below. Deployment and download verification are recorded after publication.

## Historical Preparation Follow-up — October 30

- Website headline changed to `Better YouTube Chapters` in the source and offline preview.
- Apple’s public Mac App Store listing reports 1.0.4, released May 18, 2026. Prepared the cumulative 1.2 App Store changelog in `docs/app-store-whats-new-1.2.txt` and the corresponding App Store Connect copy section. The subsequent preparation pass refreshed the App Store description, review notes, and privacy draft for Gemini; see `APP_STORE_PREP.md` for the locally exported App Store installer and remaining Connect actions.
- The project-site draft and GitHub ZIP are prepared locally. No public site, public download, or App Store listing/build has been updated. The separate legacy root-site bundle is now regenerated from the project homepage, privacy/terms sources, and current images using `scripts/prepare-root-site.py`. It is packaged as `build/release-1.2-20261030/artifacts/root-site-1.2.zip` for `Hlbkomer/hlbkomer.github.io`; neither site has been deployed.
- No compiled app inputs changed; the already notarized GitHub ZIP checksum remains valid.

## Historical Status Audit — October 18, 2026

- GitHub's live release API reports `v1.1` as latest, published July 20, 2026. There is no published or draft `v1.2` release in the returned release list.
- GitHub Pages is built from `main:/docs`. Its latest build API reports commit `405538e3c7a34fa3bb512651380e7112d58dac11`, created July 20, 2026 at 15:45 UTC. The public site still presents version 1.1 and the earlier text-focused page. The redesigned local `docs/index.md` has not been deployed.
- The local landing page, README release badge/date, and release notes already present 1.2 as though published in places. Treat this as prepared copy until publication. The landing page, App Store description/review notes/privacy working copy, and companion screenshot still omit Gemini and need to reflect optional Google API-key use before shipping this expanded candidate.
- The last directly confirmed App Store state, from the user's September 19 release chat, is: build 8 not uploaded; screenshots and build upload to be performed by the user; privacy answers and private Review Notes prepared; no submission. This is a historical confirmation, not a fresh authenticated App Store Connect status check.
- Earlier code/signing/notarization approval and the August ZIP predate Gemini and subsequent model changes. They do not validate the current source for distribution. A fresh final package and App Store archive/upload are separate remaining steps; this audit performs no Release build or publication.
- Timeline behavior matches current code and documentation: the native Timeline tab is allowed when YouTube provides it. `shouldHideNativeOwnedTab()` suppresses only the native Chapters/Key moments surface once the extension's compact Chapters view replaces it. No Timeline-hiding change was found in the inspected code, documentation, or available native-panel commit history. This audit leaves that behavior unchanged.

## Version Contract

- public version: `1.2`
- internal build: `8`
- host app `MARKETING_VERSION`: `1.2`
- Safari extension `MARKETING_VERSION`: `1.2`
- WebExtension manifest: `1.2`
- public artifact name: `Timestamps-and-Summaries-for-YT.zip`
- minimum macOS version: `26.4`

## Reviewed Release Scope

- Google Gemini API-key support now uses `gemini-flash-latest` with low thinking. Keys remain in the shared Keychain, unsupported model settings use generic default fallback without migrations, and successful diagnostics report the concrete response model. See [gemini-integration.md](gemini-integration.md).

- Grok 4.7 is the fresh/default Grok selection, with Grok 4.7, 4.6, and 4.5 enforcing explicit low reasoning at the final shared xAI request boundary. Existing valid Grok selections remain authoritative.
- GPT-6 Luna is the fresh/default ChatGPT/Codex selection; valid existing selections remain authoritative.
- GPT-6.1 Sol is the optional flagship Chapters/Summary model in the local and remote catalogs. GPT-6 Astra was added and later removed; [chatgpt-astra-support.md](chatgpt-astra-support.md) is kept only as a historical validation record.
- GPT-5.x and GPT-6 Astra are removed; old saved selections for them use the normal GPT-6 Luna default.
- Provider summaries share one versioned prompt builder, while production retains the reviewed legacy prompt contract.
- Apple Intelligence Summary keeps the macOS 26 path and uses the adaptive-grounded macOS 27 path, including strict final-output validation and incomplete-chunk failure handling.
- Chapters and Summary share one transcript acquisition per video; fresh player caption URLs precede page-embedded and UI/timed-text fallbacks.
- Native-panel recognition rejects targeted Description surfaces and restores shells that the extension auto-opened if YouTube reuses them or positive content evidence disappears.
- The public ZIP contains the app plus an `Applications` symlink; Apple's temporary notarization upload remains app-only.
- Provider request user agents derive from the running app or extension bundle version instead of a stale hard-coded version.

## Code And Documentation Review

No release-blocking correctness, security, or ownership issue was found in the reviewed 1.2 delta after the fixes above. The review covered provider defaults and model normalization, Grok request serialization, provider-summary routing, Apple summary completion behavior, shared transcript acquisition, native-panel ownership, post-live captionless behavior, versioning, packaging, public privacy disclosures, release copy, and current imagery.

The public privacy copy now distinguishes data sent to providers from video context prepared locally at the native boundary. Under the current production provider prompt, timestamped transcript text is sent for generated Chapters and timestamp-stripped transcript text is sent for provider Summary; prepared title/channel/description/duration/caption-source metadata is not included in that production cloud prompt.

## Automated Validation

Completed during candidate preparation on 2026-08-21:

- JavaScript behavior suite: **95 passed, 0 failed**
- signed Debug Swift/Xcode behavior suite: **30 passed, 0 failed**
- Xcode Debug static analysis: **succeeded**
- JavaScript syntax checks: **passed**
- WebExtension manifest JSON and native property lists: **valid**
- release packaging shell syntax, extracted-symlink regression, and extracted-app trust checks: **passed**
- repository whitespace/error check: **passed**

The complete gates are rerun after the final documentation and version edits and before packaging.

Model-support follow-up on 2026-09-19: **97 JavaScript tests passed**, **32 signed Debug Swift tests passed**, and live Astra Chapters/Summary backend checks passed. Project/catalog validation and the whitespace check passed. The full evidence, timings, signing-environment issue, and remaining real-Safari/long-video gaps are in [chatgpt-astra-support.md](chatgpt-astra-support.md). Static analysis and final Release packaging were not rerun during this follow-up.

After removing GPT-5.5 and routing unsupported old settings through the normal default on 2026-09-19, the **97 JavaScript tests** and **32 signed Debug Swift tests** passed again. The signed Debug suite passed once more after simplifying that fallback to the Luna default. The opt-in provider tests remained disabled for these ordinary regression runs; the earlier live Astra evidence remains recorded separately.

Grok 4.7 follow-up on 2026-09-24: **97 JavaScript tests passed**, the **33-test signed Debug Swift suite passed**, and the opt-in live Grok 4.7 smoke test passed the production Chapters and Summary paths with explicit low reasoning. xAI returned `grok-4.7` for both requests. Chapters completed in 13,721 ms and Summary in 3,346 ms; the reproducible command and token/first-output metrics are recorded in [grok-integration.md](grok-integration.md). Static analysis and final Release packaging were not rerun during this follow-up.

October 18 Gemini/Flash latest follow-up: **109 JavaScript tests** and **42 signed Debug native tests** passed, including two real `gemini-flash-latest` calls. Both resolved to `gemini-3.8-flash` with low thinking; Chapters took 2,245 ms and Summary 2,412 ms. Details are in [gemini-integration.md](gemini-integration.md). No final Release packaging or App Store upload was performed.

## Website And Release Assets

- GitHub Pages was rewritten as a product-focused landing page with current version 1.2 copy, direct download/install guidance, feature cards, and responsive layout.
- The companion screenshot now shows GPT-6 Luna, chapter-source preference, and both optional provider connections.
- Chapters and Summary showcase images now use the current native `In this video` tab layout rather than the retired standalone-only presentation.
- README and App Store working copy were updated to match the current product behavior and project-scoped support/privacy URLs.
- The four historical root `Store Screenshot` files remain App Store-submission assets and are not part of this GitHub release. App Store submission remains a separate track.

## Manual Safari Matrix

This means a hands-on regression checklist in the actual Safari extension, not another model benchmark or an automated unit-test run. Each item checks what the user sees after real navigation and clicks. The automated backend smoke test does not complete this checklist.

The user accepted routine real-Safari use as the hands-on pass on 2026-09-19 and separately confirmed that Astra works. The only observation was that the sidebar can sometimes take a few seconds to appear after the page and video are ready. That delay is non-blocking for 1.2 and is intentionally deferred for investigation in the next version to avoid destabilizing the release candidate.

The covered release surface is:

- direct watch load, homepage/feed-to-watch, watch-to-watch, watch-to-home, live, post-live without captions, and Shorts
- YouTube creator chapters, Key moments, generated Chapters, source switching, active-row tracking, and Copy
- Summary with the selected provider and Apple Intelligence where available
- GPT-6.1 Sol and GPT-6 Luna selected for Chapters and Summary, including independent model choices (GPT-6 Astra was covered in an earlier pass and has since been removed)
- Chapters/Summary/Transcript/Timeline switching plus repeated Close and `Show transcript` reopen cycles
- fresh and existing settings, both provider connection states, Grok 4.7 low-reasoning diagnostics, and no stale result on the next video

## Previous Candidate (2026-08-21; Stale After Model Changes)

The artifact below predates the September model-support edits. Its signing/notarization evidence is historical and does not validate the updated source. Do not upload this ZIP as the final 1.2 build; rebuild and notarize only when final packaging is explicitly requested.

- Developer ID archive and export: **succeeded**
- Apple notarization: **Accepted**
- notarization submission ID: `8a08ffff-151a-4112-a12d-332173302017`
- stapler validation: **succeeded** on the exported app and an independently extracted ZIP copy
- Gatekeeper: **accepted**, source `Notarized Developer ID`
- signing identity: `Developer ID Application: Matus Vojtek (3PHWBNH53Z)`
- artifact: `build/release/artifacts/Timestamps-and-Summaries-for-YT.zip`
- artifact size: `5,527,714` bytes
- artifact SHA-256: `2a6a275228a353d812cd2932d76752ec20515d7d707444ae57e165e70b14fa84`
- host and extension architectures: `x86_64 arm64`
- extracted versions: host `1.2 (8)`, extension `1.2 (8)`, manifest `1.2`
- extracted ZIP layout: `Timestamps & Summaries for YT.app` plus `Applications -> /Applications`
- extracted code signature: **valid on disk** and satisfies its designated requirement
- embedded `background.js`, `content.js`, `native-panel.js`, and `manifest.json`: byte-identical to the reviewed source
- temporary app-only notarization upload: removed after acceptance
- Release and extracted-verification app paths: unregistered from Launch Services; the normal signed Debug host remains the only registered copy

The release script repeats signature, shortcut, stapler, and Gatekeeper checks against an extracted copy for future builds. Updated packaging remains pending.

## App Store Connect Status

As confirmed on 2026-09-19:

- the current App Store candidate remains version `1.2`, internal build `8`
- build 8 has not already been uploaded to App Store Connect
- the user will upload the screenshots and App Store build
- the App Privacy mapping, privacy-policy copy, and private App Review notes are finalized in [APP_STORE_CONNECT_COPY.md](../APP_STORE_CONNECT_COPY.md)
- the host declares exempt encryption with `ITSAppUsesNonExemptEncryption = NO` so App Store Connect should not require separate export-compliance documentation
- submission has not occurred

## Publication

GitHub CLI authentication was rechecked directly on 2026-09-19 and succeeded for `Hlbkomer`; no reauthentication is currently needed. A sandbox-only failure must not be treated as evidence that the saved credential is invalid.

The user explicitly withheld commit/tag/push/release approval on 2026-09-19. None of those operations is part of this model-support follow-up. After renewed publication approval, hands-on validation, and updated final packaging:

1. commit the reviewed release state
2. create and push annotated tag `v1.2`
3. upload the notarized ZIP with [github-release-1.2.md](github-release-1.2.md)
4. verify the latest-download asset against the local SHA-256
5. confirm the deployed GitHub Pages download and release-note links
