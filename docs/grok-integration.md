# Grok Integration Notes

## Purpose

Grok support uses the person's own xAI/SuperGrok sign-in. It is not an xAI API-key integration and does not invoke the Grok command-line client.

The implementation is deliberately a single sandboxed app-and-extension build:

- the macOS companion app starts the browser sign-in initiated by the person
- the app and Safari extension share the resulting OAuth tokens through the app group container
- the Safari extension calls the xAI Responses endpoint directly over HTTPS
- there is no bundled helper, background service, Login Item, `osascript`, or developer-operated backend

## OAuth Design

The companion app discovers xAI's OAuth endpoints, creates a fresh PKCE verifier, state, nonce, and authorization request, and opens that request in the browser. The normal redirect target is `http://127.0.0.1:56121/callback`.

The loopback listener exists only for this person-initiated sign-in. The app supplies xAI's generic OAuth-plan request parameter and includes the PKCE challenge fields in the authorization-code exchange, matching the behavior researched from Hermes without impersonating Hermes.

The OAuth session is short-lived (15 minutes). Its state, PKCE verifier, authorization code, and any pasted callback URL remain in memory only and are never written to app settings or the shared token store.

## Observed Loopback Issue

On the macOS 27 beta test system, the xAI approval page briefly proceeds after **Allow**, then Safari reports that it cannot connect to `127.0.0.1:56121`. This happened repeatedly with the normal callback listener active.

We do not yet know whether the cause is a macOS/Safari beta regression, a sandbox/network behavior, or a difference in xAI's redirect handling. Do not state that the automatic callback is fixed, and do not attribute the cause to the OS beta without a focused reproduction.

## Implemented Fallback

When sign-in starts, the companion app now shows a field for the complete callback URL or the one-time authorization code.

1. Start **Sign in with Grok**.
2. Approve the xAI request in Safari.
3. If Safari cannot open the local callback page, copy the full failed callback URL from Safari, or copy the authorization code that xAI displays.
4. Paste it into the app and choose **Complete Sign-In**.

For a full callback URL, the app verifies the original OAuth `state` value before exchanging the code. A bare one-time code is bound to the same in-memory PKCE verifier. The code is not saved and can be used only during that short-lived sign-in session.

This fallback was successfully tested: the pasted callback completed sign-in and Grok generated YouTube timestamps. It is a workaround; the automatic local callback remains a follow-up issue.

## Model Policy

xAI describes `grok-4.5` as its current frontier model for coding, agentic tasks, and knowledge work. This app defaults Grok timestamps and selected-provider summaries to `grok-4.5`, keeps `grok-4.3` available as a fallback, and refreshes the connected account's text-input/text-output Grok model list from `https://api.x.ai/v1/language-models` when possible.

The runtime catalog is filtered to provider-shaped `grok-*` language models with text output. Grok 4.20, Grok Build, Imagine, and voice models are not valid timestamp/summary choices. Former saved 4.20 or `grok-build-0.1` settings automatically fall back to `grok-4.5` when the app or extension loads settings.

For xAI's current model catalog and pricing, consult the official [models page](https://docs.x.ai/developers/models) and [pricing page](https://docs.x.ai/developers/pricing).

## xAI Catalog Check — 2026-07-09

xAI's catalog can change, so its official pages above are the source of truth. At the time of this check, the official models page presented these primary offerings:

- text/chat: `grok-4.5` and `grok-4.3`
- code-specific pricing still lists `grok-build-0.1`
- image and video: `grok-imagine-image-quality`, `grok-imagine-image`, `grok-imagine-video-1.5`, and `grok-imagine-video`
- voice: realtime agent, realtime text input, text-to-speech, and speech-to-text (REST and streaming)

The official pricing page also listed three old 4.20 text model identifiers: `grok-4.20-multi-agent-0309`, `grok-4.20-0309-reasoning`, and `grok-4.20-0309-non-reasoning`. Image, video, voice, Build, and 4.20 offerings are not integrated in this Safari extension. Account-scoped text-output Grok models can appear in the companion app when xAI returns them from `/v1/language-models`.

## Follow-Up

Investigate the automatic callback with a minimal reproduction on the affected macOS/Safari beta, including listener readiness, loopback reachability from Safari, and sandbox behavior. Keep this diagnostic work contained to the app process: do not introduce a helper, Login Item, or system-wide service merely to work around the callback.
