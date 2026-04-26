---
title: Timestamps & Summaries for YT
---

# Timestamps & Summaries for YT

Timestamps & Summaries for YT is a Safari extension and macOS companion app that helps people generate:

- chronological timestamps for YouTube videos
- short summaries for YouTube videos

The extension adds a right-side sidebar on supported YouTube video pages. It reads the available YouTube transcript, uses the user's selected signed-in ChatGPT model for timestamps, and creates summaries with either that model or Apple Intelligence on the Mac. A ChatGPT account is required.

## Download

Download the signed and notarized macOS app:

[Download Timestamps & Summaries for YT v1.0.1](https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/releases/download/v1.0.1/Timestamps-and-Summaries-for-YT-v1.0.1.zip)

After unzipping, move the app to `Applications`, open it, then enable the Safari extension from the companion app.

![Companion app screenshot](readme-assets/companion-app.png)

![YouTube sidebar screenshot](readme-assets/youtube-sidebar.png)

## How It Works

1. The Safari extension detects a supported YouTube watch or live page.
2. The extension fetches the available YouTube transcript for that video.
3. If needed, the companion app asks the user to sign in with ChatGPT.
4. The selected ChatGPT model creates timestamp candidates from the transcript.
5. The selected ChatGPT model or Apple Intelligence creates the summary.
6. The extension validates timestamp candidates against real transcript cue times before showing clickable timestamps.

## Requirements

- macOS 26 or later
- ChatGPT sign-in
- Apple Intelligence enabled and compatible Apple silicon hardware only if Apple Intelligence is selected for summaries
- a YouTube video with captions or an available transcript

## Data Flow

- The extension reads the current YouTube video URL to identify supported video pages.
- Transcript text is sent to ChatGPT for timestamp generation.
- Transcript text is sent to ChatGPT or processed locally with Apple Intelligence for summary generation, depending on the summary setting.
- The app does not require API keys or a developer-operated backend for generation.

## Support

Project repository:

[https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries](https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries)

Issue tracker:

[https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/issues](https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/issues)

## Policies

- [Privacy Policy](privacy.html)
- [Terms of Service](terms.html)
