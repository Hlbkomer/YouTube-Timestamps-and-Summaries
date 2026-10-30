# Provider Model Catalogs

The companion app keeps its provider model pickers current through two deliberately different paths. The Safari extension still validates every saved selection locally, so a catalog refresh is never required to generate with a previously selected supported model.

## Grok

When a Grok account is connected, the companion app requests the account-scoped catalog from xAI's `https://api.x.ai/v1/language-models` endpoint. It keeps only `grok-*` entries that accept text input and return text output, then merges them with the built-in Grok 4.7, Grok 4.6, Grok 4.5, and Grok 4.3 fallback choices. Provider aliases such as `grok-4.7-latest`, `grok-4.6-latest`, and `grok-4.5-latest` are represented by their curated choices instead of appearing as duplicates. The final picker is sorted by model version from highest to lowest rather than relying on xAI's response order. Grok 4.7 is the default; Grok 4.7, Grok 4.6, and Grok 4.5 always use explicit low reasoning.

Grok 4.20, Grok Build, Imagine, and voice models are excluded because they are not suitable choices for transcript timestamps and summaries. A saved excluded model is normalized to Grok 4.7 when settings load. If xAI's catalog cannot be reached, the static fallback remains available.

## ChatGPT / Codex

The ChatGPT integration uses the user's ChatGPT/Codex OAuth session and the Codex Responses backend. It does not use the public OpenAI API model-list endpoint, so the app cannot safely infer which ChatGPT model IDs the account can use from a public API response.

Instead, the companion app starts with a tested local fallback list and retrieves this repository's [`model-catalog.json`](model-catalog.json) from the `main` branch. The remote catalog is cached in memory for one hour. Failed requests are retried after 15 minutes, and the local fallback list remains usable while a request fails. The catalog request contains no transcript, video URL, or provider sign-in token.

The picker offers exactly two models: **GPT-6.1 Sol** (`gpt-6.1-sol`, flagship) and **GPT-6 Luna** (`gpt-6-luna`, fast and economical, the default). Both are available for Chapters and Summary independently, and both use explicit `reasoning: {"effort": "low"}` on the Codex Responses request. Sol always reasons and rejects `none`; neither request sends temperature, top_p, or logprobs, and no output-token limit is set by the app. Per OpenAI's public API documentation both models have a 1,050,000-token context window and 128,000 maximum output tokens (Luna $0.10 input / $0.50 output per 1M tokens, Sol $2 / $10).

GPT-6 Luna is the default ChatGPT model when there is no valid saved selection, including fresh installs and reset settings. Upgrades preserve a saved GPT-6.1 Sol or GPT-6 Luna choice. Every retired OpenAI ID (GPT-6 Astra, the GPT-5.x family including 5.6 Sol/Terra/Luna, GPT-4.x, GPT-3.x) and any non-`gpt-` or empty value is unsupported, so saved settings with those IDs fall back to GPT-6 Luna; for Summary the fallback is the Chapters model. All of them are listed in the catalog's `excludedModelIDs` so refreshed builds stop offering them as fallback choices.

This app still sends requests through the separate Codex backend (ChatGPT OAuth), not the public OpenAI API, so the public API names and availability are the authority for the IDs but a representative request against the Codex endpoint is required before relying on them. Future `gpt-*` IDs added through the remote catalog (other than retired prefixes) are still accepted.

### Updating `model-catalog.json`

1. Confirm the model ID and intended availability from OpenAI's official documentation and with the ChatGPT/Codex backend used by this app. Do not assume a public API alias is accepted by that backend.
2. Add the model to the `openaiCodex.models` array with an `id` beginning with `gpt-` and a clear picker `label`.
3. Set `enabled` to `false` to temporarily retain an entry without showing it. Use `excludedModelIDs` or `excludedModelIDPrefixes` to remove matching built-in fallback options.
4. Update `updatedAt`, run the macOS test suite, and merge the change into `main`.

The catalog must be on `main` before existing app builds can receive it. They load it the next time the companion app refreshes its state, subject to the one-hour in-memory cache. New `gpt-*` choices are intentionally preserved by settings validation so app releases do not normalize a catalog-added model away.

## Catalog Format

```json
{
  "version": 1,
  "updatedAt": "YYYY-MM-DD",
  "providers": {
    "openaiCodex": {
      "models": [
        { "id": "gpt-6.1-sol", "label": "GPT-6.1 Sol" },
        { "id": "gpt-6-luna", "label": "GPT-6 Luna" }
      ],
      "excludedModelIDs": ["gpt-6-astra", "gpt-5.6", "gpt-5.5"],
      "excludedModelIDPrefixes": []
    }
  }
}
```

`version` documents the file format. The current app requires `providers.openaiCodex.models`; unknown fields are ignored. Each model needs an `id` and `label`; `enabled` is optional and defaults to `true`. Keeping retired IDs in `excludedModelIDs` also removes them from the static fallback list in older app builds after they refresh the catalog.


## Gemini and Summary ordering

The Gemini catalog contains Gemini 4 Argon (`gemini-4-argon`), Gemini Flash latest (`gemini-flash-latest`, default), and Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`). All three use explicit low thinking for Chapters and Summary. The curated order places Argon first, then Flash latest, then Lite; the latest alias has no numeric version to sort. Arbitrary Gemini IDs are rejected; unsupported settings use the existing generic default fallback without model-specific migrations.

Summary groups follow provider names alphabetically: Apple Intelligence, when available, precedes the selected cloud provider. Within that provider, models appear newest first, using the existing numeric version ordering for ChatGPT and Grok and the curated Gemini order above. Reordering options does not change the selected Summary or Chapters model.
