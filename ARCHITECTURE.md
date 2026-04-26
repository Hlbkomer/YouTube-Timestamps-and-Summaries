# Architecture

This project generates YouTube timestamps and summaries from the video's available transcript. The current default path uses the user's signed-in ChatGPT model for timestamps and summaries. Apple Intelligence is optional for local summary generation on supported Macs.

## Current Generation Pipeline

The current default approach is split into transcript extraction, ChatGPT timestamp generation, configurable summary generation, and deterministic timestamp validation:

1. The Safari content script runs only on supported YouTube watch and live pages.
2. The content script fetches the available YouTube captions/transcript for the current video.
3. The companion app asks the user to choose a ChatGPT model and sign in if no ChatGPT token is available yet.
4. The background script starts separate timestamp and summary jobs so each tab can report its own progress and failure state.
5. The native extension sends the timestamped transcript to the selected ChatGPT model for timestamp generation.
6. In parallel, the native extension sends the transcript to the selected ChatGPT model or Apple Intelligence for summary generation.
7. Generated timestamp candidates are aligned back to real transcript cue times before the sidebar renders clickable timestamps.

Both tabs are generated automatically when a supported video opens. The user should not need to click `Summary` to start the summary request.

The core rule is:

- code owns timing
- ChatGPT owns timestamp topic wording
- the selected summary engine owns summary wording

ChatGPT may choose topic titles, but generated timestamp candidates are validated against real transcript timestamps before they become clickable sidebar timestamps.

## Why This Approach

Earlier versions asked the model to create timestamps directly from raw caption lines. That produced plausible topic names, but timings could drift, collapse into the wrong part of the video, or extend beyond the video's duration.

The current approach is more stable than sending YouTube video input directly because:

- transcript timestamps remain the source of truth
- ChatGPT receives transcript text instead of asking a video-input API to infer timing
- summary and timestamp generation run from the same fetched transcript
- generated timestamps are aligned back to real transcript cue times in code

## Transcript Preparation And Validation

YouTube captions often arrive as tiny fragments, for example:

```text
[00:03] so when did you get interested in the
[00:06] subject
[00:07] of ufos that happened at a surprisingly
```

Older local timestamp experiments lightly merged these into shorter readable blocks while preserving the first real timestamp for each block. The current default timestamp path sends the original timestamped transcript to ChatGPT and validates the returned timestamps against the original transcript cue times.

For summaries, timestamp prefixes are stripped before sending transcript text to the selected summary engine because summaries do not need cue-level timing.

## ChatGPT Path

The first provider implementation uses the same broad ChatGPT/Codex approach seen in Hermes and OpenClaw:

- device-code sign-in through `auth.openai.com`
- token refresh through the Codex OAuth token endpoint
- timestamp generation through `https://chatgpt.com/backend-api/codex/responses`
- no OpenAI API key and no developer-operated backend

ChatGPT settings and sign-in tokens are kept locally in the shared app group container so the companion app and native extension can use the same account state.

The provider abstraction is intentionally small: provider ID, model ID, sign-in status, timestamp generation, and optional summary generation. This keeps the door open for future providers such as Ollama or OpenRouter without changing the YouTube content-script routing.

## Summary Engine

The summary request runs in parallel with timestamp generation. Users can choose:

- `Apple Intelligence`, which keeps the summary on the Mac
- `Selected model`, which sends the transcript to the selected ChatGPT model used for timestamps

Apple Intelligence is optional and is not used as a silent fallback. If the user chooses Apple Intelligence and it fails, the transcript is not silently sent to ChatGPT.

## Timestamp Validation

The native extension:

- parses the topic candidates
- aligns each candidate to the nearest real transcript timestamp
- removes duplicate timestamps

The content script caches the resulting analysis per video, so whichever tab is opened first can populate the other tab without another full pass.

## Important Guardrails

- Do not broaden `content.js` to all YouTube pages. Shorts and non-video pages have fragile layouts.
- Do not let any model output final timestamps without code validation.
- Do not add bundled generation credentials or a developer backend.
- Be explicit in docs/privacy copy that transcript text is sent to ChatGPT for timestamp generation and optionally for summary generation.
- Treat YouTube transcript extraction as best-effort because YouTube does not provide a stable public transcript API for this use case.

## Tuning Knobs

The main timestamp quality controls currently live in `CodexGenerationService.swift`:

- selected model choice
- timestamp prompt wording
- transcript-time alignment tolerance
- timestamp title cleanup and duplicate removal

The older local timestamp experiment controls still live in `AppleIntelligenceService.swift`:

- analysis chunk size
- light-merge maximum line length
- light-merge maximum elapsed time per block
- number of topic candidates requested per chunk

When tuning, test across several video types before committing:

- short normal video, around 5-10 minutes
- longer normal video, 30-60 minutes
- interview or podcast
- tutorial or explainer
- recently finished live stream
- video without captions/transcript
- Shorts navigation and non-video YouTube pages
