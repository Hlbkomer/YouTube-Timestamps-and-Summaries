# Grok Integration Notes

## Purpose

Grok support uses the person's own xAI/SuperGrok sign-in. It is not an xAI API-key integration and does not invoke the Grok command-line client.

The implementation is deliberately a single sandboxed app-and-extension build:

- the macOS companion app starts the browser sign-in initiated by the person
- the app and Safari extension share the resulting OAuth tokens through a shared macOS Keychain access group
- the Safari extension calls the xAI Responses endpoint directly over HTTPS
- there is no bundled helper, background service, Login Item, `osascript`, or developer-operated backend

`Shared/XAITokenSession.swift` is the single post-login implementation used by both native targets. It owns trusted discovery URL validation, access/refresh token parsing, Keychain storage and migration, refresh requests, error parsing, status, and sign-out. The containing app keeps only interactive browser/loopback/manual login plus model-catalog presentation; the extension wrapper only consumes the shared session.

## OAuth Design

The companion app discovers xAI's OAuth endpoints, creates a fresh PKCE verifier, state, nonce, and authorization request, and opens that request in the browser. The normal redirect target is `http://127.0.0.1:56121/callback`, following the external-browser, loopback-IP, PKCE, and state-verification guidance in [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html).

The loopback listener exists only for this person-initiated sign-in. The app supplies xAI's generic OAuth-plan request parameter and includes the PKCE challenge fields in the authorization-code exchange, matching the behavior researched from Hermes without impersonating Hermes.

The OAuth session is short-lived (15 minutes). Its state, PKCE verifier, authorization code, and any pasted callback URL remain in memory only and are never written to app settings or the shared token store.

## Loopback Reliability Investigation

On the macOS 27 beta test system, the xAI approval page briefly proceeds after **Allow**, then Safari reports that it cannot connect to `127.0.0.1:56121`. This happened repeatedly with the normal callback listener active.

The callback server review initially found two implementation hazards that can produce Safari's **server unexpectedly dropped the connection** result: it parsed the first TCP receive callback as a complete HTTP request, and it resumed OAuth processing immediately after scheduling the HTTP response instead of waiting for Network.framework to process that response. A fast token exchange and session teardown could therefore race the browser response.

A subsequent live Safari trace identified the remaining failure: Safari opened a speculative loopback connection without sending an HTTP request, closed that probe after ten seconds, and then retried with the real callback. The server incorrectly treated the empty probe's EOF as the terminal OAuth result, so it rejected Safari's valid retry.

The listener now treats empty, incomplete, failed, oversized, and non-matching connections as non-terminal and continues waiting for the one valid callback. It validates the callback path, authorization result, and the pending session's state before consuming it. It also accumulates a bounded request through the complete HTTP header, sends a final TCP message with an explicit write-close, resumes OAuth only after the browser response has been processed, keeps the accepted connection alive briefly, retains an early callback until its async waiter registers, and disables local endpoint reuse. A signed integration test starts the real listener on an ephemeral loopback port, reproduces an empty browser probe, rejects a wrong-state callback without consuming the session, forces the valid request header across multiple receives, completes that browser request before registering the waiter, verifies the success page, and confirms the callback parameters.

After these changes, a fresh xAI authorization completed through Safari on the Mac that had repeatedly reproduced the failure: Safari reached the local completion page, the app reported `Grok is connected.`, and Grok worked without pasting the callback. Together with the signed probe/retry integration test, this confirms the identified server-side race is fixed for the reproduced case. The manual fallback remains as a recovery path because browser, firewall, or future provider behavior can still prevent a loopback redirect; the earlier failure is not attributed to the OS beta.

## Implemented Fallback

When sign-in starts, the companion app now shows a field for the complete callback URL or the one-time authorization code.

1. Start **Sign in with Grok**.
2. Approve the xAI request in Safari.
3. If Safari cannot open the local callback page, copy the full failed callback URL from Safari, or copy the authorization code that xAI displays.
4. Paste it into the app and choose **Complete Sign-In**.

For a full callback URL, the app verifies the original OAuth `state` value before exchanging the code. A bare one-time code is bound to the same in-memory PKCE verifier. The code is not saved and can be used only during that short-lived sign-in session.

This fallback was successfully tested: the pasted callback completed sign-in and Grok generated YouTube timestamps. Keep it as a recovery path even after the hardened automatic callback is confirmed.

## Model Policy

xAI describes `grok-4.7` as its flagship model for code, agentic tasks, and knowledge work. This app uses it with explicit low reasoning as the default, retains `grok-4.6`, `grok-4.5`, and `grok-4.3`, and refreshes the connected account's text-input/text-output Grok model list from `https://api.x.ai/v1/language-models` when possible.

Grok 4.7, Grok 4.6, and Grok 4.5 explicitly send `reasoning: { "effort": "low" }`. This is a request invariant rather than a picker convention: exact IDs and provider aliases such as `grok-4.7-latest`, `grok-4.6-latest`, and `grok-4.5-latest` are canonicalized to their built-in models before request serialization. Grok 4.3 and other model families retain xAI's default until separately measured. Request diagnostics record the picker model, provider model, reasoning effort, time to first output, input/output/total tokens, cached input tokens, reasoning tokens, and service tier whenever xAI returns those fields.

A repository-wide request-path audit confirmed that Chapters and selected-provider Summary both route through the same `GrokGenerationService.requestText` builder and that no second xAI generation endpoint exists. The builder derives the reasoning object from the actual provider model immediately before JSON serialization; callers cannot pass or omit an effort independently. It also refuses to send a curated Grok 4.7, Grok 4.6, or Grok 4.5 request unless the derived object is exactly `{"effort":"low"}`, so a mapping regression fails locally instead of silently falling through to xAI's high default. Every attempt re-enters that boundary.

The signed Swift test covers exact, latest, and version-family classification for Grok 4.7, Grok 4.6, and Grok 4.5 plus the final reasoning-object value. A source-contract test verifies the single endpoint and final serializer guard. Native debug payloads expose the applied effort on success and failure.

The runtime catalog is filtered to provider-shaped `grok-*` language models with text output. Provider aliases for curated Grok 4.7, Grok 4.6, and Grok 4.5 choices are canonicalized rather than duplicated. Grok 4.20, Grok Build, Imagine, and voice models are not valid timestamp/summary choices. Former saved 4.20 or `grok-build-0.1` settings automatically normalize to Grok 4.7 when the app or extension loads settings.

For xAI's current model catalog and pricing, consult the official [models page](https://docs.x.ai/developers/models) and [pricing page](https://docs.x.ai/developers/pricing).

### Prompt-caching decision

The extension does not currently assign a Responses API `prompt_cache_key`. The old per-request random `x-grok-conv-id` header was removed: xAI documents that header for Chat Completions, while this extension uses the Responses endpoint, where `prompt_cache_key` is the relevant control.

Prompt caching helps when consecutive requests share a long, byte-identical starting prefix. It has limited value in the current product flow because the transcript is unique per video, Chapters and Summary use different prompts, and a successful result is already cached locally so the same video/model request normally does not reach xAI twice. A useful implementation would first separate stable instructions from transcript-only input, choose stable keys scoped by model and task kind, and then verify a meaningful nonzero `cached_tokens` count in the new diagnostics. Adding a key without those measurements could create complexity without reducing the first generation's latency, because a cache can only accelerate a later matching request.

### Grok 4.5 latency decision — 2026-07-20

Before the explicit effort setting, one representative video took about 36 seconds with Grok 4.5 and 9 seconds with Grok 4.3. After Grok 4.5 was changed from xAI's implicit high reasoning to explicit low reasoning, an early hands-on comparison took about 14 seconds with Grok 4.5 and 7 seconds with Grok 4.3. Broader follow-up testing then found that Grok 4.5 was, in most cases, only about 20% slower than Grok 4.3 while continuing to produce better perceived chapter quality. That speed/quality balance supported Grok 4.5 as the default until Grok 4.6 became the new default on August 12, 2026.

These are practical observations, not a controlled benchmark: provider load, transcript length, language, and video structure can change timings. The app therefore keeps elapsed time in the result caption and retains internal first-output/token diagnostics, but does not add a benchmark screen, persistent test recorder, adaptive reasoning policy, priority tier, or prompt-cache key. Grok 4.3 remains available for people who prefer the fastest option. Revisit this decision only if future testing shows a material quality regression or the typical latency gap grows substantially beyond the observed roughly 20%.

### Grok 4.6 default and reasoning decision — 2026-08-12

Grok 4.6 replaced Grok 4.5 as the built-in default after xAI published the `grok-4.6` model. xAI documents that omitted reasoning effort defaults to high, while low is intended for latency-sensitive use. Initial hands-on generation through this extension found the implicit high setting unacceptably slow, so Grok 4.6 sends explicit low reasoning for both Chapters and Summary. Grok 4.6 remained the default until Grok 4.7 became available. See xAI's [Grok 4.6 model page](https://docs.x.ai/developers/models/grok-4.6) and [reasoning controls](https://docs.x.ai/developers/model-capabilities/text/reasoning).

### Grok 4.7 default and reasoning decision — 2026-09-24

Grok 4.7 replaces Grok 4.6 as the built-in default. xAI documents `low`, `medium`, `high`, and `xhigh` for Grok 4.7, with `high` as the provider default and no option to disable reasoning. Because this extension is latency-sensitive and Grok 4.6's implicit high effort was already too slow in hands-on use, Grok 4.7 starts with explicit low reasoning rather than repeating that experiment. Existing valid selections remain unchanged, so upgrades do not silently replace a person's selected Grok 4.6, 4.5, or 4.3 model. See xAI's [Grok 4.7 model page](https://docs.x.ai/developers/models/grok-4.7), [announcement](https://x.ai/news/grok-4-7), and [reasoning controls](https://docs.x.ai/developers/model-capabilities/text/reasoning).

### Grok 4.7 live validation — 2026-09-24

The opt-in signed-Debug smoke test used the existing xAI OAuth session from the app's Keychain and passed the production Chapters and Summary paths. Both responses reported `grok-4.7`, and both request diagnostics reported `reasoningEffort: low`. The synthetic transcript checks also confirmed chronological grounded chapters and a summary covering the supplied subject.

| Path | Total | First output | Input tokens | Output tokens | Reasoning tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chapters | 13,721 ms | 13,069 ms | 1,535 | 941 | 866 |
| Summary | 3,346 ms | 1,388 ms | 1,434 | 216 | 56 |

Run the same guarded check with:

```sh
TEST_RUNNER_YTS_GROK_MODEL_SMOKE=1 xcodebuild test \
  -project 'YouTube Timestamps and Summaries.xcodeproj' \
  -scheme 'YouTube Timestamps and Summaries' \
  -configuration Debug \
  -destination 'platform=macOS' \
  -only-testing:'YouTube Timestamps and SummariesTests'
```

The `TEST_RUNNER_` prefix is required so Xcode forwards the flag to the signed test host. Credentials remain in Keychain; metrics and generated text are stored only as Xcode result attachments.

## xAI Catalog Check — 2026-09-24

xAI's catalog can change, so its official pages above are the source of truth. At the time of this check, the official models page presented these primary offerings:

- text/chat: `grok-4.7` is the current flagship; the app retains `grok-4.6`, `grok-4.5`, and `grok-4.3`
- code-specific pricing still lists `grok-build-0.1`
- image and video: `grok-imagine-image-quality`, `grok-imagine-image`, `grok-imagine-video-1.5`, and `grok-imagine-video`
- voice: realtime agent, realtime text input, text-to-speech, and speech-to-text (REST and streaming)

The official pricing page also listed three old 4.20 text model identifiers: `grok-4.20-multi-agent-0309`, `grok-4.20-0309-reasoning`, and `grok-4.20-0309-non-reasoning`. Image, video, voice, Build, and 4.20 offerings are not integrated in this Safari extension. Account-scoped text-output Grok models can appear in the companion app when xAI returns them from `/v1/language-models`.

## Regression Check

Before a release, run one fresh xAI authorization through Safari. Success requires Safari to display the local completion page, the app to change to `Grok is connected.`, and a generated request to succeed without pasting the callback. If a failure recurs, first verify that the manual completion path still works, then capture the `GrokOAuthCallback` unified-log category; those logs record listener/connection/response stages without recording OAuth state or authorization codes. Keep any further work contained to the app process: do not introduce a helper, Login Item, or system-wide service merely to work around the callback.
