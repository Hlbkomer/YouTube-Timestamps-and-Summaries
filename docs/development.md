# Development

## Build and run

1. Open `YouTube Timestamps and Summaries.xcodeproj` in Xcode.
2. Set your Apple development team for the app and extension targets.
3. Run the macOS app using the signed Debug configuration.
4. Enable the extension in Safari Settings and allow access to YouTube.
5. Connect a provider and choose Chapters and Summary models in the app. Apple Intelligence summaries are available on compatible Macs without a cloud connection.

Use signed Debug builds for routine development and Safari testing. Keep only the normal Debug host registered on the development account. See [AGENTS.md](../AGENTS.md) and [Development Safari Testing](../RELEASING.md#development-safari-testing) before building a Release package.

## Extension routing

The full `content.js` integration is scoped to YouTube watch/live pages. Do not broaden it to Shorts, feeds, subscriptions or the homepage.

The smaller `route-guard.js` runs on broader YouTube pages to turn watch/live transitions into full navigations so Safari injects the content script. It includes navigation-event and URL-change fallbacks.

During video navigation, the content script preserves the outgoing panel until the destination commits, then clears the previous results. Async generation is matched to its video and request identity. Details are in the [native panel notes](native-panel-integration.md); `tests/js/manifest-routing.test.cjs` protects the script scope.

## Technical documentation

- [Transcript and generation architecture](../ARCHITECTURE.md)
- [Native YouTube panel integration](native-panel-integration.md)
- [Provider model catalog](model-catalog.md)
- [Gemini API-key connection and generation](gemini-integration.md)
- [Grok OAuth, callback recovery and generation](grok-integration.md)
- [Apple Intelligence summaries by macOS version](macos27-summary.md)
- [Version 1.2 validation and publication record](release-1.2-readiness.md)
- [Signing, notarization and distribution](../RELEASING.md)

Provider credentials stay in macOS Keychain. Cloud generation sends the transcript directly to the selected provider; Apple Intelligence summaries run locally. See the [privacy policy](privacy.md) for the full data flow. Do not commit credentials, private browsing captures or local build artifacts.
