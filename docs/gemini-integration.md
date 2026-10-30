# Gemini integration

Checked against Google's documentation on October 18, 2026.

## Connection and model

Gemini is an optional third provider for Chapters and Summary. The picker defaults to **Gemini Flash (latest)** (`gemini-flash-latest`) and also offers **Gemini 3.5 Flash-Lite** (`gemini-3.5-flash-lite`) and **Gemini 4 Argon** (`gemini-4-argon`). All three use explicit `thinkingLevel: LOW`. Unsupported saved model IDs use the existing generic provider-default fallback; there is no model-specific settings migration. Google hot-swaps this alias to its latest Flash release, which may be stable, preview, or experimental; pricing, quality, limits, and request compatibility can change without an app update. The app sets low thinking explicitly rather than falling back to the provider default and records Google's returned `modelVersion` as `providerModel` in diagnostics. New Chapters and Summary result notes use the actual returned version, for example `Gemini 3.8 Flash`, while Settings keeps `Gemini Flash (latest)`. Missing or blank returned versions fall back to the selected model label. The label is stored with each cached result; existing cached labels are left intact. Only these curated text models are selectable. Both Chapters and Summary may use any of the three independently. Summary lists Apple Intelligence first, followed by Gemini models in the curated newest-first order: Argon, Flash latest, Flash-Lite. Because the Flash alias has no numeric version, its position comes from this curated order rather than numeric ID parsing. [Model naming and alias policy](https://ai.google.dev/gemini-api/docs/models#latest)

1. Open the companion app's **Optional Gemini API Connection** panel.
2. Choose **Open Google AI Studio** and create a current Gemini API key for your Google project.
3. Paste the key into **Gemini API key** and choose **Connect Gemini**.
4. After validation succeeds, select **Gemini** under **Generation Setup**.
5. Choose Gemini for Chapters and either Gemini or Apple Intelligence for Summary.

The key field is masked and cleared immediately after submission. While connected, the field is disabled and **Connect Gemini** is hidden. **Remove API Key** deletes the saved key from the shared macOS data-protection Keychain and enables entry of a new key. Native connection code also refuses to overwrite a saved key; removal must happen first. No developer-operated backend, command-line client, helper, or browser extension permission for Google is required.

## Subscription and billing

This is the official Gemini Developer API, not Gemini app subscription authentication. API requests use the user's Google project and quotas. Google AI Pro includes a $10 monthly Google Cloud credit benefit through Google Developer Program premium; activate and redeem it against the appropriate billing account. It can fund eligible Gemini API requests, but it does not grant unlimited API usage. [Google's benefit announcement](https://blog.google/innovation-and-ai/technology/developers-tools/gdp-premium-ai-pro-ultra/), [benefit eligibility](https://support.google.com/googleone/answer/14534406?hl=en)

Google's billing documentation says prepay accounts must first add funds before promotional Cloud credits can be consumed. The documented initial paid-tier prepayment is $5; billing setup depends on the account. Verify credit redemption, project billing, and quotas in Google AI Studio. The app's connection check validates API-key/model access without a billed generation (and accepts a concrete model name returned for the alias) and cannot certify available credit or inference quota. [Billing documentation](https://ai.google.dev/gemini-api/docs/billing)

The current `latest` alias must be priced using the model Google actually serves. For reference, at the initial pinned-model check, Gemini 3.8 Flash standard paid pricing is $0.75 per million input tokens and $3.75 per million output tokens (including thinking) through December 31, 2026, increasing to $1.50/$7.50 from January 1, 2027. Chapters and Summary are separate calls, so the transcript is input once for each generated result. Refer to Google's live pricing rather than treating these figures as fixed. [Pricing](https://ai.google.dev/gemini-api/docs/pricing)

Google prohibits third-party apps from reusing Gemini CLI or Antigravity OAuth access. The integration does not read their tokens, use Gemini browser cookies, or impersonate a Google client. Google's announced consumer Gemini CLI subscription transition took effect June 18, 2026. [Gemini CLI FAQ](https://geminicli.com/docs/resources/faq/), [Antigravity terms, section 6](https://antigravity.google/terms), [transition announcement](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)

## Native implementation

- `Shared/GeminiAPIClient.swift`: shared Keychain credentials, model metadata validation, allowlisted request construction, HTTPS transport, response parsing, safe error messages, and usage metrics.
- `Shared/GeminiGenerationService.swift`: production Chapters and Summary generation. It compiles into both native targets so signed host tests exercise the same provider implementation as the extension.
- `Shared/ProviderTimestampText.swift`: the strict timestamp validator shared with Grok, plus Gemini-only presentation normalization. Brackets, list markers, bold/code formatting, and equivalent clock padding are accepted only when the time exactly equals a transcript cue. The strict Grok output contract is unchanged.
- `Shared/GenerationSettings.swift`: provider/model options and normalization. The provider ID is `googleGemini`.
- `ViewController.swift`, `Resources/Script.js`, and `Main.html`: local key entry, connection status, and key removal. Saved credentials never return in app state.
- `SafariWebExtensionHandler.swift`, `background.js`, and `content-state.js`: native generation routing, capabilities, attribution, and provider errors.

Connection checks use `GET https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest`. Generation uses `POST https://generativelanguage.googleapis.com/v1beta/models/{selected-model}:generateContent` with `x-goog-api-key` header authentication. Keys never appear in URLs. The default ephemeral URLSession refuses redirects. [API key documentation](https://ai.google.dev/gemini-api/docs/api-key), [REST request/response schema](https://ai.google.dev/api/generate-content)

Generation sends a system instruction and one transcript prompt. Summary reuses the exact production `ProviderSummaryPromptBuilder` contract; the WebExtension removes timestamps for selected-provider Summary requests as before. Chapters keep bracketed transcript times. The prompt explicitly requests unformatted timestamp-title lines with times copied exactly from source cues. If Gemini still adds Markdown or changes clock padding, presentation normalization restores the original cue spelling before strict validation; no estimated or shifted times are accepted. No video upload, web search, tools, chat history, or automatic billed retry is added.

The request leaves candidate count at its default of one, allows up to 32,768 output tokens for Argon and 16,384 for Flash/Lite (including thinking), uses `thinkingConfig: {thinkingLevel: "LOW", includeThoughts: false}`, and leaves sampling parameters at Google's defaults. Only a completed `STOP` candidate with visible text succeeds. Thought parts, empty responses, blocked responses, and truncated/incomplete results are not rendered or cached as successful output. [Thinking configuration](https://ai.google.dev/gemini-api/docs/thinking)

Diagnostics include elapsed time and Google's available usage metadata. After a completed API response, resolved model, response-text length, usage, and accepted chapter count are retained even if timestamp validation rejects every line; raw response text is not included in diagnostic payloads. Output tokens include both visible candidate tokens and thinking tokens, matching the existing provider diagnostic convention. Because generation is non-streaming, no time-to-first-output metric is claimed. Quota, billing, transient network, and provider errors preserve the stored key. Raw provider/network error text is not passed to the page because it may echo credentials. Google's project-level logging, API data terms, and account settings govern provider-side handling; this implementation does not promise zero retention.

## Verification

Implementation verification on October 18, 2026: 109 JavaScript tests and 42 signed Debug native tests passed, with no Swift compiler errors or warnings. The Gemini suite includes eight deterministic tests and an opt-in real-key smoke test whose network body was disabled for this run. The Debug companion's masked entry, connection buttons, and existing provider settings were inspected visually. The initial run did not make live Gemini API calls. Safari Gemini generation remains a separate manual verification.

A later explicitly authorized live run on the same date passed both production paths using the saved Keychain key and synthetic solar-energy transcript. The signed Debug Gemini suite passed all nine cases, with the live flag enabled. Provider options are sorted alphabetically by their displayed label; the Debug menu was verified as ChatGPT / Codex, Gemini, Grok (SuperGrok).

| Live path | Elapsed | Input tokens | Output tokens | Total tokens |
| --- | ---: | ---: | ---: | ---: |
| Chapters | 2,060 ms | 252 | 49 | 301 |
| Summary | 2,799 ms | 149 | 197 | 346 |

Chapters returned six supplied transcript times, covering introduction, photovoltaic cells, inverters, battery storage, roof evaluation, and conclusion. Summary covered generation, power conversion, storage, and installation. Both requests used `gemini-3.8-flash` with low thinking. These are small synthetic smoke checks, not a representative long-video quality or latency benchmark. The test did not change saved provider/model settings or expose the API key. Generated text and metrics are retained in the Xcode result attachments.

The follow-up switched to the official `gemini-flash-latest` alias at the user's request, retaining low thinking and adding resolved-model diagnostics. All 42 signed Debug tests and 109 JavaScript tests passed. Two real alias requests also passed and both returned `modelVersion: gemini-3.8-flash`:

| Alias request | Resolved model | Elapsed | Input tokens | Output tokens | Total tokens |
| --- | --- | ---: | ---: | ---: | ---: |
| Chapters | `gemini-3.8-flash` | 2,245 ms | 252 | 62 | 314 |
| Summary | `gemini-3.8-flash` | 2,412 ms | 149 | 158 | 307 |

The initial pinned 3.8 timings above remain historical evidence. The alias can resolve differently later; these measurements are small synthetic smoke checks, not a long-video benchmark.

Run JavaScript regression checks:

```sh
node --test tests/js/*.test.cjs
```

Run the signed Debug native suite, including deterministic Gemini HTTP fixtures and isolated test Keychain items:

```sh
xcodebuild test \
  -project 'YouTube Timestamps and Summaries.xcodeproj' \
  -scheme 'YouTube Timestamps and Summaries' \
  -configuration Debug \
  -destination 'platform=macOS' \
  -only-testing:'YouTube Timestamps and SummariesTests'
```

Tests cover provider normalization/routing, per-model thinking requests, credential exclusion from URLs and status, invalid keys, rejection of overwrites until the saved key is removed, removal and reconnection, shared production prompts, grounded timestamps, token accounting, blocked/truncated responses, and quota failures preserving credentials.

After connecting a real key in the companion app, this opt-in test makes two small billed calls over a synthetic solar-energy transcript and records output/metrics as Xcode attachments. It uses the existing Keychain key without exporting it and does not change saved provider/model settings:

```sh
TEST_RUNNER_YTS_GEMINI_SMOKE=1 xcodebuild test \
  -project 'YouTube Timestamps and Summaries.xcodeproj' \
  -scheme 'YouTube Timestamps and Summaries' \
  -configuration Debug \
  -destination 'platform=macOS' \
  -only-testing:'YouTube Timestamps and SummariesTests/GeminiTests/liveGeminiChaptersAndSummarySmoke'
```

The `TEST_RUNNER_` prefix forwards the opt-in flag to the signed host. Normal test runs do not make real Gemini calls. Final Safari verification should confirm Chapters/Summary attribution, seeking on a generated chapter, cached results, key removal, and Apple Intelligence Summary selection with Gemini as the chapter provider. Use the normal signed Debug host per `AGENTS.md` and `RELEASING.md`.


## Alternative models assessed — October 18, 2026

This assessment initially kept Flash latest as the only selectable model. After the user requested both alternatives, Flash-Lite and Argon were added with explicit low thinking; Flash latest remains the default. No settings migrations were added.

For the user's comparison, prioritize **Gemini 3.5 Flash-Lite** (`gemini-3.5-flash-lite`): Google positions it for low latency, document parsing, and lower API costs. Test chapter boundaries, timestamp grounding, and summary completeness against Flash using the same transcripts. Faster and cheaper operation is the reason to evaluate it; output quality in this app has not been measured. [Model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)

**Gemini 4 Argon** (`gemini-4-argon`) is a possible quality comparison for difficult, dense transcripts. Google positions it for deeper reasoning, so an improvement for our short chapter/summary outputs is a hypothesis, not an established result. It supports low thinking; the app uses a 32,768-token output ceiling because Google recommends at least that much room for existing apps. It requires paid API access and is not included in Google AI Pro subscription access. [Model documentation](https://ai.google.dev/gemini-api/docs/latest-model)

Standard API prices per million tokens, excluding caching/tools, checked on October 18:

| Model | Input | Output, including thinking |
| --- | --- | --- |
| Gemini 3.5 Flash-Lite | $0.30 | $2.50 |
| Gemini 3.8 Flash (current Flash latest resolution) | $0.75 | $3.75 |
| Gemini 4 Argon | $2.00 | $10.00 |

Flash introductory pricing ends December 31, 2026, then becomes $1.50/$7.50. Argon introductory pricing ends November 30, 2026, then becomes $4/$20. Alias pricing follows the resolved model. [Google pricing](https://ai.google.dev/gemini-api/docs/pricing)

## Timeline and provider-label verification — October 18, 2026

The displayed provider name is now `Gemini`, retaining the `googleGemini` internal identifier. The integrated sidebar hides Timeline while preserving Transcript. Automated checks passed: 110 JavaScript tests, including repeated/localized Timeline replacement and cleanup restoration, and 42 signed Debug native tests. No live provider calls were made for these presentation changes.


The low-thinking configuration for Lite is supported even though Google defaults Lite to minimal. Argon defaults to medium; our explicit low setting favors responsiveness for transcript summaries and chapters. [Thinking levels](https://ai.google.dev/gemini-api/docs/generate-content/thinking), [Argon guidance](https://ai.google.dev/gemini-api/docs/latest-model).


## Three-model verification — October 18, 2026

The signed Debug build passed 110 JavaScript tests and 42 native test cases (46 runs including parameterized Flash/Lite/Argon request and production-service checks). Offline coverage verifies each model endpoint, explicit LOW thinking, Argon's larger output ceiling, shared production prompts, timestamp grounding, returned model diagnostics, and credential preservation after quota errors. The built app's Summary menu was inspected and shows Apple Intelligence, Gemini 4 Argon, Gemini Flash (latest), then Gemini 3.5 Flash-Lite. Flash latest remained selected for Chapters and Summary. No live generation was performed for Lite or Argon; the user will compare those outputs.


## Flash-Lite thinking adjustment — October 18, 2026

Flash-Lite briefly used medium thinking at the user's request. After testing, the user requested low again: the current configuration is explicit LOW for all three Gemini models, for both Chapters and Summary. The native request and diagnostic `reasoningEffort` share the `GenerationSettings.geminiThinkingLevel` constant so recorded effort matches the API payload. The temporary per-model branch was removed. No settings migration or additional UI preference was introduced.


## Chapter-format regression — October 18, 2026

A report of repeated `Gemini did not return usable timestamps` on video `ri4yr-2qBc8` exposed the strict formatting boundary. A synthetic regression reproduces rejection of bracketed/bulleted Markdown and equivalent clock spellings, and verifies Gemini-only normalization while preserving exact source-cue grounding and Grok behavior. The original failed model response was unavailable, and the public transcript export could not retrieve this freshly uploaded video, so this does not establish which formatting appeared in that specific response. A retry on the updated Debug build remains the real-video confirmation. No live Gemini calls were made for this investigation.
