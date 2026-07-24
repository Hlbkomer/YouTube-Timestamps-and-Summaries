# Findings: Prompt 1 vs Prompt 2

Date: 2026-07-24
Models: GPT-5.6 Terra and Grok 4.5 with explicit low reasoning
Corpus: eight videos, from 3:47 to 2:59:00
Result: 32 of 32 completed successfully

## Conclusion

Prompt 2 is a useful quality prototype, but it is not ready to replace Prompt
1. It improves metadata-assisted naming, role identification, speaker
attribution, handling of uncertain automatic captions, and coverage of later
topics. Its main cost is not the added metadata input; it is the much longer
answer the detail instructions encourage.

Production therefore remains on Prompt 1. The recommended next candidate is a
compact grounded prompt that retains Prompt 2's context and attribution rules
but adds an explicit output budget and tells the model to select the most
important examples instead of enumerating every stock, fight, or subtopic.

## Quantitative results

| Model | Prompt | Mean latency | Median latency | Mean first output | Mean input tokens | Mean output tokens | Mean words |
|---|---:|---:|---:|---:|---:|---:|---:|
| GPT-5.6 Terra | Prompt 1 | 19.2s | 18.9s | 1.73s | 16,848 | 971 | 732 |
| GPT-5.6 Terra | Prompt 2 | 33.8s | 34.2s | 1.15s | 17,304 | 1,820 | 1,397 |
| Grok 4.5 low | Prompt 1 | 24.1s | 26.7s | 4.45s | 16,896 | 980 | 544 |
| Grok 4.5 low | Prompt 2 | 32.9s | 32.0s | 5.40s | 17,359 | 1,332 | 818 |

Compared with Prompt 1:

- Terra Prompt 2 averaged about 1.74× the latency and 1.88× the words per
  matched video.
- Grok Prompt 2 averaged about 1.39× the latency and 1.52× the words per
  matched video.
- The richer prompt and metadata added only about 456 input tokens for Terra
  and 463 for Grok on average. Most of the speed penalty came from generating
  more output: about 849 extra Terra output tokens and 352 extra Grok output
  tokens on average.
- All requests were one full-transcript call. The runner performed no model
  retries, chunking, handoffs, reducers, or output-repair pass.

The successful-call durations total 881.1 seconds. The test was completed
across two resume-safe executions because the first execution was manually
paused to add Xcode attachment export; completed calls were reused, and the
single in-flight request was restarted.

## Qualitative review

| Video | Observation |
|---|---|
| 12-minute movie review | Both prompts captured the same verdict and major reasons. Prompt 2 added useful specifics but did not materially change correctness; its Grok output was more than twice as long. |
| 45-minute Greg Brockman interview | Clear Prompt 2 quality win. Metadata supplied Greg Brockman's full identity and role, Alex Kantrowitz, and the Satya Nadella/Microsoft context. Attribution and beginning-to-end coverage were stronger, but Terra grew from 761 to 1,500 words. |
| 2-hour crypto stream | Both prompts covered the Bitcoin thesis, broader markets, later viewer requests, risk controls, and closing view. Prompt 2 preserved many more ticker-specific levels, but became closer to a transcript index than a summary. Grok also used the ambiguous label `Lunar/LUNA`, showing that grounding rules cannot resolve every caption ambiguity. |
| 4-minute news clip | Outputs were almost identical in size and substance. Prompt 2 used the description to identify Mark Wallace as United Against Nuclear Iran's CEO and kept claims attached to Wallace. This is the strongest low-cost Prompt 2 result. |
| Nux Taku commentary | Prompt 2 more clearly separated the host's inflammatory opinions from claims in the clips and Grok correctly named Nux Taku from the channel metadata. The Terra result expanded from 502 to 1,283 words, which is excessive for the source. |
| 91-minute MMA betting show | Terra Prompt 2 handled damaged ASR names more honestly by retaining uncertainty rather than silently converting every name into a confident spelling. None of the four cloud outputs repeated the earlier Apple error that assigned `three and seven in the UFC` to Abdul Hussein; they omitted that record rather than rebinding it. Grok still produced confident questionable undercard names, so metadata and prompt rules are not a complete ASR entity solution. Both Prompt 2 outputs were too long. |
| 53-minute Lawrence Wilkerson interview | Grok Prompt 2 used the description and title to identify Lawrence Wilkerson's exact former role and host Glenn Diesen, while keeping opinions attributed to Wilkerson. Terra Prompt 2 improved detail and attribution but nearly doubled in length. |
| 3-hour Joe Rogan episode | Prompt 2 used Luigi Vendittelli's full name, covered the late ancient-civilization and filmmaking-evidence sections, and repeatedly marked Lazar's statements and broader speculation as claims rather than established facts. Prompt 1 already covered the full thematic arc. Terra Prompt 2 reached 2,388 words and Grok reached 1,386, so the extra coverage is not efficient enough for production. Neither Prompt 2 output misattributed the environmental-health discussion to Shanna Swan. |

## Recommended Prompt 3 direction

Keep:

- verified title, channel, duration, caption source, and cleaned first useful
  description paragraph;
- the explicit metadata-as-context/transcript-as-evidence boundary;
- the untrusted-input instruction;
- speaker, number, quotation, and action attribution rules;
- the ASR name-disambiguation rule and neutral fallback for unclear speakers;
- beginning, middle, and end coverage;
- direct reader-facing output with no generic `Summary` heading or protocol
  text.

Change:

- replace “detailed whole-video coverage” with explicit duration-based word
  ranges;
- ask for representative examples instead of an inventory;
- cap the number of sections and bullets;
- tell the model not to list every market ticker, fight, or anecdote unless the
  video's purpose requires it;
- retain uncertainty without putting multiple guessed names in headings.

A reasonable first budget to test is 180–350 words below 10 minutes, 350–700
words from 10–60 minutes, 500–900 words from 60–120 minutes, and 650–1,050
words above two hours. These are proposed test ranges, not production settings.

## Artifact map

- `manifest.json`: URLs and exact metadata context
- `sources/`: original timestamped transcript corpus, retained locally and
  ignored by Git
- numbered video folders: stripped input transcript, metadata, four Markdown
  outputs, and four raw result JSON files; stripped transcripts are local-only
- `metrics.csv`: per-request latency, first-output, token, and size metrics
- `aggregate-results.json`: all 32 raw results in one file
