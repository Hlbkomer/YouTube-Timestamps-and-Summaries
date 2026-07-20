# Provider Model Catalogs

The companion app keeps its provider model pickers current through two deliberately different paths. The Safari extension still validates every saved selection locally, so a catalog refresh is never required to generate with a previously selected supported model.

## Grok

When a Grok account is connected, the companion app requests the account-scoped catalog from xAI's `https://api.x.ai/v1/language-models` endpoint. It keeps only `grok-*` entries that accept text input and return text output, then merges them with the built-in Grok 4.5 and Grok 4.3 fallback choices. The final picker is sorted by model version from highest to lowest rather than relying on xAI's response order.

Grok 4.20, Grok Build, Imagine, and voice models are excluded because they are not suitable choices for transcript timestamps and summaries. A saved excluded model is normalized to Grok 4.5 when settings load. If xAI's catalog cannot be reached, the static fallback remains available.

## ChatGPT / Codex

The ChatGPT integration uses the user's ChatGPT/Codex OAuth session and the Codex Responses backend. It does not use the public OpenAI API model-list endpoint, so the app cannot safely infer which ChatGPT model IDs the account can use from a public API response.

Instead, the companion app starts with a tested local fallback list and retrieves this repository's [`model-catalog.json`](model-catalog.json) from the `main` branch. The remote catalog is cached in memory for one hour. Failed requests are retried after 15 minutes, and the local fallback list remains usable while a request fails. The catalog request contains no transcript, video URL, or provider sign-in token.

The public OpenAI Responses API documents `gpt-5.6` as an alias for Sol, but this extension sends ChatGPT OAuth requests to the separate Codex backend. The Codex backend catalog uses the explicit `gpt-5.6-sol` slug and rejects the family alias with HTTP 400. The picker therefore stores and sends `gpt-5.6-sol`; app settings, remote catalog entries, and the final native request boundary all migrate a legacy saved `gpt-5.6` selection to that explicit slug. `gpt-5.6-terra` and `gpt-5.6-luna` remain separate entries. The OpenAI [GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/model-guidance?model=gpt-5.6) remains the authority for public API naming and availability, while a representative request against this app's Codex endpoint is required before publishing a picker entry.

GPT-5.6 Terra is the app's default ChatGPT model because testing found it the preferred quality/speed balance alongside the default Grok 4.5 low-reasoning configuration. This default applies when there is no valid saved ChatGPT selection, including fresh installs and reset settings. Upgrades preserve a person's existing valid Sol, Terra, Luna, or other supported choice rather than silently replacing it.

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
        { "id": "gpt-5.6-sol", "label": "GPT-5.6 Sol" }
      ],
      "excludedModelIDs": ["gpt-5.6"],
      "excludedModelIDPrefixes": []
    }
  }
}
```

`version` documents the file format. The current app requires `providers.openaiCodex.models`; unknown fields are ignored. Each model needs an `id` and `label`; `enabled` is optional and defaults to `true`. Keeping the obsolete Sol alias in `excludedModelIDs` also removes it from the static fallback list in older app builds after they refresh the catalog.
