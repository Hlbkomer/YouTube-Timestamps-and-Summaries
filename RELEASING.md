# Releasing

This project can be distributed outside the Mac App Store as a signed and notarized macOS app.

## Prerequisites

Before running the release script, make sure this Mac has:

- Xcode 14 or later
- an Apple Developer account for team `3PHWBNH53Z`
- a `Developer ID Application` certificate installed in Keychain Access
- the project set to sign with your Apple Developer team in Xcode
- a working `notarytool` profile if you want notarization

Apple requires `Developer ID` signing and notarization for direct macOS distribution:

- [Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)

## One-Time Notarytool Setup

If you have not created a notary profile on this Mac yet, store one in the keychain first:

```bash
xcrun notarytool store-credentials "yts-notary" \
  --apple-id "YOUR_APPLE_ID" \
  --team-id "3PHWBNH53Z" \
  --password "YOUR_APP_SPECIFIC_PASSWORD"
```

You can also use an App Store Connect API key instead of Apple ID credentials if you prefer.

## Build A Developer ID Release

Before building a consumer release, confirm the app builds without any local secrets, bundled generation credentials, or API keys. Generation should use the user's ChatGPT sign-in, optional Apple Intelligence summaries, and the YouTube transcript.

To create a signed release archive and exported app bundle:

```bash
./scripts/build-release.sh
```

This produces:

- an `.xcarchive`
- an exported `.app`
- a zipped app artifact ready for release uploads

Default output location:

```text
build/release/
```

## Build And Notarize

To build, notarize, staple, and regenerate the release zip:

```bash
NOTARIZE=1 NOTARY_PROFILE=yts-notary ./scripts/build-release.sh
```

After notarization, the script staples the exported `.app` and rebuilds the `.zip` artifact.

## Useful Overrides

You can override the defaults with environment variables:

- `TEAM_ID`
- `CONFIGURATION`
- `BUILD_ROOT`
- `NOTARIZE`
- `NOTARY_PROFILE`

Example:

```bash
TEAM_ID=3PHWBNH53Z \
NOTARIZE=1 \
NOTARY_PROFILE=yts-notary \
./scripts/build-release.sh
```

## What To Upload

For a simple first public release, upload the notarized zip artifact to GitHub Releases.

Recommended artifact:

- `build/release/artifacts/Timestamps-and-Summaries-for-YT.zip`

The release script currently creates a ZIP using the Xcode scheme name. For public GitHub uploads, copy or rename the notarized ZIP to the stable artifact name before uploading it. The website points to GitHub's latest-release download URL, so keeping this asset name stable prevents the homepage link from going stale.

## Final Checks

Before attaching a release build:

- open the exported app on a clean machine or user account
- confirm Apple Intelligence is available on the test Mac only if it is selected for summaries
- confirm Safari can enable the extension
- confirm ChatGPT sign-in works from the companion app
- confirm the selected model and summary engine settings are shared with the Safari sidebar
- confirm normal videos, live videos, and Shorts navigation all behave correctly
- confirm timestamps and summaries still come from the shared transcript-analysis pipeline documented in `ARCHITECTURE.md`
- confirm videos without transcripts show a clear error
- confirm the app bundle does not include local secrets or API keys
