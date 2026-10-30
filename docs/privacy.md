---
title: Privacy Policy
---

# Privacy Policy

Last updated: October 18, 2026

This Privacy Policy explains how Timestamps & Summaries for YT handles data when generating timestamps and summaries.

## Overview

Timestamps & Summaries for YT is a Safari extension and macOS companion app that generates timestamps and summaries for YouTube videos.

The app can generate summaries locally with Apple Intelligence without a cloud provider. ChatGPT/Codex and Grok sign-in, and Google Gemini API-key connections, are optional and can be used for timestamp generation or model summaries. Only Gemini requires a user-supplied API key. The app does not use a developer-operated backend.

## Information Processed By The App

When a user uses the app, the following information may be processed:

- the current YouTube video URL and video identifier
- the available transcript or captions for the current YouTube video
- bounded video context prepared at the local summary boundary: title, channel name, cleaned description, duration, and caption source
- ChatGPT sign-in tokens after the user signs in
- Grok OAuth tokens after the user signs in
- a user-supplied Google Gemini API key after the user connects it
- local app settings
- a small model catalog fetched from this project's GitHub repository

## How Information Is Used

This information is used only to:

- return timestamps and summaries inside the Safari extension
- keep summary work associated with the correct video and support locally tested grounding improvements
- keep the user's ChatGPT sign-in active for generation
- keep the user's Grok sign-in active for generation
- authenticate Gemini requests against the user's Google API project
- remember local app preferences
- keep the provider model picker current

## Local Storage

The app stores its settings locally on the user's Mac.

ChatGPT and Grok access and refresh tokens are stored locally in the macOS data-protection Keychain under a shared access group so the companion app and Safari extension can use the same signed-in sessions. The tokens are not synchronized through iCloud. Non-secret token expiry metadata and app settings remain in the shared app-group preferences. Users can remove provider tokens by signing out in the companion app or removing the app's local data. During a Grok sign-in, the temporary OAuth state, PKCE verifier, callback URL, and one-time authorization code are used only to finish that sign-in and are not stored with the tokens.

When upgrading from an older release, existing provider tokens are copied from shared preferences to Keychain on first use. The old preference values are removed only after both access and refresh tokens are safely present in Keychain.

Gemini API keys are stored in the same local data-protection Keychain access group under a distinct service and are not synchronized through iCloud. A candidate key is sent to Google's Gemini API to validate model access before saving. The input is cleared after submission; the saved key is never included in rendered app state, WebExtension messages, page scripts, diagnostic output, or request URLs. **Remove API Key** in the companion app deletes the saved key.

## No Separate Developer Backend

The app does not use a separate developer-operated backend server for generation requests.

## Data Sharing

The app does not sell personal data or use data for advertising or cross-app tracking.

The app does not intentionally share user data with a developer-operated server. The companion app may fetch a static model catalog JSON file from this project's GitHub repository; that request does not include YouTube transcripts, video URLs, or provider sign-in tokens.

For timestamp generation, timestamped transcript text is sent through the selected provider: the user's signed-in ChatGPT or Grok account, or Google Gemini authenticated with the user's API key. For provider summary generation, the current production prompt sends the timestamp-stripped transcript to the selected provider. These requests are associated with the user's provider account so that the provider can authenticate the request and return the result. The app prepares bounded title, channel, cleaned-description, duration, and caption-source context at its local summary boundary, but the production provider prompt does not currently include that metadata.

ChatGPT/Codex and Grok requests ask the provider not to store a reusable response object. Gemini uses a single-turn content-generation request without creating an app-managed conversation; Google's project settings and API terms govern its logging and data handling. This does not override the provider's security, abuse-monitoring, legal, or account-level retention practices. Provider handling is governed by the user's account, settings, and the provider's current terms and privacy documentation:

- [OpenAI data use and controls](https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/)
- [xAI API security and retention](https://docs.x.ai/developers/faq/security)
- [Google Gemini API terms and data handling](https://ai.google.dev/gemini-api/terms)

When Apple Intelligence is selected, summary generation stays on the user's Mac and does not send the transcript or video context to a cloud provider for that summary. Showing chapters already supplied by YouTube also does not send transcript text to ChatGPT, Grok, or Gemini.

## Data Retention

Local settings remain on the user's Mac until the user changes or removes them.

The developer does not operate a server that receives or stores transcripts, video URLs, generated results, or provider credentials. ChatGPT, Grok, and Google may retain cloud request data under their own service terms, security requirements, and the user's account settings. The app cannot delete provider-side records directly. Users should use the provider's own data controls or privacy request process for provider-side access, deletion, or retention choices.

## Security

The app uses local preferences for saved app settings and macOS Keychain for ChatGPT and Grok access/refresh tokens and Gemini API keys. During a person-initiated Grok sign-in, the companion app temporarily receives the browser callback on loopback and closes it immediately afterward. If Safari cannot reach that loopback callback, the person may paste the callback URL or one-time authorization code into the app to finish the same short-lived sign-in; that pasted value is not saved.

No method of storage is completely secure, but reasonable steps are taken to keep local settings protected on the user's device.

## User Choices

Users can:

- use YouTube-provided chapters without connecting a cloud provider
- select Apple Intelligence for on-device summaries on a compatible Mac
- remove the app and its locally stored settings
- sign out in the companion app to clear ChatGPT or Grok sign-in tokens, or choose Remove API Key to clear the Gemini key
- review or change provider-side data controls in their ChatGPT, Grok, or Google account/project

## Contact

For support or privacy questions, please use the project issue tracker:

[https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/issues](https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/issues)
