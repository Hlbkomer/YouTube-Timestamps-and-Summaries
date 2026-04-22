# Security

## Secrets

Keep the following values out of Git:

- Google OAuth client secret
- access tokens
- refresh tokens
- downloaded Google OAuth credential JSON files

Use `YouTube Timestamps and Summaries/LocalSecrets.plist` for local configuration. The repo includes a template file only.

## Stored Data

- Google OAuth configuration is stored locally on the machine.
- OAuth tokens are stored in the macOS Keychain for local use by the companion app and Safari extension.
- Prompt configuration and selected model are stored locally in shared app preferences.

## Network Access

This project sends requests to:

- Google OAuth endpoints
- Google Gemini API endpoints

The Safari extension injects UI only on YouTube domains declared in the extension manifest.

## Reporting

If you find a security issue, please avoid posting live credentials or tokens in public issues.
