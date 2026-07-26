# Apple Intelligence video map prototype

Status: internal `DEBUG` prototype. It is not exposed in the chapter model picker or production request routing.

## Goal

Test two local Apple Intelligence configurations:

1. Apple Intelligence creates chapters only.
2. Apple Intelligence creates chapters and the summary from one shared transcript analysis.

The production comparison is the existing behavior: generate Apple chapters and the current adaptive Apple summary in two independent transcript passes.

## Architecture

The prototype builds a reusable, timestamp-aware semantic video map:

1. Redact the same explicit transcript terms used by the production Apple summary path.
2. Lightly merge caption cues into thought-sized lines while preserving their original start times locally.
3. Give each line a stable anchor such as `L00042`. The model sees the anchor and text, not a numeric timestamp it can invent.
4. Split the anchored lines using the model's live 4,096-token context size and a reserved response budget.
5. Process chunks sequentially. Each call receives only the previous active-topic handoff, video title/channel context, and its current transcript chunk.
6. Ask for one compact JSON `String` containing:
   - a short topic;
   - grounded point candidates;
   - chapter candidates as compact `[anchor, title]` tuples;
   - a small continuity handoff.
7. Validate every returned anchor against the current chunk. Unknown anchors, malformed fields, model-meta text, and unbounded output are rejected.
8. Compile the final chapter list deterministically:
   - sort by the real local timestamp behind each anchor;
   - force a `00:00` opening chapter;
   - remove duplicate times and titles;
   - apply duration-aware spacing and chapter-count caps.
9. In chapters-only mode, discard the point candidates.
10. In shared chapters+summary mode, reuse the same points in the existing grounded reduction and final-composition stages. The raw transcript is never analyzed a second time.

The model proposes semantic candidates; deterministic code owns timestamp validity and final chapter density.

## Why permissive `String` intermediates remain

Earlier Apple summary testing found false sensitive-content failures with generated schemas. This prototype therefore does not use `@Generable`. It accepts a narrow tagged or JSON transport in a normal `String`, then validates the content itself.

The compact JSON transport is an internal protocol, not reader-facing output. It was more reliable than asking the small model to combine `TOPIC:`, `POINT:`, `CHAPTER:`, and `HANDOFF:` lines.

## Candidate limits

The prompt asks for a sparse map, but the on-device model sometimes returns more valid candidates than requested. Rejecting the whole chunk made long videos fail and wasted completed calls.

The final design accepts a bounded candidate set:

- up to 16 grounded points per chunk;
- up to 32 validated chapter candidates per chunk;
- chapter titles up to 12 words and 90 characters.

The deterministic compiler still enforces the much smaller final chapter cap:

- under 5 minutes: 5;
- under 15 minutes: 8;
- under 60 minutes: 12;
- under 2 hours: 16;
- 2 hours or longer: 20.

Malformed responses are not retried with an identical prompt. Only non-format failures remain eligible for one retry.

## Ten-video results

Test machine: M1 Max on the macOS 27 beta.

- Chapters-only: 10/10 succeeded.
- Shared chapters+summary: 10/10 succeeded.
- Separate chapters+existing summary: 9/10 succeeded.
- Across the nine videos where both full approaches succeeded:
  - shared: 791.3 seconds and 96 model calls;
  - separate: 1,250.0 seconds and 158 model calls;
  - shared was 36.7% faster and used 62 fewer calls.
- The three-hour Joe Rogan video:
  - shared: 220.5 seconds and 25 calls;
  - separate: 346.1 seconds and 42 calls;
  - shared was 36.3% faster with similar summary length.

The separate baseline failed consistently on the final chunk of `425R4PQ5svQ`. The existing grounded extractor returned model-internal `TOOL CALL` text, and its fallback returned another `TOOL CALLS` preamble plus multiple topic blocks. The shared compact map succeeded on the same transcript in 178.9 seconds.

Full outputs and per-video metrics are in:

`test-results/apple-video-analysis/2026-07-26-shared-map-v1/`

## Quality review

Chapter generation is promising:

- chapter timestamps are always grounded in real transcript anchors;
- lists are generally sparse and coherent across 4-minute to 3-hour videos;
- chapters-only and shared modes produce the same chapter list from the same map;
- no subscription or network model is required.

The shared-summary architecture is faster and more robust, but the current point schema is not ready for production:

- short-video summaries can be substantially less detailed than the existing strict short-summary path;
- some long commentary videos preserve ASR name errors;
- some extracted points transfer a claim to the wrong person;
- some final summaries repeat topic labels or retain noisy market-chat details.

These are extraction-quality problems, not timestamp problems.

## Recommendation

Continue with the shared video map, but keep it internal for now.

The next quality experiment should change point strings into compact subject/claim tuples, for example:

`["Mark Wallace", "says the facility can be destroyed without ground troops"]`

The parser would combine the tuple deterministically, preserving an explicit subject through reduction. Compare that version against this stored corpus before considering production use.

For exactly one transcript chunk, continue comparing the shared summary against the existing strict one-call summary. The strict path is slower when paired with a separate chapter call, but it is often more detailed.

## Reversibility

The prototype started from clean checkpoint `7d73fa1`. All model entry points are `DEBUG`-only, and no production model picker or request kind was changed.
