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

xAI describes `grok-4.5` as its current frontier model for coding, agentic tasks, and knowledge work. This app defaults Grok timestamps and selected-provider summaries to `grok-4.5`, keeps `grok-4.3` available as a fallback, and refreshes the connected account's text-input/text-output Grok model list from `https://api.x.ai/v1/language-models` when possible.

Grok 4.5 defaults to high reasoning when the request does not specify an effort. The extension explicitly sends `reasoning: { "effort": "low" }` for Grok 4.5 chapter and summary requests because both are constrained, latency-sensitive transformations of a supplied transcript. Grok 4.3 and other model families retain xAI's default until separately measured. The request diagnostics record reasoning effort, time to first output, input/output/total tokens, cached input tokens, reasoning tokens, and service tier whenever xAI returns those fields. This keeps Grok 4.3 available as the lower-latency fallback and makes 4.5 comparisons evidence-based.

A repository-wide request-path audit confirmed that Chapters and selected-provider Summary both route through the same `GrokGenerationService.requestText` builder and that no second xAI generation endpoint exists. The builder adds low reasoning immediately before JSON serialization for the exact `grok-4.5` identifier and version-suffixed forms such as `grok-4.5-latest`; retries re-enter that same path. The signed Swift test covers the model-to-effort policy, while native debug payloads expose the applied effort on success and failure.

The runtime catalog is filtered to provider-shaped `grok-*` language models with text output. Grok 4.20, Grok Build, Imagine, and voice models are not valid timestamp/summary choices. Former saved 4.20 or `grok-build-0.1` settings automatically fall back to `grok-4.5` when the app or extension loads settings.

For xAI's current model catalog and pricing, consult the official [models page](https://docs.x.ai/developers/models) and [pricing page](https://docs.x.ai/developers/pricing).

### Prompt-caching decision

The extension does not currently assign a Responses API `prompt_cache_key`. The old per-request random `x-grok-conv-id` header was removed: xAI documents that header for Chat Completions, while this extension uses the Responses endpoint, where `prompt_cache_key` is the relevant control.

Prompt caching helps when consecutive requests share a long, byte-identical starting prefix. It has limited value in the current product flow because the transcript is unique per video, Chapters and Summary use different prompts, and a successful result is already cached locally so the same video/model request normally does not reach xAI twice. A useful implementation would first separate stable instructions from transcript-only input, choose stable keys scoped by model and task kind, and then verify a meaningful nonzero `cached_tokens` count in the new diagnostics. Adding a key without those measurements could create complexity without reducing the first generation's latency, because a cache can only accelerate a later matching request.

### Observed latency and default decision — 2026-07-20

Before the explicit effort setting, one representative video took about 36 seconds with Grok 4.5 and 9 seconds with Grok 4.3. After Grok 4.5 was changed from xAI's implicit high reasoning to explicit low reasoning, an early hands-on comparison took about 14 seconds with Grok 4.5 and 7 seconds with Grok 4.3. Broader follow-up testing then found that Grok 4.5 was, in most cases, only about 20% slower than Grok 4.3 while continuing to produce better perceived chapter quality. That speed/quality balance is acceptable, so Grok 4.5 remains the default.

These are practical observations, not a controlled benchmark: provider load, transcript length, language, and video structure can change timings. The app therefore keeps elapsed time in the result caption and retains internal first-output/token diagnostics, but does not add a benchmark screen, persistent test recorder, adaptive reasoning policy, priority tier, or prompt-cache key. Grok 4.3 remains available for people who prefer the fastest option. Revisit this decision only if future testing shows a material quality regression or the typical latency gap grows substantially beyond the observed roughly 20%.

## xAI Catalog Check — 2026-07-09

xAI's catalog can change, so its official pages above are the source of truth. At the time of this check, the official models page presented these primary offerings:

- text/chat: `grok-4.5` and `grok-4.3`
- code-specific pricing still lists `grok-build-0.1`
- image and video: `grok-imagine-image-quality`, `grok-imagine-image`, `grok-imagine-video-1.5`, and `grok-imagine-video`
- voice: realtime agent, realtime text input, text-to-speech, and speech-to-text (REST and streaming)

The official pricing page also listed three old 4.20 text model identifiers: `grok-4.20-multi-agent-0309`, `grok-4.20-0309-reasoning`, and `grok-4.20-0309-non-reasoning`. Image, video, voice, Build, and 4.20 offerings are not integrated in this Safari extension. Account-scoped text-output Grok models can appear in the companion app when xAI returns them from `/v1/language-models`.

## Regression Check

Before a release, run one fresh xAI authorization through Safari. Success requires Safari to display the local completion page, the app to change to `Grok is connected.`, and a generated request to succeed without pasting the callback. If a failure recurs, first verify that the manual completion path still works, then capture the `GrokOAuthCallback` unified-log category; those logs record listener/connection/response stages without recording OAuth state or authorization codes. Keep any further work contained to the app process: do not introduce a helper, Login Item, or system-wide service merely to work around the callback.
