# App Store Connect Copy

This file is a working draft for App Store Connect.

Status note: the current default build uses ChatGPT sign-in for timestamps and summaries. Apple Intelligence remains available as an optional local summary engine. Re-check App Review, privacy, and third-party-service wording before submitting this version.

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

`Yes`

This app requires ChatGPT sign-in for timestamp generation. Summaries use ChatGPT by default, with Apple Intelligence available as an optional local summary engine.

### Demo account

Provide an account only if Apple requests one. Do not include personal credentials in public repository files.

### Review Notes

Suggested review note:

```text
This app is a macOS container app for a Safari web extension.

The extension adds a sidebar on supported YouTube video pages. It generates timestamps from the available YouTube transcript through the user's ChatGPT sign-in. Summaries use ChatGPT by default, or Apple Intelligence on the Mac if selected in the companion app.

No API key or developer-operated backend is required.

Review steps:
1. Launch the macOS app.
2. Click "Open Safari Extension Settings" and enable the Safari extension.
3. Open a supported YouTube watch page in Safari.
4. Sign in with ChatGPT in the companion app if not already signed in.
5. Use the Timestamps and Summary tabs in the extension sidebar.

Important:
- Review requires ChatGPT sign-in for timestamp generation.
- Apple Intelligence is optional and only required if selected for summaries.
- Timestamps and Summary generate automatically on supported watch pages.
- Videos without captions or an available transcript will show a clear error.
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

- Re-check in App Store Connect. The app does not collect data to a developer backend, but transcript text is sent to ChatGPT for timestamp generation and, by default, summary generation through the user's account.

Reasoning:

- no analytics SDK
- no developer backend
- no bundled generation credentials
- ChatGPT OAuth tokens are stored locally in Safari extension storage
- transcript text is sent to ChatGPT for timestamp generation and, by default, summary generation
- transcript text is used locally for Apple Intelligence summary generation when that summary option is selected

### Data not collected

Suggested answers:

- Contact Info: `No`
- Health & Fitness: `No`
- Financial Info: `No`
- Location: `No`
- Contacts: `No`
- Sensitive Info: `No`
- Diagnostics: `No`
- Purchases: `No`
- Search History: `No`
- Usage Data / Product Interaction: `No`

Important note:

The app stores settings locally on device, but it does not send app analytics, crash analytics, or advertising identifiers to a developer-operated backend.

### Privacy notes

Potential nuance:

If App Store Connect’s questionnaire wording changes, review the answers against the current build behavior before submitting.

## Remaining App Store prep tasks

1. Add visible support contact information to `https://hlbkomer.github.io/`
2. Confirm the review build runs on macOS 26 or later
3. Fill App Privacy in App Store Connect using the draft above
4. Create screenshots for:
   - companion app
   - timestamps sidebar
   - summary sidebar
5. Create the App Store Connect app record
6. Upload an App Store build when ready
