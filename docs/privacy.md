---
title: Privacy Policy
---

# Privacy Policy

Last updated: April 23, 2026

This Privacy Policy explains how YouTube Timestamps and Summaries handles data when a user signs in with Google and uses the app's Gemini-powered features.

## Overview

YouTube Timestamps and Summaries is a Safari extension and macOS companion app that generates timestamps and summaries for YouTube videos.

The app uses Google OAuth so the signed-in user can call Google's Gemini service from the app.

## Information Processed By The App

When a user uses the app, the following information may be processed:

- the current YouTube video URL
- the selected prompt text used to request timestamps or summaries
- Google OAuth access and refresh tokens needed to call Gemini
- local settings such as selected Gemini model and saved prompts

## How Information Is Used

This information is used only to:

- authenticate the user with Google
- send Gemini requests requested by the user
- return timestamps or summaries inside the Safari extension
- remember local app preferences

## Local Storage

The app stores its settings locally on the user's Mac.

OAuth tokens are stored locally in the macOS Keychain.

Prompt settings and related app preferences are stored locally on the user's Mac.

## Data Shared With Google

When a user requests timestamps or a summary, the app sends the YouTube video URL and the selected prompt to Google's Gemini service.

Google OAuth is used only so the user can authorize the app to make those Gemini requests on the user's behalf.

The app is not intended to access Gmail, Drive, Calendar, Contacts, or similar Google account data.

## No Separate Developer Backend

The app does not use a separate developer-operated backend server for Gemini requests.

Gemini requests are sent from the user's local app directly to Google.

## Data Sharing

The app does not sell personal data.

The app does not intentionally share user data with third parties other than Google services required for authentication and Gemini generation.

## Data Retention

Local settings remain on the user's Mac until the user changes or removes them.

OAuth tokens remain stored locally until the user signs out, revokes access, or the token becomes invalid.

## Security

The app uses local system storage and the macOS Keychain to protect saved OAuth tokens.

No method of storage or transmission is completely secure, but reasonable steps are taken to keep tokens and local settings protected on the user's device.

## User Choices

Users can:

- sign out of the app
- revoke Google access from their Google account
- remove the app and its locally stored settings

## Contact

For support or privacy questions, please use the project issue tracker:

[https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/issues](https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/issues)
