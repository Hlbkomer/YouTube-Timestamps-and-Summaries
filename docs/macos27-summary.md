# macOS 27 On-Device Summary Design and Test Record

Last updated: 2026-07-24

## Product Decision

The macOS 27 product exposes one local summary choice in the existing `Summary model` picker:

| Picker choice | Internal strategy | Intended use | Extra final model call |
|---|---|---|---|
| `Apple Intelligence` | `adaptiveGrounded` | Detailed summary with stronger factual grounding | Yes for two or more chunks |

This decision follows the measured eight-video comparison, manual review, and subsequent hands-on testing. Rolling joined was the fastest successful experimental strategy and produced concise results, but adaptive grounded was consistently judged substantially better and more precise. The quality improvement was considered more important than the additional local generation time, especially as newer Apple silicon improves Foundation Models performance. Rolling composed was not promoted because it was slower than rolling joined and sometimes repeated information. A deterministic deduplication pass was deliberately not added: the observed duplication belonged to a strategy that is not user-facing, and a broad text deduplicator could discard legitimate repeated context.

The M1 Max is the current conservative performance reference, not a reason to switch strategies by hardware generation. The app does not promise a fixed multiplier for newer Macs because transcript shape, chunk count, thermal state, model/runtime revisions, and the final composition call all affect end-to-end time. Future hardware comparisons should use the stage, call, token, and elapsed-time diagnostics already emitted by the Debug runner; the product keeps the same quality-first strategy unless those measurements justify a new decision.

There is no separate Apple-specific mode control. Apple and provider models remain peers in the existing Summary model picker, so the choice is expressed once and stored as the selected summary model. Connected Grok or ChatGPT models are listed first, followed by `Apple Intelligence`.

## Runtime and Compatibility

The sidebar has one `Summary` tab. When Apple Intelligence is selected as the summary engine, the native extension chooses its local implementation at runtime:

- macOS 26 keeps the established character-based chunking path unchanged.
- macOS 27 uses the on-device `SystemLanguageModel` with token-aware chunk planning, model context size, prompt token counting, and request prewarming.

On macOS 27, the existing `Summary model` picker exposes one Apple Intelligence choice. There is no separate Apple-specific mode picker:

- `Apple Intelligence` uses a strict, reader-facing one-call Markdown contract when the complete transcript fits that request's measured input budget. Transcripts that exceed the one-call boundary use the grounded pipeline: it creates self-contained points per chunk, limits the handoff to unresolved continuity rather than facts, preserves sparse source ranges internally, and performs a final composition pass with explicit speaker and entity-binding rules.

The persisted model IDs and their strategy mappings are:

| Saved summary-model ID | Runtime strategy |
|---|---|
| `appleIntelligence` | `adaptiveGrounded` |
| Former `appleIntelligenceFast` | Migrated to `appleIntelligence` / `adaptiveGrounded` |
| Former `appleIntelligenceQuality` | Migrated to `appleIntelligence` / `adaptiveGrounded` |

Every Apple selection now normalizes to the canonical `appleIntelligence` ID and adaptive-grounded strategy. Former Fast, Quality, baseline, hierarchical, rolling-composed, rolling-joined, missing, and unknown user-facing values therefore migrate to the same production behavior. The strategy preference remains stored for compatibility and diagnostics, but it is no longer a user-facing setting.

The baseline, hierarchical, rolling-joined, and rolling-composed strategies remain callable by the Debug test runner for controlled comparisons. They are not production picker choices.

## Implementation Map

- `Shared/GenerationSettings.swift` owns picker IDs, defaults, legacy migration, and production-versus-Debug strategy normalization.
- `YouTube Timestamps and Summaries Extension/AppleIntelligenceService.swift` owns macOS routing, token-aware chunking, the production adaptive-grounded pipeline, Debug-only comparison pipelines, recovery policy, deterministic fallbacks, and metrics.
- `Shared/AppleSummaryTranscriptUtilities.swift` applies native-boundary transcript redaction.
- `Shared/AppleSummaryTextUtilities.swift` removes generic headings, validates strict reader-facing output, and detects narrow model-protocol signatures.
- `YouTube Timestamps and Summaries Extension/SafariWebExtensionHandler.swift` validates the native request and returns strategy diagnostics.
- `YouTube Timestamps and Summaries Extension/Resources/background.js` and `YouTube Timestamps and Summaries/Resources/Script.js` route the selected Summary model and display its label and elapsed time.

## Long-Transcript Architecture

The production pipeline and Debug comparison strategies begin with the same boundary:

1. Merge and normalize transcript cues.
2. Apply transcript redaction at the native boundary, even if the JavaScript caller already applied it.
3. Remove cue timestamps from model-facing text to spend the context window on spoken content.
4. Form transcript-aware thought lines rather than cutting at an arbitrary character position.
5. Build chunks against the on-device model's measured token count and context limit, including prompt and response reserves.
6. Prewarm requests and record per-stage calls, tokens, retries, recoveries, skipped chunks, and fallbacks.

The Debug-only rolling-joined strategy follows this flow:

```text
transcript chunks
  -> concise SUMMARY + very short HANDOFF for each chunk
  -> pass only the handoff into the next chunk
  -> join the chunk summaries
  -> common reader-facing cleanup
```

The handoff supplies continuity, not a growing copy of the full summary. This keeps later prompts bounded even for multi-hour podcasts. Avoiding a final composition call is the main reason this strategy remains useful as a performance benchmark.

The production adaptive-grounded strategy follows this flow:

```text
complete transcript fits the strict one-call budget
  -> strict one-call reader-facing Markdown summary

complete transcript exceeds the strict one-call budget
  -> grounded TOPIC / POINT / HANDOFF notes per chunk
  -> recursive reduction only when the final prompt would exceed context
  -> final full-video composition
  -> deterministic rendering if the final writer is unusable
```

The single-chunk path does not create an unnecessary intermediate digest or final composition call. Its instructions treat the complete transcript only as source material and explicitly forbid JSON, schemas, code fences, tool text, and drafting commentary.

Each multi-chunk grounded point must be self-contained and retain the relevant speaker or entity name. Two-chunk inputs may retain up to five points per chunk so the long-video compression policy does not discard too much of a short multi-chunk video. The handoff carries only unresolved continuity. Sparse source ranges remain available inside the pipeline for ordering and grounding even though raw timestamps are not sent as transcript text.

## Response Contract, Recovery, and Cleanup

The macOS 27 pipelines use transcript-aware thought lines instead of fixed character cuts, then measure the actual Foundation Models token count before each request. Intermediate calls generate permissive `String` responses in small tagged formats such as `TOPIC:`, `POINT:`, `SUMMARY:`, and `HANDOFF:`. The native boundary applies the same transcript redaction safeguards as the JavaScript caller, so direct test runners and future native callers cannot bypass them. Tagged text, completed or nested JSON-shaped responses, and clean prose or bullets can be parsed locally without another model call or exposing model protocol text. Hierarchical and ordinary rolling calls retain one retry for genuinely unusable responses. Adaptive grounded goes directly to its proven extraction recovery after one unusable grounded response. A failed or truncated final writer immediately uses a deterministic rendering instead of repeating the same composition request.

The single-chunk request accepts only a completed reader-facing summary; malformed JSON-like output is rejected rather than repaired. Multi-chunk internal requests remain strict so the common case is predictable. Their parser accepts deterministic tags, JSON field variants, or clean prose/bullets and records a local `formatRecovery`; this does not make another model call. Point-only tagged output remains useful even when the model adds an unrelated no-op tool preamble, because only recognized `POINT:` values enter the grounded representation. An adaptive grounded response that contains no recoverable points switches immediately to the simpler extraction prompt rather than repeating the identical failed request. Final composition is never retried with the same prompt.

Debug metrics distinguish `retries` from `formatRecoveries`. They include `retryStages`, `retryReasons`, `stageCalls`, `modelCalls`, `skippedChunks`, `deterministicFallbacks`, and input/output token totals. Retry reasons include `malformedFormat`, `truncatedOutput`, `guardrail`, and `modelError`.

The String format is important: Apple's `permissiveContentTransformations` guardrail option prevents guardrail violations for String generation, while non-String `@Generable` responses behave like the default guardrails. The original structured experiments therefore produced false sensitive-content failures that the String-based baseline did not.

All paths remove the generic `Summary of Video Transcript` heading. The former broad substring filter is retired: code fences and conversational preambles alone are not classified as model protocol. Narrow signatures such as `detected_language`, `summary_points`, `Tool Analysis`, and `Tool Call` still prevent actual protocol text from reaching the reader. Strict final-output validation separately rejects JSON/code-fence formatting without claiming it is model-internal text.

Selected-provider summaries are not affected by this switch. Grok and ChatGPT summaries continue to use the model selected in the companion app on all supported macOS versions.

Successful Apple summaries display the canonical name and elapsed time in the result caption, for example: “Generated with Apple Intelligence in 75 seconds.” Selected-provider summaries use the same wording with their picker model name. Generated timestamp results use the chapter-specific form, for example: “Chapters generated with Grok 4.5 in 8 seconds.”

## Alternatives Considered

- Baseline/direct chunk composition was reliable but much slower on long transcripts.
- Hierarchical map/reduce improved coverage and speed over baseline, but required more recovery calls in the original corpus and was not the preferred output.
- Rolling composed added a final writer to rolling joined. It cost another call and sometimes repeated facts, so it was not selected.
- Structured `@Generable` intermediates were rejected for this pipeline because they did not honor permissive content transformations in the same way as String generation and produced false sensitive-content failures.
- Carrying an ever-growing full summary into every later chunk was rejected because prompt cost grows with transcript length. A short bounded handoff provides continuity without consuming progressively more context.
- Private Cloud Compute is deferred because the required managed entitlement is not available.

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
2. In `Summary model`, choose `Apple Intelligence`.
3. Open a captioned YouTube video.
4. Confirm the ordinary Summary tab generates successfully with `adaptiveGrounded`.
5. Confirm the result says `Generated with Apple Intelligence` and includes elapsed time.
6. Confirm the debug log records the selected strategy, chunk count, model-call count, stage calls, retries, and input/output token use.
7. Confirm the sidebar contains only Timestamps and Summary, and the extension process does not crash.

## Ongoing Evaluation Protocol

Use the same transcript track for every strategy. Run one strategy across all ten videos before the next strategy, rotating the starting strategy between videos if the Mac becomes thermally constrained.

The initial matrix is:

| # | Coverage target |
|---|---|
| 1 | Reported failure case: long multi-topic interview |
| 2 | 10–15 minute single-topic video |
| 3 | 20–40 minute structured explainer |
| 4 | 45–90 minute interview |
| 5 | 2–3 hour conversational podcast |
| 6 | Multi-speaker panel or debate |
| 7 | Repetitive livestream or loosely structured discussion |
| 8 | Dense technical lecture with names and numbers |
| 9 | Messy auto-captions, interruptions, or music |
| 10 | Supported non-English transcript |

For every run, record elapsed time, success/failure, chunk count, model calls, retries, input/output tokens, and output word count. Score each output from 1–5 for:

- factual faithfulness;
- coverage of early, middle, and late material;
- coherence as one full-video summary;
- concision and lack of repetition;
- clean reader-facing formatting.

Any invented fact, missing final third, truncation, JSON/schema text, model dialogue, or chunk/process commentary is a hard defect in addition to the score. Keep evaluators blind to the strategy name when judging quality.

### Initial failure-case smoke test

On the reported 95,378-character English auto-caption transcript (2,285 cues), one local run per experimental strategy produced:

| Strategy | Time | Chunks / calls | Tokens in / out | Output | Initial observation |
|---|---:|---:|---:|---:|---|
| Hierarchical | 79.9s | 8 / 9 | 24,623 / 931 | 1,887 chars | Richest detail and structure; retained some caption-derived name errors. |
| Rolling, joined | 74.4s | 8 / 8 | 24,038 / 500 | 1,157 chars | Fastest and leanest; transitions were repetitive and less polished. |
| Rolling, composed | 83.6s | 8 / 9 | 24,658 / 809 | 1,549 chars | Best initial balance of coherence and coverage; omitted some specifics retained by the hierarchy. |

All three completed without truncation, schema text, model dialogue, or the generic transcript-summary title. These are smoke-test results, not a winner: timing and quality need the complete ten-video matrix and preferably repeated runs.

### Eight-video reliability and quality comparison

The July 23 comparison covered 40 selected generations: eight videos ranging from 3:47 to 2:59:38, each processed by all five strategies.

| Video ID | Coverage |
|---|---|
| `b_W0z6hZlrI` | 12-minute movie review |
| `VZTmS4B840k` | 45-minute interview |
| `WsCf_rCJxnM` | Two-hour crypto livestream |
| `Z1sUt6gAbUg` | Four-minute news report |
| `UvjW6qASU48` | Lux interview/discussion |
| `n6CNgAtdMw0` | MMA betting discussion |
| `EfKReR8i6W0` | Politics discussion |
| `Lb_1d68vx-g` | Nearly three-hour Joe Rogan episode |

| Strategy | Successful | Total time | Average time | Retries | Skipped chunks |
|---|---:|---:|---:|---:|---:|
| Baseline | 8/8 | 1120.6s | 140.1s | 0 | 0 |
| Hierarchical | 8/8 | 571.7s | 71.5s | 8 | 0 |
| Rolling, joined | 8/8 | 443.3s | 55.4s | 1 | 0 |
| Rolling, composed | 8/8 | 503.7s | 63.0s | 1 | 0 |
| Adaptive grounded | 8/8 | 657.5s | 82.2s | 3 | 0 |

All 40 selected runs succeeded, with zero skipped chunks and zero deterministic fallbacks. The experimental outputs did not require final model/meta cleanup; six baseline outputs did. This establishes generation reliability for this corpus, not factual quality. The experimental strategies cover substantially more of long transcripts, but auto-caption errors, speaker attribution, and entity/number binding remain the next evaluation focus.

These retry counts predate the permissive parser and recovery changes described above. They are retained as historical benchmark data and must not be read as the current expected retry rate.

### Retry investigation and targeted reruns

Inspection of every reproduced retry in the comparison attributed it to usable or partly usable content arriving in an unexpected format. The reproduced cases were not caused by guardrails, service availability, timeouts, or context overflow. That finding led to the permissive String parser, local format recovery, adaptive alternate extraction, and deterministic final fallback.

Targeted reruns of the retry-prone cases produced:

| Strategy / cases | Before | After |
|---|---:|---:|
| Hierarchical, three cases | 3 retries in each case | 0 in each case |
| Rolling joined, one case | 1 retry | 0 |
| Rolling composed, one case | 1 retry | 0 |
| Adaptive grounded, two cases | 1 retry in each case | 0 in each case |

A separate full nearly three-hour Joe Rogan rolling-composed diagnostic completed 16 chunks in 17 model calls with zero retries, zero skipped chunks, and one deterministic final-render fallback. That fallback is a successful recovery rather than a repeated model call.

### Single-chunk regression and boundary redesign

On July 24, the current 3,239-character English transcript for `Z1sUt6gAbUg` reproduced a production failure in the former `smallBaseline` branch. The one direct call returned a substantive summary inside malformed JSON-like code-fence formatting. The legacy broad filter treated the opening JSON code fence as model protocol, removed the complete response, and reported the misleading “model-internal text” error.

The replacement strict single-chunk path completed the exact transcript in one model call in 13.6 seconds on the M1 Max test system. It returned 1,549 characters of reader-facing Markdown with zero retries, format recoveries, skipped chunks, or deterministic fallbacks.

The old branch also covered two direct-plan chunks, so the boundary change was tested with the 12-minute movie-review transcript. The grounded path completed two chunks plus final composition in 20.3 seconds after its two-chunk coverage limit was raised to five points per chunk. It used three model calls with zero retries, format recoveries, skipped chunks, or deterministic fallbacks. A point-only second response containing an unrelated no-op tool preamble was accepted without another call; only its recognized grounded `POINT:` lines entered the final notes.

The selected comparison outputs were saved outside the repository in the dated `Apple Intelligence 8-Video Comparison v3 - 5 strategies - 2026-07-23` folder. The tables above are the durable source-controlled record.

## Known Limits and Next Validation

The current evidence establishes that adaptive grounded and the Debug comparison pipelines can complete the tested long transcripts. Follow-up hands-on testing selected adaptive grounded for its noticeably better output, despite its slower speed. Further review should emphasize:

- names, numbers, quotations, and speaker attribution;
- coverage of the beginning, middle, and final third;
- auto-caption corruption and false entity spellings;
- multi-speaker panels and rapid interruptions;
- supported non-English transcripts;
- summary verbosity and repetition;
- repeat-run variance, thermal throttling, and model behavior across macOS 27 beta updates.

Adaptive grounded is the sole production Apple Intelligence path because its quality improvement was judged worth the additional local generation time. Rolling joined remains available only for Debug performance comparisons and possible future regression analysis.

## Verification Snapshot

At the latest implementation check, the signed Debug test suite passed 19 Swift tests and the JavaScript suite passed 83 tests. Automated coverage includes Apple picker/default/migration behavior, strict short-summary validation, text cleanup and protocol-leak handling, native transcript redaction, and Grok model-to-reasoning mapping. The Debug runner also keeps all five Apple strategies available for real Foundation Models comparisons.

These tests validate routing and deterministic safeguards. Summary quality, Foundation Models nondeterminism, thermal behavior, and beta-OS regressions still require the real-video protocol above.

## Provider Regression Check

1. Select Grok or ChatGPT for the summary engine.
2. Confirm Summary still uses that provider, shows the provider/model caption with elapsed time, and does not show the Apple Intelligence macOS 27 caption.
