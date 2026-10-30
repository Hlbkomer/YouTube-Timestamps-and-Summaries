# GPT-6 Astra Support: 2026-09-19

> **Superseded:** GPT-6 Astra support was later removed. The current ChatGPT/Codex picker offers only **GPT-6.1 Sol** and **GPT-6 Luna** (default); GPT-6 Astra and the GPT-5.x choices are no longer listed. This document is retained as a historical record of the 2026-09-19 validation only, and its Astra instructions no longer describe the app. See [model-catalog.md](model-catalog.md) for the current lineup.

Version 1.2 remains unpublished. This follow-up adds a model choice and tests compatibility; it does not authorize commit, tagging, pushing, website deployment, or release packaging.

## Current Usage And Target Mapping

| Site / workload | Endpoint and prompt | Reasoning / role | Change |
| --- | --- | --- | --- |
| ChatGPT Chapters | Codex Responses backend; timestamped transcript and existing chapter rules | Luna: explicit low; Sol/Terra: provider default | Add optional `gpt-6-astra`, provider default |
| ChatGPT Summary | Same backend; shared production Prompt 1 and timestamp-stripped transcript | Same model policy; Summary selection independent of Chapters | Add optional `gpt-6-astra`, provider default |
| Native settings, companion pickers, remote catalog | Built-in fallbacks plus repository catalog | Luna stays the fresh/reset default | Add Astra first by version; preserve valid saved choices |
| Grok and Apple Intelligence | Existing provider and local pipelines | Unchanged | No migration |
| Historical provider comparisons | Fixed Terra/Grok model roles and prompt versions | Historical baselines | Preserve; separate opt-in Astra smoke test |

Official [GPT-6 Astra migration guidance](https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra.md#migration-quickstart) confirms the explicit model ID and warns that `none` reasoning and sampling parameters are unsupported. Public API availability alone does not prove availability through this app's separate ChatGPT/Codex OAuth endpoint; a live check is required.

## Changes And Compatibility Gates

- Add `chatGPTAstraModelID` and the `GPT-6 Astra` label to built-in options and `docs/model-catalog.json`; update the catalog date.
- Keep Luna, Sol, Terra, saved-selection normalization, and the Luna default intact. Retiring GPT-5.5 choices are unsupported and fall through to the Luna default. Do not introduce the unverified `gpt-6` family alias.
- Keep the existing streaming Responses endpoint, OAuth account headers, `store: false`, timeout, and terminal-completion checks. No endpoint or authentication migration.
- No prompt changes. Chapters keeps its cue-time output contract; Summary keeps production Prompt 1.
- Astra receives no explicit reasoning override, matching existing optional quality-model behavior. Luna's existing explicit-low policy remains.
- No `temperature`, `top_p`, `top_logprobs`, deprecated cache-retention fields, or service-tier overrides are sent. No tools, state replay, vision/files, optional Pro mode, or cache configuration is introduced. Those compatibility gates are not applicable to this stateless text-only request.
- No model pricing/context-limit metadata is invented or changed. Existing workload size, parsers, and output requirements remain intact.

## Validation

- JavaScript suite: 97 passed, 0 failed, including independent Astra/Luna picker selections and the common ChatGPT reasoning boundary.
- Native regressions cover Astra normalization for both model selections, curated labels, version ordering, remote catalog inclusion, unchanged Luna defaults, and omission of unsupported Astra reasoning overrides.
- Signed Debug suite: **32 passed, 0 failed**, macOS 27.0 on arm64, using Xcode's normal DerivedData location with development signing enabled.
- Live Codex backend: **Chapters and Summary passed**, both returning `model: gpt-6-astra` and a completed stream. Six chapter lines used only supplied, chronological cue times. The summary covered sowing/germination, seedling care, and transplanting/harvesting without unsupported additions.
- JSON catalog parse, project property-list validation, and `git diff --check`: passed.

| Small synthetic transcript | End-to-end | First output | Input / output tokens | Reported reasoning tokens |
| --- | --- | --- | --- | --- |
| Astra Chapters | 3,877 ms | 1,972 ms | 300 / 60 | 0 |
| Astra Summary | 5,911 ms | 1,244 ms | 203 / 156 | 0 |

These are single-request compatibility observations, not a long-video benchmark or a comparison against Luna. The request omitted `reasoning`, so zero reported reasoning tokens must not be interpreted as an explicit `none` setting.

Result bundle: `build/chatgpt-astra-2026-09-19-normal-derived.xcresult`. Exported response/metrics attachments: `build/chatgpt-astra-2026-09-19-attachments/` (ignored build artifacts).

Two initial runs in `build/codex-derived` failed during signing because the generated extension acquired `com.apple.FinderInfo`. Removing that metadata did not prevent it recurring in the workspace build directory. The successful run used Xcode's normal DerivedData location, without disabling signing or changing source entitlements. The workspace Debug host and exact stale Release/trashed registrations were unregistered; `pluginkit` confirmed one Debug extension registration afterward. No app files were deleted.

The opt-in `ProviderPromptComparisonTests.runChatGPTModelSmokeWhenRequested` uses the host's existing ChatGPT OAuth session without exporting tokens. It sends a small synthetic gardening transcript through Chapters and the production Summary prompt, checks the returned model and terminal completion, validates chronological chapter times against supplied cues, and checks summary subject coverage. Metrics and output text are exported as Xcode test attachments. Historical comparisons are not rerouted.

```sh
TEST_RUNNER_YTS_CHATGPT_MODEL_SMOKE=1 xcodebuild test \
  -project 'YouTube Timestamps and Summaries.xcodeproj' \
  -scheme 'YouTube Timestamps and Summaries' \
  -configuration Debug \
  -destination 'platform=macOS'
```

Normal test runs do not call the provider. This smoke check proves backend compatibility and basic output contracts, not long-video quality, availability on every plan, or the actual Safari UI. The final [Safari checklist](release-1.2-readiness.md#manual-safari-matrix), including real-video Astra generation, remains required before publication. The previously notarized ZIP is stale and must be regenerated when final packaging is authorized.
