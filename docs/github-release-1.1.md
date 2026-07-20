# Timestamps & Summaries for YT 1.1

Version 1.1 makes the YouTube experience substantially smoother and brings chapters, summaries, transcripts, and timelines together in one consistent panel.

## Highlights

- Integrates `Chapters` and `Summary` directly into YouTube's native `In this video` panel beside `Transcript` and `Timeline`.
- Presents creator chapters, automatic YouTube `Key moments`, and transcript-generated chapters in the same compact format.
- Adds a subtle inline action for switching between YouTube chapters and generated chapters when both are available.
- Keeps Summary generation independent, so a video with YouTube chapters still receives an automatic summary when a transcript is available.
- Makes native tab switching, Copy, Close, `Show transcript`, repeated close/reopen cycles, and YouTube video-to-video navigation reliable.
- Avoids showing an error-only fallback panel when neither an `In this video` shell nor a usable transcript is available.

## Models and accounts

- Grok 4.5 is now the default Grok model and uses low reasoning effort for faster Chapters and Summary generation. Grok 4.3 remains available as the fastest fallback.
- GPT-5.6 Terra is now the default ChatGPT model for new or missing settings. Existing valid model selections are preserved during upgrade.
- Connected model catalogs are sorted from newer models to older models.
- Grok's normal Safari authorization callback is more reliable; manual callback completion remains available as a recovery option.
- ChatGPT and Grok credentials now use the shared macOS data-protection Keychain.
- Disconnected providers remain visible but cannot be selected until they are connected.

## Other improvements

- Adds active-chapter highlighting during playback and seeking.
- Adds Copy controls with visible success feedback for chapters, summaries, and transcripts.
- Improves summary formatting, panel sizing and scrolling, generating-state labels, chapter-source attribution, and light/dark tab colors.
- Hardens single-page navigation so results from one video cannot appear on the next video and outgoing panel controls do not flicker before navigation commits.
- Retains Apple Intelligence summaries, using the established local path on macOS 26 and the newer on-device token-aware path on macOS 27.

## Install or update

1. Download `Timestamps-and-Summaries-for-YT.zip` below.
2. Unzip it and move **Timestamps & Summaries for YT** to `Applications`, replacing the previous version when updating.
3. Open the app once, then enable or confirm the extension in Safari Settings.

The update is designed to preserve valid settings and migrate complete provider credentials. If ChatGPT or Grok appears disconnected after updating, reconnect that provider once in the companion app.

Requires macOS 26.4 or later.

For the complete technical change history, see the [changelog](https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/blob/main/CHANGELOG.md).
