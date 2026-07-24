# Code Review Hardening — July 24, 2026

This document tracks the implementation work that followed the July 24 code
review, with particular attention to changes that can affect complexity, speed,
summary quality, or runtime performance.

## Rollback point

- Commit: `bd02283` (`Checkpoint Apple Intelligence and model updates`)
- Tag: `checkpoint/apple-review-before-hardening`
- This checkpoint passed 83 JavaScript tests and 19 signed Debug Swift tests.

To inspect the checkpoint without changing the working tree:

```sh
git show checkpoint/apple-review-before-hardening
```

Do not reset to the tag while uncommitted work exists. Prefer reverting the
later hardening commit, or create a temporary branch from the tag for comparison.

## Implementation tracker

| Area | Risk found | Planned change | Complexity impact | Speed/performance impact | Quality impact | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Apple long summaries | A chunk can be skipped after both digest attempts fail, producing an incomplete successful summary | Fail the request instead of composing from incomplete notes | Simpler failure contract | Stops early instead of spending time composing an incomplete result | Prevents silent omissions | Completed |
| Apple final validation | A harmless preamble followed by fenced JSON can pass the first-line-only check | Validate the complete response shape and add regression coverage | Small validation increase | Negligible | Prevents malformed summaries from reaching the user | Completed |
| Apple transcript boundaries | Timestamps are removed before native code can use them for local thought boundaries | Preserve timed captions until native chunk planning; strip timestamps from every model-facing prompt | Removes contradictory plumbing | Better boundaries may slightly reduce retries; no extra model calls | Improves grounding on long conversational videos | Completed |
| Provider token refresh | Concurrent generation can perform duplicate refreshes; transient refresh failures delete credentials | Coalesce refreshes within each process, re-read shared state, and sign out only for confirmed invalid credentials | Adds one small shared actor | Removes duplicate network refreshes | Avoids avoidable generation failures and sign-outs | Completed |
| Provider streams | Partial SSE text is accepted without a terminal completion event | Require a terminal completion event; reject failed, incomplete, or truncated streams | Small terminal-state check in both providers | Negligible | Prevents partial summaries and chapters | Completed |
| Status loading | Generation performs a status request before a second native request; unused providers are refreshed | Return generation routing from lightweight settings and refresh only required providers; parallelize independent companion-app state | Reduces duplicated orchestration | Removes serial and unused network work | No intended output change | Completed |
| Companion model picker | Provider/catalog labels are inserted with `innerHTML` | Build option elements with DOM APIs and `textContent` | Simpler trust boundary | Negligible | No intended output change | Completed |
| Grok OAuth callback | Duplicate query keys can trap in `Dictionary(uniqueKeysWithValues:)` | Parse duplicates safely and reject ambiguous callbacks | Small defensive check | Negligible | Avoids a callback-path crash | Completed |
| Apple service maintenance | Production, comparison, PCC, and retired code coexist in one 4,000-line file | Remove small unused compiled helpers and isolate larger cleanup from behavior hardening | Modest reduction now; large rename/deletion deferred | Runtime unchanged | Keeps this change reviewable and reduces rollback risk | Safe subset completed |
| Apple settings strategy plumbing | Unused model aliases and a stored strategy field crossed settings, JavaScript, and the native bridge even though production always chose one pipeline | Keep one canonical model ID, remove the stored/message strategy field and constant-result helpers, and expose alternate strategies only through a Debug service overload | Removes production branches and ignored arguments | Avoids a small amount of settings and message work | No intended output change | Completed in a separate reversible commit |
| Apple redaction | JavaScript and Swift contain duplicated explicit-term patterns | Keep native Swift as the sole enforcement boundary and return its count in success diagnostics | Removes pattern drift | Avoids duplicate regex work | Keeps guardrail behavior consistent | Completed |
| Deterministic coverage | Important Apple and provider failure policies were lightly covered, and the background suite did not execute a native generation job through successful completion | Add focused validation, routing, refresh-policy, picker, callback, and start-to-completion background regression tests | Test-only complexity | Test-only cost | Prevents successful native results from being lost to completion/logging regressions | Completed |

## Reversible follow-up commits

- `ce7c023` removes the unshipped Apple model aliases, stored strategy
  preference, and production strategy message plumbing. Production recognizes
  only `appleIntelligence`; comparison strategies remain available only through
  the Debug service overload.
- `83a46f7` removes the unshipped Grok model-variant alias and its dedicated
  migration/tests. The built-in choices remain Grok 4.5 and Grok 4.3, while
  every Grok 4.5 provider alias canonicalizes to `grok-4.5` and receives
  explicit low reasoning at the final request boundary.
- `f5ddc18` fixes the background generation-completion crash described below
  and adds executable lifecycle coverage.

Each commit is intentionally independent so it can be reverted without
discarding the other cleanup or hardening work.

## Background generation completion incident

### Observed failure

A real Grok 4.5 summary request returned from the native extension in about
eight seconds, but the WebExtension background job then failed with:

```text
background exception: Can't find variable: diagnosticInteger
```

The issue was reproduced on video `xm0rGvvxVOM`. It was not a Grok API,
reasoning, transcript, or timeout failure. Native generation had succeeded; the
result was lost while the background script was formatting optional completion
diagnostics.

### Root cause and affected paths

`diagnosticInteger` was scoped inside
`appendNativeGenerationDiagnostics`. A later native-redaction logging change
called that helper from the outer successful-job completion block, where it was
not defined. Because the call occurred on the common success path, the bug
could turn any successful Grok Chapters, Grok Summary, ChatGPT Chapters,
ChatGPT Summary, or Apple Intelligence Summary response into a failed
background job.

The previous tests covered the diagnostic formatter directly and the
content-side polling coordinator separately. They did not load the production
`background.js`, start a real background job, route its native messages, and
observe that job through terminal completion. Both narrower tests passed while
the integrated runtime path was broken.

### Fix and regression coverage

The integer-normalization helper now lives at background-script scope, shared
by token diagnostics and native-redaction diagnostics. The new
`tests/js/background-generation.test.cjs` suite loads the actual production
background script in a VM, stubs only the native bridge, calls
`startGenerateJob`, and polls `getGenerateJob` to completion for:

- ChatGPT Chapters
- ChatGPT Summary
- Grok Chapters
- Grok Summary
- Apple Intelligence Summary, including native redaction diagnostics

The regression test fails on the previous implementation with the same
`diagnosticInteger` exception. After the fix, all five jobs finish with their
text and expected native action intact. The full checks passed 86/86 JavaScript
tests and 20/20 signed Debug Swift tests. A subsequent real-video retry was
confirmed successful on the affected Mac.

## Deliberately deferred work

- About 770 lines of retired Apple timestamp/video-analysis/PCC experiments remain
  inside compiler-disabled blocks. Removing them and renaming the remaining
  `Experimental` symbols would create a large mechanical diff around the
  production summary pipeline. That cleanup should be its own checkpointed
  maintenance change after real-video validation.
- Replacing repeated exact Foundation Models token counts with an estimated or
  binary-search planner could save local planning time, but it adds cache and
  boundary complexity and risks prompt overflow or unnecessarily small chunks.
  Keep exact counting until profiling shows it is a meaningful share of
  end-to-end latency.
- Cross-process refresh exclusion is not introduced. The per-process gate plus
  a shared-Keychain re-read handles app/extension races without file locks or a
  new helper process.

## Complexity guardrails

- Do not add another Apple Intelligence mode or production strategy.
- Do not add a repair pass that silently rewrites malformed final output.
- Do not add model calls solely to recover from local parser weaknesses.
- Keep timestamps as local metadata only; never include them in summary prompts.
- Prefer one shared synchronization primitive per provider over locks at every
  call site.
- Remove obsolete code only after the production path is covered by tests and
  the signed Debug build passes.

## Verification

- JavaScript: 86/86 tests passed with
  `node --test tests/js/*.test.cjs`.
- Swift: 20/20 tests passed in the signed Debug configuration with the embedded
  Safari extension validated.
- `git diff --check`, JavaScript syntax checks, shell syntax checks, plist
  validation, and JSON validation are part of the final pre-commit gate.
- No Release host was built, launched, or registered.
