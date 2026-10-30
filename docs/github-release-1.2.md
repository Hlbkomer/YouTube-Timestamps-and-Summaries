# Timestamps & Summaries for YT 1.2

Version 1.2 adds Gemini support and improves chapters, summaries, and reliability around YouTube's changing panel layouts.

## Highlights

- Gemini is now available for Chapters and Summary using your own Google AI Studio API key. Choose Flash latest (the default), Flash-Lite, or Gemini 4 Argon, all with explicit low thinking. Keys are stored in macOS Keychain; Gemini API usage is billed to your Google project and can use eligible activated developer credits.
- Gemini result notes show the actual model version returned by Google. Chapters accept Markdown-wrapped timestamps and equivalent clock formatting while still rejecting times that do not match transcript cues.

- Grok 4.7 is the new Grok default and uses explicit low reasoning for responsive Chapters and Summary generation. Grok 4.6 and Grok 4.5 keep the same low-reasoning path, and Grok 4.3 remains available.
- GPT-6 Luna is the new ChatGPT/Codex default for fresh or reset settings, and GPT-6.1 Sol is available as the flagship choice for Chapters and Summary. Existing valid model selections are preserved when upgrading.
- Retired ChatGPT models (GPT-5.x and GPT-6 Astra) have been removed from the picker. Old settings for them use the current GPT-6 Luna default.
- Apple Intelligence summaries on macOS 27 use the quality-focused adaptive grounded pipeline, with stricter output validation and deterministic recovery for long videos. The established macOS 26 path remains available.
- ChatGPT, Grok, and Gemini use the shared provider-summary prompt, preventing their instructions from drifting apart.
- Settings lists providers alphabetically and Summary choices by provider, with newer models first within each provider. Saved Gemini keys stay locked until removed, simplifying replacement.

## YouTube reliability

- Prevents YouTube's Description panel from appearing in place of the extension on captionless videos and just-finished livestreams whose captions are still processing.
- Prefers fresh YouTube caption URLs, while retaining the existing transcript sources as fallbacks.
- Shares one transcript fetch across Chapters, Summary, and later manual chapter generation.
- Keeps generation completion, tab state, source switching, and results stable across repeated tab changes and YouTube watch-to-watch navigation.
- Keeps Chapters, Summary, and YouTube's native Transcript together; hides the Timeline tab to keep the sidebar focused.
- Recovers from temporary Safari background-page suspension instead of immediately failing a generation or reporting a disconnected provider.

## Install and update

1. Download `Timestamps-and-Summaries-for-YT.zip` below.
2. Unzip it and drag **Timestamps & Summaries for YT** onto the included **Applications** shortcut. Replace the previous app when updating.
3. Open the app once, then enable or confirm the extension in Safari Settings.

The update preserves valid provider, model, summary, and chapter-source settings. If ChatGPT or Grok appears disconnected after updating, reconnect that provider once in the companion app.

Gemini requires a Google AI Studio API key and eligible Gemini API access; a Gemini app subscription alone is not used for authentication.

Requires macOS 26.4 or later. Generated output can be incomplete or inaccurate, and videos need captions or an available transcript for generated Chapters and Summary.

For the complete technical history, see the [changelog](https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/blob/main/CHANGELOG.md).
