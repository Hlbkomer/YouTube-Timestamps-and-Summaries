# App Store Prep

This document captures the current App Store readiness state for the macOS app that contains the Safari web extension.

The App Store build must use Xcode's ordinary `Release` configuration. `scripts/build-release.sh` is for Developer ID signing and notarization. Both builds use the same sandboxed Grok browser-OAuth integration; neither bundles or registers a helper.

For paste-ready App Store Connect fields and privacy answers, see:

- [APP_STORE_CONNECT_COPY.md](APP_STORE_CONNECT_COPY.md)

Primary Apple references used for this review:

- [Distributing your Safari web extension](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)
- [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

## What Apple’s flow looks like

- A Safari web extension is distributed through a containing macOS app.
- App Store distribution is separate from Developer ID notarization.
- For App Store release, the app needs:
  - an App Store Connect app record
  - App Store metadata and screenshots
  - app privacy answers
  - a review-ready build uploaded with the `App Store Connect` distribution method
  - App Review approval

## What is already in good shape

- The containing macOS app and Safari web extension are working end to end.
- GitHub repo, README, support links, privacy policy, and terms already exist.
- A root site for public links exists at `https://hlbkomer.github.io/`.
- Apple Intelligence can generate summaries without a cloud-provider sign-in when the reviewer selects it as the Summary model.
- ChatGPT and Grok sign-in are optional and unlock generated chapters plus provider-powered summaries.
- Existing YouTube creator chapters and automatic Key moments work without either provider and appear in the same compact Chapters view.
- Version 1.1 is signed, notarized, and published on GitHub for outside-the-store distribution. The App Store update remains a separate, intentionally deferred release track.

## Likely App Review risks

### 1. App name and trademark sensitivity

The Xcode target names and bundle identifiers can remain internal implementation details, but the user-facing display name should match the App Store listing.

That may be risky for App Review because Apple can reject app metadata that uses third-party trademarks in a misleading or over-claiming way.

For the App Store listing, a safer approach is:

- App name: `Timestamps & Summaries for YT`
- Subtitle: `Safari Extension for YouTube`

This also fits Apple’s App Store metadata length limits more comfortably.

### 2. Optional Apple Intelligence summary mode

Apple Intelligence is optional and only used when selected for summaries. Cloud generation uses whichever connected provider and model the person selects; the app does not silently send an Apple Intelligence request to a provider if local generation fails.

Recommended plan:

- make the minimum macOS version clear in metadata
- mention in review notes that Apple Intelligence is optional and requires compatible hardware only if selected
- include screenshots that show the working extension flow

### 3. App privacy answers

App Store Connect requires app privacy disclosures before submission.

This app does not operate its own backend. When cloud generation is selected, the build sends transcript text directly to the selected ChatGPT/Codex or Grok service through the person's signed-in account. Apple Intelligence summary generation stays on the Mac.

The current likely direction is:

- no tracking
- no transcript or account data sent to a developer-operated backend
- generated chapters and provider summaries require a connected selected provider
- transcript text is sent directly to the selected provider for generated chapters and provider summaries
- transcript text is used locally for Apple Intelligence summary generation when that option is selected
- OAuth credentials are stored in the local macOS data-protection Keychain; non-secret settings remain in the shared app-group preferences on the Mac

## Recommended App Store metadata

### App name

`Timestamps & Summaries for YT`

### Subtitle

`Safari Extension for YouTube`

### Promotional text

Generate clean timestamps and short summaries for supported YouTube videos directly in Safari.

### Description draft

Timestamps & Summaries for YT helps you create quick video notes for supported YouTube videos in Safari.

Use the Safari extension to generate:

- chronological timestamps
- short video summaries

The app includes a lightweight macOS companion app for enabling the Safari extension, optionally signing in with ChatGPT or Grok, and choosing generation settings. The Safari extension shows chapters and summaries automatically on supported video pages.

Features:

- native-looking Chapters and Summary tabs inside YouTube's `In this video` panel, with a transcript-backed standalone fallback when that panel is unavailable
- one compact chapter format for YouTube creator chapters, automatic Key moments, and generated chapters
- an inline source action for switching between YouTube and generated chapters when both are available
- clickable timestamp links that jump to the right moment
- transcript-based generation
- Apple Intelligence summaries on your Mac without provider sign-in
- optional ChatGPT/Codex or Grok generation through the user's account
- no API key or developer backend required

Important notes:

- requires Safari on macOS 26.4 or later
- generated chapters and cloud summaries require the selected provider to be connected
- Apple Intelligence summaries require Apple Intelligence enabled on a compatible Mac
- videos need captions or an available transcript
- generated output may be incomplete or inaccurate

### Keywords ideas

`youtube,timestamps,summary,video notes,safari,transcript`

## Review notes draft

Suggested App Review notes:

```text
This app is a macOS container app for a Safari web extension.

The extension adds Chapters and Summary tabs to YouTube's `In this video` panel when available, with a standalone sidebar fallback when a usable transcript exists. Pages with neither the native panel nor a transcript are left unchanged. Existing YouTube chapters and Key moments require no sign-in. Apple Intelligence can generate summaries locally without provider sign-in when it is selected as the Summary model. ChatGPT or Grok sign-in is optional and unlocks generated chapters plus provider-powered summaries.

No API key or developer-operated backend is required.

Review steps:
1. Launch the macOS app.
2. Click “Open Safari Extension Settings” and enable the Safari extension.
3. Open a supported YouTube watch page in Safari.
4. In the companion app, choose Apple Intelligence as the Summary model, then use Summary in the YouTube panel. No provider account is required for this path.
5. On a video with YouTube chapters or Key moments and a transcript, confirm the compact Chapters list, its YouTube attribution footer, and automatic Summary creation.
6. Optional: sign in with ChatGPT or Grok to test transcript-generated chapters and provider summaries.
7. If both YouTube and generated chapters exist, use the inline footer action to switch sources.

Important:
- Generated chapters require a connected selected provider. YouTube-provided chapters do not.
- Summary generation works without a provider when Apple Intelligence is selected and available.
- Chapters and Summary load automatically on supported watch pages when their configured source/engine is available.
- A page with neither YouTube's native panel nor a transcript is left unchanged. If the native panel exists and generation is requested without a transcript, the extension reports that clearly.
```

## Privacy disclosure prep

The final App Store Connect answers should be reviewed carefully before submission, but the current likely direction is:

- data is not used for tracking
- data is not sold
- app settings are stored locally on device
- ChatGPT and Grok OAuth credentials are stored in the local macOS data-protection Keychain under a shared app/extension access group
- transcript text is sent directly to the selected provider for generated chapters and provider summaries
- transcript text is used locally for Apple Intelligence summary generation when that option is selected

Apple's App Privacy definition can include data handled by third-party partners, not only data sent to a developer backend. Before submission, re-check the current ChatGPT and xAI service retention/account-linking terms and map transcript text to the App Store Connect data types and purposes. Do not answer `No data collected` solely because this project has no backend.

## Assets to prepare

- macOS app icon
- at least a few clean macOS screenshots:
  - companion app setup screen
  - Safari video page with the native `In this video` Chapters view
  - Safari video page with the Summary view
  - optional source-switch example showing YouTube and generated chapters
- support URL:
  - `https://hlbkomer.github.io/`
- privacy policy URL:
  - `https://hlbkomer.github.io/privacy.html`

## Next practical steps

1. Create an App Store Connect app record for the macOS app.
2. Use safer App Store-facing metadata:
   - `Timestamps & Summaries for YT`
   - subtitle `Safari Extension for YouTube`
3. Complete App Privacy in App Store Connect.
4. Align the in-app visible title with the App Store-facing name.
5. Reconcile the App Privacy answers with the current ChatGPT and xAI service terms.
6. Upload an App Store build when the metadata is ready.
