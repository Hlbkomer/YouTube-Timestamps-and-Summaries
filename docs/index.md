---
title: Video Timestamps and Summaries for YouTube
---

# Video Timestamps and Summaries for YouTube

Video Timestamps and Summaries for YouTube is a Safari extension and macOS companion app that helps people generate:

- chronological timestamps for YouTube videos
- short summaries for YouTube videos

The extension adds a right-side sidebar on supported YouTube video pages. The companion app handles Google sign-in and shares that signed-in state with the extension.

![Companion app screenshot](readme-assets/companion-app.png)

![YouTube sidebar screenshot](readme-assets/youtube-sidebar.png)

## How It Works

1. The user signs in with Google in the macOS companion app.
2. The Safari extension detects the current YouTube video URL.
3. The app sends the YouTube URL and the selected prompt to Google's Gemini service.
4. Gemini returns text that the extension displays as timestamps or a summary.

## What The App Uses Google Authorization For

Google authorization is used only so the app can call Gemini on behalf of the signed-in user.

The app is not designed to access Gmail, Google Drive, Calendar, Contacts, or other personal Google account content.

## Data Flow

- The current YouTube video URL is sent to Gemini when the user requests a summary or when timestamps are generated.
- The selected Gemini prompt is sent to Gemini as part of the request.
- OAuth tokens are stored locally on the user's Mac so the user does not have to sign in every time.
- There is no separate developer-operated backend server for these Gemini requests. Requests are sent from the local app to Google.

## Support

Project repository:

[https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries](https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries)

Issue tracker:

[https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/issues](https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/issues)

## Policies

- [Privacy Policy](privacy.html)
- [Terms of Service](terms.html)
