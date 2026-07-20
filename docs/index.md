---
title: Timestamps & Summaries for YT
---

# Timestamps & Summaries for YT

Timestamps & Summaries for YT is a Safari extension and macOS companion app that helps people generate:

- chronological timestamps for YouTube videos
- short summaries for YouTube videos

The extension integrates with YouTube's native `In this video` panel when available, with a standalone sidebar fallback only after a usable transcript is confirmed. If neither the native shell nor a transcript exists, it leaves the page untouched. It creates summaries with Apple Intelligence on the Mac or the selected provider, and creates chapters/timestamps when the selected provider is ready. No API key or developer backend is required.

![Companion app screenshot](readme-assets/companion-app.png)

![YouTube integration screenshot](readme-assets/youtube-sidebar.png)

## How It Works

1. The Safari extension detects a supported YouTube watch or live page.
2. The extension fetches the available YouTube transcript for that video.
3. Apple Intelligence can create summaries locally without a provider.
4. If the selected provider is ready, it creates timestamp candidates from the transcript.
5. The selected provider or Apple Intelligence creates the summary, depending on the user's setting.
6. The extension validates timestamp candidates against real transcript cue times before showing clickable generated chapters.

When YouTube already provides creator chapters or automatic `Key moments`, the extension imports them into the same compact Chapters list and skips generated timestamp creation for that video by default. The companion app can switch the default to always generate extension chapters. The Chapters footer identifies the active source and offers `Generate chapters from transcript` before a matching generated result exists, `View generated chapters` once it is cached, or `View YouTube chapters` when switching back. The Safari toolbar popup contains only Settings; current-video source switching lives beside the result so page state has one owner. The currently playing chapter is highlighted during playback regardless of source.

Imported chapters resolve only the Chapters result: Summary still starts automatically whenever its configured engine and the shared transcript are available. Lazy native chapter discovery renders `Checking for YouTube chapters...` rather than a temporary empty result. If both the native `In this video` shell and a usable transcript are absent, the page is left unchanged; when only the shell is absent, a confirmed transcript can still use the standalone fallback.

During YouTube watch-to-watch navigation, the extension keeps the outgoing tab chrome stable until the destination commits, then clears the previous video's rows before rendering the new result. Async generation is matched by video key and monotonic generation ID, preventing stale work from changing the destination result or clearing its `Chapters...` busy state during tab switching. When navigation commits to the homepage or another non-video page, the integration is removed cleanly. A lightweight route guard on feeds/homepage forces watch/live links through a real navigation so Safari reliably injects the full video-page integration, while Shorts and other non-video pages remain untouched.

Successful results include a small caption with the active model or Apple Intelligence plus elapsed generation time. Generated chapters use `Chapters generated with Grok 4.5 in 8 seconds.`; summaries use `Generated with Grok 4.5 in 8 seconds.` or `Generated with Apple Intelligence in 150 seconds.` In the native panel, generated timestamps are presented as `Chapters`; in the standalone fallback they remain `Timestamps`.

## Requirements

- macOS 26.4 or later
- optional ChatGPT/Codex or Grok sign-in for timestamps and model-powered summaries.
- Apple Intelligence enabled and compatible Apple silicon hardware only if Apple Intelligence is selected for summaries
- captions or an available transcript for generated results; imported YouTube chapters can display without one

## Data Flow

- The extension reads the current YouTube video URL to identify supported video pages.
- Transcript text is sent to the selected provider for timestamp generation.
- Transcript text is sent to the selected provider or processed locally with Apple Intelligence for summary generation, depending on the summary setting.
- When Apple Intelligence is selected, the single Summary tab uses the established path on macOS 26 and the on-device token-aware path on macOS 27. Private Cloud Compute is deferred while its managed entitlement is pending.
- Grok uses an explicit browser OAuth sign-in, then the sandboxed extension sends direct HTTPS requests to xAI. It does not use a command-line client or a helper process. If Safari cannot reach the temporary local callback page after approval, the companion app can complete that same sign-in from a pasted callback URL or one-time authorization code.
- The app does not require API keys or a developer-operated backend for generation.

The native YouTube panel implementation notes are documented in [native-panel-integration.md](native-panel-integration.md).

The Grok and ChatGPT/Codex picker catalog behavior, model exclusions, and remote catalog maintenance process are documented in [model-catalog.md](model-catalog.md).

The repository-wide maintenance findings, justified Safari workarounds, and recommended cleanup order are documented in [code-complexity-review.md](code-complexity-review.md).

The current version 1.1 behavior audit, automated validation, and remaining manual release gates are documented in [release-1.1-readiness.md](release-1.1-readiness.md).

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
