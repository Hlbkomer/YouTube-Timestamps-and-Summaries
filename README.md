# Timestamps & Summaries for YT

Safari extension and macOS companion app that generates YouTube summaries with Apple Intelligence or ChatGPT, and timestamps with ChatGPT.

It adds a right-side sidebar to YouTube with:

- automatic video timestamps when ChatGPT is connected
- automatic video summaries

The extension reads the available YouTube transcript, creates summaries with Apple Intelligence on the Mac or the user's selected signed-in ChatGPT model, and creates timestamps when ChatGPT is connected. No API key or developer backend is required.

Under the hood, the extension keeps transcript timing deterministic, validates generated timestamps against real transcript cue times, and keeps Apple Intelligence available as an optional local summary engine. See [ARCHITECTURE.md](ARCHITECTURE.md) for the current generation pipeline and guardrails.

## Download

Download the signed and notarized macOS app:

[Download Timestamps & Summaries for YT](https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/releases/latest/download/Timestamps-and-Summaries-for-YT.zip)

After unzipping, move the app to `Applications`, open it and enable the Safari extension.

## Preview

### Demo

![Animated demo](docs/readme-assets/demo.gif)

### Companion App

![Companion app screenshot](docs/readme-assets/companion-app.png)

### YouTube Sidebar

![YouTube sidebar screenshot](docs/readme-assets/youtube-sidebar.png)

## Features

- right-side YouTube sidebar with `Timestamps` and `Summary`
- transcript-based generation for better timestamp accuracy
- configurable ChatGPT model for timestamp generation and optional GPT summaries
- summaries can use Apple Intelligence without ChatGPT, or the selected ChatGPT model after sign-in
- no API key or developer backend

## Project Structure

- macOS companion app target
- Safari Web Extension target and native bridge

## Extension Routing Notes

The Safari extension intentionally keeps the sidebar script scoped to supported YouTube video pages only:

- `content.js` should run on YouTube watch/live pages, where the timestamps and summary sidebar is mounted.
- `route-guard.js` can run on broader YouTube pages, but only to turn watch/live single-page navigations into full navigations so Safari injects `content.js`.
- Do not broaden `content.js` to all YouTube pages. Running the sidebar script on Shorts, feeds, subscriptions, or the homepage can disturb YouTube's own layout.

The `tests/js/manifest-routing.test.cjs` test protects this split.

## Setup

1. Use a Mac with macOS 26 or later.
2. In Xcode, set your Apple development team for both the app target and the extension target.
3. Run the macOS app.
4. Choose the generation model and summary engine in the app.
5. Optional: sign in with ChatGPT from the app for timestamps and GPT summaries.
6. Click `Open Safari Extension Settings` and enable the Safari extension.
7. Open a YouTube watch page that has captions or a transcript.

## Releasing

For Developer ID signing, notarization, and release packaging, see [RELEASING.md](RELEASING.md).

For release notes, see [CHANGELOG.md](CHANGELOG.md).

For the transcript-analysis design, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Limitations

- Requires macOS 26 or later.
- Timestamp generation requires the user to sign in with ChatGPT.
- Apple Intelligence summaries require Apple Intelligence to be available on the Mac.
- Videos without an available transcript cannot be summarized or timestamped.
- Active livestreams may not expose a stable transcript until the broadcast finishes.
- Generated timestamps and summaries can be incomplete or inaccurate.

## Troubleshooting

### Apple Intelligence is not available

- Confirm the Mac supports Apple Intelligence.
- Enable Apple Intelligence in macOS Settings.
- Wait for the on-device model to finish downloading if macOS says it is not ready yet.

### The Safari sidebar does not appear on YouTube

- Open the companion app and make sure the Safari extension is enabled.
- In Safari, verify the extension has access to YouTube.
- Refresh the YouTube watch page after enabling the extension.

### Timestamps or summary could not be generated

- Try the request again after refreshing the page.
- Confirm the video has captions or an available transcript.
- For timestamps, confirm ChatGPT sign-in completed in the companion app.
- For summaries without ChatGPT, confirm Apple Intelligence is available on the Mac.
- If the video is still live, wait until the stream finishes and YouTube exposes the transcript.

## Security Notes

- No API key or developer-operated backend is required.
- ChatGPT sign-in tokens are stored locally in the app group container so the app and extension can use the user's own signed-in account.
- Transcript text is sent to ChatGPT for timestamp generation and, if selected, summary generation.
- When Apple Intelligence is selected for summaries, transcript text is processed locally by the app extension on the user's Mac.
- The WebExtension requests host access only for YouTube pages.

## GitHub Checklist

Before publishing:

- do not commit local build artifacts, logs, or screenshots that reveal private browsing context
- confirm no credentials or API keys are added before publishing
