# Security

## Secrets

The app does not require bundled generation credentials, API keys, or a bundled secrets file.

Timestamp generation uses the user's own ChatGPT sign-in. The companion app stores ChatGPT sign-in tokens locally in the shared app group container so the app and extension can refresh the user's session.

Keep local build artifacts, logs, and screenshots that reveal private browsing context out of Git.

## Stored Data

- App settings are stored locally on the user's Mac.
- ChatGPT sign-in tokens are stored locally in the shared app group container.
- YouTube transcript text is sent to ChatGPT for timestamp generation.
- YouTube transcript text is sent to ChatGPT or processed locally with Apple Intelligence for summary generation, depending on the summary setting.

## Network Access

The Safari extension injects UI only on YouTube watch/live pages. The WebExtension requests host access only for YouTube transcript extraction. ChatGPT sign-in and generation requests are handled by the native app/extension layer.

## Reporting

If you find a security issue, please avoid posting private video URLs, transcripts, logs, or credentials in public issues.
