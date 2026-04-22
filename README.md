# YouTube Timestamps and Summaries

A macOS companion app plus Safari Web Extension that adds a YouTube sidebar for:

- automatic video timestamps
- on-demand video summaries

The extension uses Google OAuth and Gemini. The user signs in once in the companion app, and the extension uses that signed-in state while browsing YouTube.

## Features

- right-side YouTube sidebar with `Timestamps` and `Summary`
- customizable default prompts in the macOS companion app
- selectable Gemini models
- Google OAuth sign-in instead of pasted API keys
- local-only secrets file for Google Cloud configuration

## Project Structure

- `YouTube Timestamps and Summaries/`
  macOS companion app
- `YouTube Timestamps and Summaries Extension/`
  Safari Web Extension and native bridge

## Setup

1. Create a Google Cloud project.
2. Enable `Google Generative Language API`.
3. Create a `Desktop app` OAuth client.
4. Copy `YouTube Timestamps and Summaries/LocalSecrets.template.plist` to `YouTube Timestamps and Summaries/LocalSecrets.plist`.
5. Fill in:
   - `clientID`
   - `clientSecret`
   - `projectID`
6. In Xcode, set your Apple development team for both the app target and the extension target.
7. Run the macOS app, sign in with Google, enable the Safari extension, and open a YouTube watch page.

## Security Notes

- `LocalSecrets.plist` is gitignored and should never be committed.
- Google OAuth tokens are stored locally on the machine and shared between the app and extension using the macOS Keychain.
- Prompt text and the current YouTube URL are sent to Gemini.
- The extension only requests host access for YouTube domains.

## GitHub Checklist

Before publishing:

- confirm `YouTube Timestamps and Summaries/LocalSecrets.plist` is not tracked
- do not commit downloaded Google OAuth JSON files
- do not commit logs containing live access tokens or refresh tokens
- rotate any token that was accidentally pasted into chat, terminal, or logs
