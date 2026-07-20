---
title: Privacy Policy
---

# Privacy Policy

Last updated: July 20, 2026

This Privacy Policy explains how Timestamps & Summaries for YT handles data when generating timestamps and summaries.

## Overview

Timestamps & Summaries for YT is a Safari extension and macOS companion app that generates timestamps and summaries for YouTube videos.

The app can generate summaries locally with Apple Intelligence without a cloud provider. ChatGPT/Codex and Grok sign-in are optional and can be used for timestamp generation or model summaries. The app does not require API keys or a developer-operated backend.

## Information Processed By The App

When a user uses the app, the following information may be processed:

- the current YouTube video URL
- the available transcript or captions for the current YouTube video
- ChatGPT sign-in tokens after the user signs in
- Grok OAuth tokens after the user signs in
- local app settings
- a small model catalog fetched from this project's GitHub repository

## How Information Is Used

This information is used only to:

- return timestamps and summaries inside the Safari extension
- keep the user's ChatGPT sign-in active for generation
- keep the user's Grok sign-in active for generation
- remember local app preferences
- keep the provider model picker current

## Local Storage

The app stores its settings locally on the user's Mac.

ChatGPT and Grok access and refresh tokens are stored locally in the macOS data-protection Keychain under a shared access group so the companion app and Safari extension can use the same signed-in sessions. The tokens are not synchronized through iCloud. Non-secret token expiry metadata and app settings remain in the shared app-group preferences. Users can remove provider tokens by signing out in the companion app or removing the app's local data. During a Grok sign-in, the temporary OAuth state, PKCE verifier, callback URL, and one-time authorization code are used only to finish that sign-in and are not stored with the tokens.

When upgrading from an older release, existing provider tokens are copied from shared preferences to Keychain on first use. The old preference values are removed only after both access and refresh tokens are safely present in Keychain.

## No Separate Developer Backend

The app does not use a separate developer-operated backend server for generation requests.

## Data Sharing

The app does not sell personal data.

The app does not intentionally share user data with a developer-operated server. The companion app may fetch a static model catalog JSON file from this project's GitHub repository; that request does not include YouTube transcripts, video URLs, or provider sign-in tokens.

For timestamp generation, transcript text is sent through the selected provider: the user's signed-in ChatGPT or Grok account. For summary generation, transcript text is sent to the selected provider or processed locally with Apple Intelligence on the user's Mac, depending on the user's app setting.

## Data Retention

Local settings remain on the user's Mac until the user changes or removes them.

## Security

The app uses local preferences for saved app settings and macOS Keychain for ChatGPT and Grok access/refresh tokens. During a person-initiated Grok sign-in, the companion app temporarily receives the browser callback on loopback and closes it immediately afterward. If Safari cannot reach that loopback callback, the person may paste the callback URL or one-time authorization code into the app to finish the same short-lived sign-in; that pasted value is not saved.

No method of storage is completely secure, but reasonable steps are taken to keep local settings protected on the user's device.

## User Choices

Users can:

- remove the app and its locally stored settings
- sign out in the companion app to clear ChatGPT or Grok sign-in tokens

## Contact

For support or privacy questions, please use the project issue tracker:

[https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/issues](https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/issues)
