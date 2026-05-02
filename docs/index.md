---
title: Timestamps & Summaries for YT
---

# Timestamps & Summaries for YT

Timestamps & Summaries for YT is a Safari extension and macOS companion app that helps people generate:

- chronological timestamps for YouTube videos
- short summaries for YouTube videos

The extension adds a right-side sidebar on supported YouTube video pages. It reads the available YouTube transcript, creates summaries with Apple Intelligence on the Mac or the user's selected signed-in ChatGPT model, and creates timestamps when ChatGPT is connected. No API key or developer backend is required.

![Companion app screenshot](readme-assets/companion-app.png)

![YouTube sidebar screenshot](readme-assets/youtube-sidebar.png)

## How It Works

1. The Safari extension detects a supported YouTube watch or live page.
2. The extension fetches the available YouTube transcript for that video.
3. Apple Intelligence can create summaries locally without ChatGPT sign-in.
4. If ChatGPT is connected, the selected ChatGPT model creates timestamp candidates from the transcript.
5. The selected ChatGPT model or Apple Intelligence creates the summary, depending on the user's setting.
6. The extension validates timestamp candidates against real transcript cue times before showing clickable timestamps.

## Requirements

- macOS 26 or later
- ChatGPT sign-in only for timestamps and optional GPT summaries
- Apple Intelligence enabled and compatible Apple silicon hardware only if Apple Intelligence is selected for summaries
- a YouTube video with captions or an available transcript

## Data Flow

- The extension reads the current YouTube video URL to identify supported video pages.
- Transcript text is sent to ChatGPT for timestamp generation.
- Transcript text is sent to ChatGPT or processed locally with Apple Intelligence for summary generation, depending on the summary setting.
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
