---
title: Timestamps & Summaries for YT
---

# Timestamps & Summaries for YT

Timestamps & Summaries for YT is a Safari extension and macOS companion app that helps people generate:

- chronological timestamps for YouTube videos
- short summaries for YouTube videos

The extension adds a right-side sidebar on supported YouTube video pages. It reads the available YouTube transcript, creates summaries with Apple Intelligence on the Mac or the selected provider, and creates timestamps when the selected provider is ready. No API key or developer backend is required.

![Companion app screenshot](readme-assets/companion-app.png)

![YouTube sidebar screenshot](readme-assets/youtube-sidebar.png)

## How It Works

1. The Safari extension detects a supported YouTube watch or live page.
2. The extension fetches the available YouTube transcript for that video.
3. Apple Intelligence can create summaries locally without a provider.
4. If the selected provider is ready, it creates timestamp candidates from the transcript.
5. The selected provider or Apple Intelligence creates the summary, depending on the user's setting.
6. The extension validates timestamp candidates against real transcript cue times before showing clickable timestamps.

Successful results include a small caption with the active model or Apple Intelligence plus elapsed generation time, for example `Generated with Grok 4.3 in 8 seconds.` or `Generated with Apple Intelligence in 150 seconds.` The tab labels remain simply `Timestamps` and `Summary`.

## Requirements

- macOS 26 or later
- optional ChatGPT/Codex or Grok sign-in for timestamps and model-powered summaries.
- Apple Intelligence enabled and compatible Apple silicon hardware only if Apple Intelligence is selected for summaries
- a YouTube video with captions or an available transcript

## Data Flow

- The extension reads the current YouTube video URL to identify supported video pages.
- Transcript text is sent to the selected provider for timestamp generation.
- Transcript text is sent to the selected provider or processed locally with Apple Intelligence for summary generation, depending on the summary setting.
- When Apple Intelligence is selected, the single Summary tab uses the established path on macOS 26 and the on-device token-aware path on macOS 27. Private Cloud Compute is deferred while its managed entitlement is pending.
- Grok uses an explicit browser OAuth sign-in, then the sandboxed extension sends direct HTTPS requests to xAI. It does not use a command-line client or a helper process. If Safari cannot reach the temporary local callback page after approval, the companion app can complete that same sign-in from a pasted callback URL or one-time authorization code.
- The app does not require API keys or a developer-operated backend for generation.

## Download And Support

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin: 1.5rem 0;">
  <section style="border: 1px solid #d8dee4; border-radius: 12px; padding: 1rem;">
    <h3 style="margin-top: 0;">Download</h3>
    <p>Download the signed and notarized macOS app.</p>
    <p>
      <a href="https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/releases/latest/download/Timestamps-and-Summaries-for-YT.zip">Download Timestamps &amp; Summaries for YT</a>
    </p>
    <p>After unzipping, move the app to <code>Applications</code>, open it and enable the Safari extension.</p>
  </section>

  <section style="border: 1px solid #d8dee4; border-radius: 12px; padding: 1rem;">
    <h3 style="margin-top: 0;">Support</h3>
    <p>Need help, found a bug, or want to follow the project?</p>
    <p>
      <a href="https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries">Project repository</a>
    </p>
    <p>
      <a href="https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/issues">Issue tracker</a>
    </p>
  </section>
</div>

## Policies

- [Privacy Policy](privacy.html)
- [Terms of Service](terms.html)
