# App Store Prep

This document captures the current App Store readiness state for the macOS app that contains the Safari web extension.

For paste-ready App Store Connect fields and privacy answers, see:

- [APP_STORE_CONNECT_COPY.md](APP_STORE_CONNECT_COPY.md)

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
- The current default generation path requires ChatGPT sign-in for timestamps.
- Developer signing and notarization work is already underway for outside-the-store distribution.

## Likely App Review risks

### 1. App name and trademark sensitivity

The Xcode target names and bundle identifiers can remain internal implementation details, but the user-facing display name should match the App Store listing.

That may be risky for App Review because Apple can reject app metadata that uses third-party trademarks in a misleading or over-claiming way.

For the App Store listing, a safer approach is:

- App name: `Timestamps & Summaries for YT`
- Subtitle: `Safari Extension for YouTube`

This also fits Apple’s App Store metadata length limits more comfortably.

### 2. Optional Apple Intelligence summary mode

Apple Intelligence is optional and only used when selected for summaries. The default generation path uses ChatGPT for both timestamps and summaries.

Recommended plan:

- make the minimum macOS version clear in metadata
- mention in review notes that Apple Intelligence is optional and requires compatible hardware only if selected
- include screenshots that show the working extension flow

### 3. App privacy answers

App Store Connect requires app privacy disclosures before submission.

This app does not operate its own backend. The current default build sends transcript text to ChatGPT through the user's signed-in account for timestamps and summaries.

The current likely direction is:

- no tracking
- no data collected by the developer
- ChatGPT sign-in is required for timestamp generation
- transcript text is sent to ChatGPT for timestamp generation and, by default, summary generation
- transcript text is used locally for Apple Intelligence summary generation when that option is selected
- local settings remain on the user's Mac

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

The app includes a lightweight macOS companion app for enabling the Safari extension, signing in with ChatGPT, and choosing generation settings. The Safari extension generates timestamps and summaries automatically on supported video pages.

Features:

- simple Safari sidebar for timestamps and summaries
- clickable timestamp links that jump to the right moment
- transcript-based generation
- ChatGPT generation through the user's account
- optional Apple Intelligence summaries on your Mac
- no API key or developer backend required

Important notes:

- requires Safari on macOS 26 or later
- requires ChatGPT sign-in for timestamp generation
- Apple Intelligence summaries require Apple Intelligence enabled on a compatible Mac
- videos need captions or an available transcript
- generated output may be incomplete or inaccurate

### Keywords ideas

`youtube,timestamps,summary,video notes,safari,transcript`

## Review notes draft

Suggested App Review notes:

```text
This app is a macOS container app for a Safari web extension.

The extension adds a sidebar on supported YouTube video pages. It generates timestamps from the available YouTube transcript through the user's ChatGPT sign-in. Summaries use ChatGPT by default, or Apple Intelligence on the Mac if selected in the companion app.

No API key or developer-operated backend is required.

Review steps:
1. Launch the macOS app.
2. Click “Open Safari Extension Settings” and enable the Safari extension.
3. Open a supported YouTube watch page in Safari.
4. Sign in with ChatGPT in the companion app if not already signed in.
5. Use the Timestamps and Summary tabs in the extension sidebar.

Important:
- Review requires ChatGPT sign-in for timestamp generation.
- Apple Intelligence is optional and only required if selected for summaries.
- Timestamps and Summary generate automatically on supported watch pages.
- Videos without captions or an available transcript will show a clear error.
```

## Privacy disclosure prep

The final App Store Connect answers should be reviewed carefully before submission, but the current likely direction is:

- data is not used for tracking
- data is not sold
- app settings are stored locally on device
- ChatGPT tokens are stored locally in Safari extension storage
- transcript text is sent to ChatGPT for timestamp generation and, by default, summary generation
- transcript text is used locally for Apple Intelligence summary generation when that option is selected

This section still needs a careful final pass before submission.

## Assets to prepare

- macOS app icon
- at least a few clean macOS screenshots:
  - companion app setup screen
  - Safari video page with timestamps sidebar
  - Safari video page with summary view
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
5. Upload an App Store build when the metadata is ready.
