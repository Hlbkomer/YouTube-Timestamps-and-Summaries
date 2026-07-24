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
| Apple redaction | JavaScript and Swift contain duplicated explicit-term patterns | Keep native Swift as the sole enforcement boundary and return its count in success diagnostics | Removes pattern drift | Avoids duplicate regex work | Keeps guardrail behavior consistent | Completed |
| Deterministic coverage | Important Apple and provider failure policies were lightly covered | Add focused validation, routing, refresh-policy, picker, and callback regression tests | Test-only complexity | Test-only cost | Reduces regression risk | Completed |

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

- JavaScript: 85/85 tests passed with
  `node --test tests/js/*.test.cjs`.
- Swift: 20/20 tests passed in the signed Debug configuration with the embedded
  Safari extension validated.
- `git diff --check`, JavaScript syntax checks, shell syntax checks, plist
  validation, and JSON validation are part of the final pre-commit gate.
- No Release host was built, launched, or registered.
