# macOS 27 On-Device Summary Notes

## Current Design

The sidebar has one `Summary` tab. When Apple Intelligence is selected as the summary engine, the native extension chooses its local implementation at runtime:

- macOS 26 keeps the established character-based chunking path unchanged.
- macOS 27 uses the on-device `SystemLanguageModel` with token-aware chunk planning, model context size, prompt token counting, and request prewarming.

Selected-provider summaries are not affected by this switch. Grok and ChatGPT summaries continue to use the model selected in the companion app on all supported macOS versions.

Successful Apple summaries on macOS 27 display the active engine and elapsed time in the result caption, for example: “Generated with Apple Intelligence in 150 seconds.” Selected-provider timestamps and summaries use the same caption area with their model name, for example: “Generated with Grok 4.3 in 8 seconds.”

## Why T27 and S27 Were Removed

The former `T27` and `S27` experiments instantiated Apple's `PrivateCloudComputeLanguageModel`. The Debug extension does not have the managed `com.apple.developer.private-cloud-compute` entitlement.

On the macOS 27 beta test system, starting either experiment produced a Safari-extension crash report with `EXC_BREAKPOINT` / `SIGTRAP` inside `FoundationModels` before the app's Swift error handling could return a useful failure. The normal Apple Intelligence Summary path and provider paths continued to work.

This is a direct reason to avoid constructing the PCC model until entitlement access is approved. It does not establish every internal cause of the Foundation Models assertion.

## Private Cloud Compute Is Deferred

PCC is not reachable from the sidebar, background generation routing, or native status requests. The prior PCC implementation remains dormant in source for future work after Apple approves the managed entitlement and new provisioning profiles can include it.

Apple documents that PCC requires eligibility and the managed entitlement. See [Adding server-side intelligence with Private Cloud Compute](https://developer.apple.com/documentation/FoundationModels/adding-server-side-intelligence-with-private-cloud-compute).

## Testing Checklist

### macOS 26

1. Choose Apple Intelligence as the summary engine.
2. Open a captioned YouTube video.
3. Confirm the ordinary Summary tab generates successfully without a macOS 27 caption.

### macOS 27

1. Choose Apple Intelligence as the summary engine.
2. Open a captioned YouTube video.
3. Confirm the ordinary Summary tab generates successfully.
4. Confirm the result includes the macOS 27 on-device caption with elapsed time.
5. Confirm the sidebar contains only Timestamps and Summary, and the extension process does not crash.

### Provider Regression

1. Select Grok or ChatGPT for the summary engine.
2. Confirm Summary still uses that provider, shows the provider/model caption with elapsed time, and does not show the Apple Intelligence macOS 27 caption.
