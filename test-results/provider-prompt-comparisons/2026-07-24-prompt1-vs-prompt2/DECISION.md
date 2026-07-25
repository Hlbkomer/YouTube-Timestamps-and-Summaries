# Provider summary prompt decision record

Date: 2026-07-25
Status: deferred for later discussion; no production prompt change approved

## Decision

Do not promote Prompt 2 and do not continue expanding it into a more elaborate
Prompt 3. Prompt 2 demonstrated some useful ideas, but its instruction set is
over-engineered for the product's ordinary ChatGPT/Grok summary path. The
quality gains were not substantial or consistent enough to justify the added
latency and verbosity.

Production remains on Prompt 1. The comparison runner, Prompt 2 definition,
outputs, and measurements remain available as research artifacts so this
decision can be revisited without repeating the investigation.

If provider-prompt work resumes, the preferred direction is a small Prompt 1
revision ("Prompt 1.1"), tested as one isolated change.

## Shared ChatGPT/Grok prompt

ChatGPT and Grok summaries now use the same
`ProviderSummaryPromptBuilder`. The production-version constant selects the
same Prompt 1 instructions and prompt body for both providers.

Before this consolidation, the two services maintained nearly identical
summary prompt text separately. They could drift when one copy was changed.
There is no longer a meaningful summary-prompt difference between them.

The remaining provider differences are intentional implementation details:

- different models, authentication, endpoints, and streamed-response parsing;
- Grok 4.5 explicitly sends low reasoning effort, while other models retain
  their own configured/provider behavior;
- provider-specific diagnostics and error handling.

Both remain one-call operations over the same complete timestamp-stripped
transcript. Neither uses Apple Intelligence chunking, handoffs, reducers,
recovery prompts, or broad output filters.

## What "metadata" means

The comparison infrastructure can carry these video-context fields:

- title;
- channel name;
- YouTube description;
- duration;
- caption source, such as automatic or creator-provided captions.

Prompt 1 currently ignores all of them. Prompt 2 used all of them.

For a lean Prompt 1.1, the current recommendation is to use only:

- **Title:** high-value, very small context that often establishes the topic
  and proper names.
- **Channel:** very small and occasionally useful for identifying the source,
  host, or point of view.
- **Short cleaned description:** potentially useful for guest names and topic
  context, but it should be optional and capped at roughly 500 characters.

Duration-dependent detail rules and a caption-source-specific instruction are
not recommended for Prompt 1.1. They add prompt policy and can encourage the
model to expand its answer.

The existing description cleaner removes URL, promotion, chapter, hashtag,
and common boilerplate lines and selects the first useful paragraph. Its
current 2,500-character ceiling was created for Prompt 2. A Prompt 1.1
implementation should reduce that ceiling for model input to roughly 500
characters.

## Deferred Prompt 1.1 draft

Keep the existing system instruction:

```text
You summarize YouTube transcripts clearly and concisely.
```

Keep the existing Prompt 1 format, adding only a compact context block and a
direct-start rule:

```text
Summarize this video transcript clearly and concisely.
[Existing detected-language instruction]

Video context:
Title: ...
Channel: ...
Description: ...

Use the video context only to understand the topic and names. Summarize the
transcript itself.
Start directly with a short overview paragraph; do not add a generic summary
title.
Then use bold section labels like **Main Topic** with useful bullet points.
Use one nested bullet level only when it adds helpful detail.

Transcript:
...
```

Do not transfer Prompt 2's duration-aware detail levels, beginning/middle/end
checklist, long attribution framework, ASR-specific paragraph, or extensive
output/protocol prohibitions unless a reproduced failure shows that a
particular rule is necessary.

This draft is a proposal only. It has not been enabled or benchmarked.

## Apple Intelligence finding

The current Apple Intelligence summary request receives the transcript and
detected language, but not the title, channel, or description. The WebExtension
currently forwards those context fields only on selected-provider
ChatGPT/Grok summary requests.

Adding compact video context to Apple Intelligence appears worthwhile, and may
be especially useful because the local model has less general reasoning
capacity and automatic captions often damage proper names. However, Apple has
a smaller context budget, so the input should remain deliberately small.

If implemented later:

- pass title and channel;
- pass only the same short cleaned description, capped around 500 characters;
- label the block as context for topic/name recognition rather than transcript
  evidence;
- use it once in the strict single-call path;
- make the compact context available to long-video source-chunk prompts and
  final composition without changing the sequential handoff architecture;
- do not add model calls, retry layers, or a new Apple mode.

No Apple metadata change has been implemented as part of this comparison.

## ASR terminology

ASR means **Automatic Speech Recognition**. In this project, an `asr` caption
track is a YouTube automatically generated transcript rather than captions
uploaded by a person. Automatic transcripts frequently mishear names,
companies, acronyms, and specialist terms.

Prompt 2 contained a dedicated ASR instruction telling the model to use
metadata cautiously when resolving those mistakes. The current preference is
not to carry that specialized rule into Prompt 1.1. A title and short
description may provide the same practical name context with much less prompt
machinery.

## Suggested next test when work resumes

Compare production Prompt 1 with only the Prompt 1.1 draft above. Keep every
other variable unchanged:

- GPT-5.6 Terra and Grok 4.5 low reasoning;
- one full-transcript request per model;
- the same eight-video corpus;
- no output repair or model retry;
- stored latency, token, output-length, and qualitative results.

The candidate should be promoted only if names/topic recognition improve
without materially increasing output length or latency. Apple metadata should
be evaluated separately so provider-prompt results and local chunk-pipeline
effects are not mixed together.
