# App Store Connect Copy

This file is a working draft for App Store Connect.

Status note: the current build can show YouTube-provided chapters without sign-in and can generate Apple Intelligence summaries locally when that Summary model is selected. ChatGPT or Grok sign-in is optional and unlocks transcript-generated chapters plus provider summaries. Re-check App Review, privacy, and third-party-service wording before submitting this version.

It is based on the current app behavior and Apple’s current App Store Connect requirements for:

- app information
- platform version metadata
- App Review information
- App Privacy disclosures

Use this as a working draft, not as legal advice.

## App Information

### Name

`Timestamps & Summaries for YT`

### Subtitle

`Safari Extension for YouTube`

### Primary category

`Productivity`

### Secondary category

`Utilities`

### Privacy Policy URL

`https://hlbkomer.github.io/privacy.html`

### Support URL

Recommended:

`https://hlbkomer.github.io/`

Current support contact shown on the page:

- `hlbkomer@gmail.com`

The page also links to the GitHub issue tracker.

### Marketing URL

`https://hlbkomer.github.io/`

### Copyright

Suggested first draft:

`2026 Matus Vojtek`

### SKU

Suggested internal SKU:

`timestamps-summaries-yt-mac-001`

## Version Metadata

### Promotional Text

Generate clean timestamps and short summaries for supported YouTube videos directly in Safari.

### Description

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

### Keywords

Suggested keyword string:

`timestamps,summary,video notes,safari,transcript,youtube`

Note:

Apple says you should not duplicate your app name or other app/company names in keywords. If review gets picky about `youtube` here, remove it first.

## App Review Information

### Contact information

Fill with your real details in App Store Connect:

- first name
- last name
- email
- phone number

### Sign-in required

`No`

The app can show chapters already provided by YouTube without sign-in. It can also generate summaries with Apple Intelligence without provider sign-in when Apple Intelligence is selected. ChatGPT or Grok sign-in is optional and unlocks transcript-generated chapters plus provider summaries.

### Demo account

Provide an account only if Apple requests one. Do not include personal credentials in public repository files.

### Review Notes

Suggested review note:

```text
This app is a macOS container app for a Safari web extension.

The extension adds Chapters and Summary tabs to YouTube's `In this video` panel when available, with a standalone sidebar fallback when a usable transcript exists. Pages with neither the native panel nor a transcript are left unchanged. Existing YouTube chapters and Key moments require no sign-in. Apple Intelligence can generate summaries locally without provider sign-in when it is selected as the Summary model. ChatGPT or Grok sign-in is optional and unlocks generated chapters plus provider-powered summaries.

No API key or developer-operated backend is required.

Review steps:
1. Launch the macOS app.
2. Click "Open Safari Extension Settings" and enable the Safari extension.
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

## App Privacy

This is the best-effort mapping based on the current codebase.

You should review these answers carefully in App Store Connect before submitting.

### Tracking

Suggested answer:

- `No`, this app does not track users across apps or websites.

Reasoning:

- no ad SDKs
- no analytics SDKs
- no data broker sharing
- no first-party advertising or cross-app tracking logic

### Data collected

Suggested answer:

- `Re-check before submission.` The app has no developer backend, but App Store privacy answers also cover qualifying data handled by third-party partners. Transcript text is sent through the person's account to the selected ChatGPT/Codex or Grok service for generated chapters and provider summaries.

Reasoning:

- no analytics SDK
- no developer backend
- no bundled generation credentials
- ChatGPT and Grok OAuth credentials are stored in the local macOS data-protection Keychain under a shared app/extension access group
- transcript text is sent directly to the selected provider for generated chapters and provider summaries
- transcript text is used locally for Apple Intelligence summary generation when that summary option is selected

### Data-type review

Likely `No` based on the repository itself:

- Health & Fitness
- Financial Info
- Location
- Contacts
- Sensitive Info
- Diagnostics
- Purchases
- Search History
- Usage Data / Product Interaction

Do not finalize the overall `Data collected` answer from the repository alone. Before submission, check the current provider terms for retention and account linkage. If transcript text is retained beyond servicing the request, evaluate `Other User Content`, used for `App Functionality`, and whether it is linked to the person's provider account. Also verify whether the provider sign-in flow creates any separately reportable identifiers or contact information under Apple's current questionnaire.

Important note:

The app stores settings locally on device, but it does not send app analytics, crash analytics, or advertising identifiers to a developer-operated backend. Apple's definition of collection depends on whether data is accessible beyond the time needed to service a request, so provider retention behavior is material to the final answers.

### Privacy notes

Potential nuance:

If App Store Connect’s questionnaire wording changes, review the answers against the current build behavior before submitting.

## Remaining App Store prep tasks

1. Add visible support contact information to `https://hlbkomer.github.io/`
2. Confirm the review build runs on macOS 26.4 or later
3. Fill App Privacy in App Store Connect using the draft above
4. Create screenshots for:
   - companion app
   - native `In this video` Chapters view
   - Summary view
   - optional YouTube/generated chapter-source switch
5. Create the App Store Connect app record
6. Decide whether App Review needs connected-provider credentials or whether the no-account YouTube chapter and Apple Intelligence paths are sufficient; Apple asks for working review access to account-based features when those features are part of the submitted experience.
7. Upload an App Store build when ready
