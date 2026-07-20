# Security

## Secrets

The app does not require bundled generation credentials, API keys, or a bundled secrets file.

Timestamp generation uses the user's own ChatGPT or Grok sign-in. The companion app stores provider access and refresh tokens in the local macOS data-protection Keychain under a shared access group so the app and extension can refresh the user's session without legacy login-Keychain ACL prompts.

Keep local build artifacts, logs, and screenshots that reveal private browsing context out of Git.

## Stored Data

- App settings are stored locally on the user's Mac.
- ChatGPT and Grok access/refresh tokens are stored in the local data-protection Keychain under the shared access group; token expiry metadata and ordinary app settings remain in the shared app-group preferences.
- Existing tokens from older versions are copied to Keychain on first use and removed from preferences only after both credentials were saved successfully.
- Signing out removes the provider's Keychain credentials and any legacy preference values.
- YouTube transcript text is sent to the selected provider for timestamp generation.
- YouTube transcript text is sent to the selected provider or processed locally with Apple Intelligence for summary generation, depending on the summary setting.

### Development-build Keychain cleanup

An unreleased development build briefly used the legacy file-based macOS Keychain because its `SecItem` queries omitted `kSecUseDataProtectionKeychain`. In that implementation the declared access group did not govern app/extension sharing, so macOS could request the login-Keychain password for services named `Matuko.YouTube-Timestamps-and-Summaries.codex` or `Matuko.YouTube-Timestamps-and-Summaries.xai`. Apple documents the two macOS implementations and recommends the data-protection Keychain in [TN3137: On Mac keychain APIs and implementations](https://developer.apple.com/documentation/Technotes/tn3137-on-mac-keychains).

Corrected builds deliberately do not read those legacy items, because reading them is what invokes the ACL prompt. After moving from the affected build, deny the prompt, rebuild and sign in to the provider once. The new credentials go to the local data-protection Keychain. Any stale item may be deleted from the `login` keychain in Keychain Access; do not delete the replacement item from the data-protection section, which Keychain Access labels `Local Items` or `iCloud Keychain` depending on the Mac's settings.

## Network Access

The Safari extension injects UI only on YouTube watch/live pages. The WebExtension requests host access only for YouTube transcript extraction. ChatGPT sign-in and generation requests are handled by the native app/extension layer.

## Reporting

If you find a security issue, please avoid posting private video URLs, transcripts, logs, or credentials in public issues.
