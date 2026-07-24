# Prompt 1 vs Prompt 2 provider-summary comparison

Status: completed — 32/32 successful
Checkpoint: `provider-prompt-v2-checkpoint-2026-07-24` (`c0fa489`)
Models: Grok 4.5 with explicit low reasoning and GPT-5.6 Terra
Corpus: the eight videos used for the July 23 Apple Intelligence comparison

## Variants

- **Prompt 1** is the exact production summary contract at the checkpoint.
- **Prompt 2** remains one model call with the complete transcript. It adds a
  verified title, channel, duration, caption source, and a conservative
  description excerpt; untrusted-input rules; stronger entity attribution and
  factual grounding; whole-video coverage; duration-aware detail; and a strict
  reader-facing output contract.
- Neither provider uses Apple Intelligence chunking, handoffs, reducers,
  retries, or broad model-output filters.

Production remains on Prompt 1 while these results are reviewed.

The review concluded that Prompt 2 improves grounding and metadata-assisted
attribution but is too verbose for production. See [FINDINGS.md](FINDINGS.md)
for the quantitative and per-video assessment.

## Stored artifacts

- `manifest.json`: exact corpus and contextual metadata
- `sources/`: timestamped source transcripts retained locally from the earlier
  comparison and intentionally ignored by Git
- each numbered video directory: stripped model input, cleaned metadata,
  Prompt 1 and Prompt 2 Markdown outputs, and raw JSON diagnostics; the
  stripped input copies are also local-only
- `metrics.csv`: status, latency, first-output timing, token counts, and output
  size
- `aggregate-results.json`: all 32 raw provider results
- `FINDINGS.md`: quantitative comparison, qualitative review, and recommended
  next experiment

## Rerunning

The opt-in signed Debug test runner is
`ProviderPromptComparisonTests.runProviderPromptComparisonWhenRequested`.
Set `YTS_PROVIDER_PROMPT_COMPARISON_MANIFEST` in the signed Debug test
environment to this folder's `manifest.json`, then run the comparison suite.
Successful result files are resumed rather than regenerated; set
`YTS_PROVIDER_PROMPT_COMPARISON_FORCE=1` only when a complete rerun is
intended. Because the signed app test is sandboxed, results stage inside the
app container by default and the aggregate JSON and metrics CSV are exported
as Xcode result attachments. Use
`scripts/reconstruct-provider-prompt-results.mjs` to rebuild the permanent
per-video hierarchy from those two attachments.

## Review criteria

Review factual faithfulness, correct person/organization attribution, proper
names, number binding, beginning/middle/end coverage, usefulness, repetition,
verbosity, and latency. Particular regression cases are documented in the
final findings after the run.
