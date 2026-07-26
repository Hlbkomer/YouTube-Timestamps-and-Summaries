# Apple Intelligence video map prototype

Status: internal `DEBUG` prototype. It is not exposed in the chapter model picker or production request routing.

## Goal

Test three local Apple Intelligence configurations:

1. Apple Intelligence creates chapters from the full semantic video map.
2. Apple Intelligence creates chapters and the summary from one shared transcript analysis.
3. Apple Intelligence creates standalone chapters from a lean chapter-only map.

The separate comparison combines full-map Apple chapters with the current adaptive Apple summary in two independent transcript passes.

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

## Lean standalone chapters

The first chapters-only benchmark was not truly lean: it asked for the same
topic, summary points, chapter candidates, and handoff as the shared map, then
discarded the points. That made the shared mode look artificially close to
chapters-only and made standalone chapters slower than necessary.

The follow-up `leanChaptersOnly` mode is the intended architecture when Apple
Intelligence creates chapters while Grok or ChatGPT creates the summary:

- it requests only a topic, chapter candidates, and a continuity handoff;
- it reserves 420 response tokens instead of 800, fitting more transcript into
  each anchored chunk;
- it allows four chapter candidates per larger chunk instead of three;
- it keeps the same deterministic timestamp compiler and final density caps;
- it accepts internal title abbreviations such as `vs.` and `U.S.` while still
  rejecting sentence-ending punctuation;
- it discards only an invalid chapter candidate instead of rejecting an
  otherwise valid lean chunk.

Candidate-level rejection is deliberately limited to the lean path. The stored
full-map and shared-map baselines retain their original strict parsing behavior.

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

### Lean chapter follow-up

Only the new lean chapter approach was regenerated. All summary, shared-map,
and original map-based timings were reused.

- Lean chapters: 10/10 succeeded.
- Map-based chapters: 885.5 seconds and 108 calls.
- Lean chapters: 698.8 seconds and 89 calls.
- Lean chapters were 21.1% faster and used 19 fewer calls.
- Lean produced 98 final chapters versus 113 from the full map.
- Across the nine videos with a usable stored Apple summary:
  - lean chapters + stored summary: estimated 1,110.1 seconds and 143 calls;
  - shared chapters + summary: 791.3 seconds and 96 calls;
  - shared remained 28.7% faster and used 47 fewer calls.

The first lean run exposed two deterministic validation problems:

1. `Machado vs. Tukulov analysis` was rejected because all periods were banned.
   The validator now permits internal abbreviations but not sentence-ending
   periods.
2. `Heat up here.` was an unusable title inside an otherwise valid JSON map.
   The lean parser now drops that candidate and preserves the valid topic,
   handoff, and other candidates.

Both fixes are covered by unit tests. The final corpus succeeded without
regenerating any stored summaries.

## Quality review

Chapter generation is promising:

- chapter timestamps are always grounded in real transcript anchors;
- lists are generally sparse and coherent across 4-minute to 3-hour videos;
- chapters-only and shared modes produce the same chapter list from the same map;
- no subscription or network model is required.

The lean chapter path has a clear speed advantage, but is intentionally
sparser:

- it preserved the full 16- and 20-chapter caps on the crypto and Joe Rogan
  videos;
- several long-video titles became more focused because the model was no longer
  asked to write summary points;
- the short news clip and some medium videos lost useful secondary boundaries;
- exact wording and timestamps vary between local model runs, so exact-list
  equality is not a meaningful quality metric.

The shared-summary architecture is faster and more robust, but the current point schema is not ready for production:

- short-video summaries can be substantially less detailed than the existing strict short-summary path;
- some long commentary videos preserve ASR name errors;
- some extracted points transfer a claim to the wrong person;
- some final summaries repeat topic labels or retain noisy market-chat details.

These are extraction-quality problems, not timestamp problems.

## Recommendation

Use the lean map for the internal Apple-chapters + Grok/ChatGPT combination.
Use the shared map when Apple Intelligence creates both chapters and summary.
Keep both internal until the saved chapter lists receive a manual quality
review.

The next quality experiment should change point strings into compact subject/claim tuples, for example:

`["Mark Wallace", "says the facility can be destroyed without ground troops"]`

The parser would combine the tuple deterministically, preserving an explicit subject through reduction. Compare that version against this stored corpus before considering production use.

For exactly one transcript chunk, continue comparing the shared summary against the existing strict one-call summary. The strict path is slower when paired with a separate chapter call, but it is often more detailed.

## Reversibility

The prototype started from clean checkpoint `7d73fa1`. All model entry points are `DEBUG`-only, and no production model picker or request kind was changed.
