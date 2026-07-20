# Releasing

This project can be distributed outside the Mac App Store as a signed and notarized macOS app.

The same sandboxed build is used for Developer ID and App Store distribution. Optional Grok access uses an explicit browser OAuth sign-in; it does not bundle or register a helper.

## Prerequisites

Before running the release script, make sure this Mac has:

- Xcode 27 or the exact newer toolchain currently used by the project (the app targets macOS 26.4 and compiles macOS 27 Foundation Models code)
- an Apple Developer account for team `3PHWBNH53Z`
- a `Developer ID Application` certificate installed in Keychain Access
- the project set to sign with your Apple Developer team in Xcode
- a working `notarytool` profile if you want notarization

Apple requires `Developer ID` signing and notarization for direct macOS distribution:

- [Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)

## Development Safari Testing

Use the signed **Debug** configuration for all iterative Safari testing. This is the configuration produced by Xcode's normal Run action and it preserves the diagnostics needed while fixing the extension.

Do not alternate between Debug and Release builds on the same development account. Both host apps use the same production bundle identifiers, and Launch Services can register each app location independently; Safari may then show the extension twice and it becomes unclear which code is active. Keep only the normal Xcode DerivedData Debug host registered during development.

The Release configuration and `scripts/build-release.sh` are reserved for the final release/archive procedure below. A completed release artifact may remain on disk, but do not launch or register it while testing Debug. After producing a release on the development Mac, unregister that exported app before returning to Debug testing, or perform release validation in a separate macOS account/environment.

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
- `ZIP_PATH`

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

The release script creates this stable filename by default. The website points to GitHub's latest-release download URL, so do not rename it for public releases unless the website download URL changes too.

When notarization is enabled, a successful script exit guarantees that the ticket was stapled and validated and that the final app passed Gatekeeper assessment. The pre-notarization Gatekeeper result is informational because rejection is expected before a ticket exists.

After the tested candidate is approved, committed, tagged as `v1.1`, pushed, and verified, publish it with the public title `1.1` and the prepared notes:

```bash
gh release create v1.1 \
  build/release/artifacts/Timestamps-and-Summaries-for-YT.zip \
  --title "1.1" \
  --notes-file docs/github-release-1.1.md \
  --verify-tag \
  --latest
```

Do not run this command as part of candidate preparation. It creates the public release immediately.

## Final Checks

Before attaching a release build:

- confirm the Xcode app/extension `MARKETING_VERSION`, shared build number, and WebExtension manifest version all match the intended release
- run the JavaScript and Swift regression suites, `git diff --check`, property-list/manifest validation, and a Release build or archive
- open the exported app on a clean machine or user account
- test both a fresh install and an upgrade from the previous public build; verify Safari still shows the toolbar button and enables the extension without deleting/reinstalling it
- confirm Apple Intelligence is available on the test Mac only if it is selected for summaries
- confirm Apple Intelligence Summary follows the documented macOS 26 or macOS 27 path and does not expose Private Cloud Compute experiments
- confirm Safari can enable the extension
- confirm ChatGPT sign-in works from the companion app
- confirm Grok completes its normal Safari loopback sign-in and that the manual callback/code recovery path remains available
- confirm Grok 4.5 diagnostics report `reasoning effort: low` for both a generated Chapters request and a provider Summary request; Grok 4.3 should retain its provider default
- confirm the selected model and summary engine settings are shared with the Safari sidebar
- confirm disconnected providers are disabled in the provider picker and their status labels remain concise
- confirm the Safari toolbar popup contains only Settings
- confirm YouTube creator chapters and automatic Key moments use the compact Chapters view and show YouTube attribution
- on a video with native chapters and an available transcript, confirm Summary starts automatically even though provider timestamp generation is skipped
- confirm the companion-app chapter preference chooses the default source, and the inline footer can generate/view cached chapters and switch back to YouTube chapters
- confirm Chapters, Summary, Transcript, and Timeline keep correct content, pressed state, and inactive color through repeated tab switching
- from Chapters, press the native Close control without visiting Transcript first and confirm the panel stays closed; reopen with the video-description `Show transcript`, close again, and repeat the Close -> reopen -> Close cycle at least three times while confirming Chapters/Summary remain in the one integrated panel
- while Chapters is visible, press the video-description `Show transcript` action and confirm it selects Transcript without scrolling to, stacking, or later revealing a second transcript-only panel
- confirm chapter/summary/transcript copy controls respond on the first click and show the success animation
- confirm direct watch-page loads, homepage/feed-to-watch navigation, watch-to-watch navigation, watch-to-home navigation, live videos, and Shorts behavior
- confirm a destination video never displays the previous video's chapter rows, while outgoing tab chrome stays stable until navigation commits
- after starting generated chapters following a video or chapter-source transition, switch repeatedly between Summary and Chapters; confirm `Chapters...` remains busy until that exact request finishes
- during delayed native chapter discovery after watch-to-watch navigation, confirm the panel shows `Checking for YouTube chapters...` rather than the generic empty message and does not briefly duplicate the native Chapters chip
- confirm timestamps and summaries still come from the shared transcript-analysis pipeline documented in `ARCHITECTURE.md`
- while Chapters and Summary wait on the same transcript, confirm each generation log shows `transcript: waiting for shared transcript fetch` no more than once; ordinary caption-discovery progress should still advance normally
- confirm a page with neither a native `In this video` shell nor a usable transcript remains untouched with no error-only standalone sidebar; explicit generation inside an available native shell still reports an unavailable transcript clearly
- on a transcript-free video such as `RlLPXhP-Qxk`, confirm the extension does not open YouTube's structured `Description` engagement panel
- confirm the app bundle does not include local secrets or API keys
