---
title: Timestamps & Summaries for YT
description: Chapters and summaries for YouTube, built into Safari.
---

<style>
  .markdown-body { max-width: none; }
  .yts-home { color: #172033; }
  .yts-home * { box-sizing: border-box; }
  .yts-home img { display: block; width: 100%; margin: 0; border: 0; }
  .yts-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr);
    gap: clamp(2rem, 6vw, 5rem);
    align-items: center;
    padding: clamp(2.5rem, 7vw, 6rem) 0;
  }
  .yts-kicker {
    margin: 0 0 .8rem;
    color: #1764a8;
    font-size: .8rem;
    font-weight: 800;
    letter-spacing: .12em;
    text-transform: uppercase;
  }
  .yts-hero h1 {
    margin: 0;
    color: #121a2b;
    font-size: clamp(2.5rem, 6vw, 5.25rem);
    line-height: .98;
    letter-spacing: -.055em;
  }
  .yts-lede {
    max-width: 42rem;
    margin: 1.5rem 0 0;
    color: #536077;
    font-size: clamp(1.05rem, 2vw, 1.35rem);
    line-height: 1.55;
  }
  .yts-actions { display: flex; flex-wrap: wrap; gap: .8rem; margin-top: 1.8rem; }
  .yts-button {
    display: inline-flex;
    align-items: center;
    min-height: 46px;
    padding: .72rem 1.15rem;
    border: 1px solid #d9e0e9;
    border-radius: 12px;
    background: #fff;
    color: #172033 !important;
    font-weight: 750;
    text-decoration: none !important;
  }
  .yts-button-primary { border-color: #155da2; background: #155da2; color: #fff !important; }
  .yts-proof { display: flex; flex-wrap: wrap; gap: .55rem; margin-top: 1.2rem; color: #69758a; font-size: .88rem; }
  .yts-proof span { padding: .34rem .58rem; border-radius: 999px; background: #f2f6fa; }
  .yts-window {
    overflow: hidden;
    border: 1px solid #dce2e9;
    border-radius: 22px;
    background: #f5f7f9;
    box-shadow: 0 28px 65px rgba(23, 32, 51, .16);
  }
  .yts-section { padding: clamp(2.8rem, 7vw, 6rem) 0; border-top: 1px solid #e8ecf1; }
  .yts-section h2 { margin: 0; color: #121a2b; font-size: clamp(2rem, 4vw, 3.4rem); line-height: 1.05; letter-spacing: -.04em; }
  .yts-section-lede { max-width: 48rem; margin: 1rem 0 2rem; color: #5d687c; font-size: 1.1rem; line-height: 1.65; }
  .yts-showcase { overflow: hidden; border: 1px solid #dce2e9; border-radius: 20px; box-shadow: 0 24px 58px rgba(23, 32, 51, .12); }
  .yts-gallery { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
  .yts-gallery figure { margin: 0; }
  .yts-gallery figcaption { margin-top: .65rem; color: #69758a; font-size: .9rem; }
  .yts-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
  .yts-card { padding: 1.35rem; border: 1px solid #e1e6ec; border-radius: 16px; background: #fff; }
  .yts-card h3 { margin: 0 0 .55rem; color: #172033; font-size: 1.08rem; }
  .yts-card p { margin: 0; color: #667287; line-height: 1.55; }
  .yts-release {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 1.5rem;
    align-items: center;
    padding: clamp(1.5rem, 4vw, 2.4rem);
    border-radius: 20px;
    background: linear-gradient(135deg, #12233d, #165f9e);
    color: #fff;
  }
  .yts-release h2 { color: #fff; }
  .yts-release p { max-width: 43rem; margin: .8rem 0 0; color: #dbeafb; line-height: 1.55; }
  .yts-release .yts-button { border-color: #fff; background: #fff; }
  .yts-links { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 1.6rem; }
  @media (max-width: 780px) {
    .yts-hero, .yts-gallery, .yts-grid, .yts-release { grid-template-columns: 1fr; }
    .yts-release { align-items: start; }
    .yts-hero-art { order: -1; max-width: 34rem; }
  }
</style>

<div class="yts-home">
  <section class="yts-hero">
    <div>
      <p class="yts-kicker">Safari extension for macOS</p>
      <h1>Better YouTube Chapters</h1>
      <p class="yts-lede">Timestamps &amp; Summaries for YT adds clean Chapters and Summary views directly to YouTube’s own <em>In this video</em> panel. Jump to the right moment, skim the key ideas, or read the transcript without leaving the page.</p>
      <div class="yts-actions">
        <a class="yts-button yts-button-primary" href="https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/releases/latest/download/Timestamps-and-Summaries-for-YT.zip">Download version 1.2</a>
        <a class="yts-button" href="https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/releases/tag/v1.2">What’s new</a>
      </div>
      <div class="yts-proof"><span>Signed &amp; notarized</span><span>Local or cloud models</span><span>No developer backend</span><span>macOS 26.4+</span></div>
    </div>
    <div class="yts-window yts-hero-art">
      <img src="readme-assets/companion-app.png" alt="Companion app showing Gemini Flash latest, Apple Intelligence Summary, and connected ChatGPT, Grok, and Gemini providers">
    </div>
  </section>

  <section class="yts-section">
    <p class="yts-kicker">One familiar panel</p>
    <h2>Chapters, summaries, and transcripts—together.</h2>
    <p class="yts-section-lede">Version 1.2 keeps the extension inside YouTube’s native panel whenever that surface is available. Creator chapters, automatic Key moments, and transcript-generated chapters share one compact view, and the current chapter follows playback.</p>
    <div class="yts-showcase">
      <img src="readme-assets/youtube-sidebar.png" alt="Chapters integrated into YouTube's native panel">
    </div>
  </section>

  <section class="yts-section">
    <p class="yts-kicker">Built for different ways of watching</p>
    <p class="yts-section-lede">Interface previews below use example video content.</p>
    <div class="yts-gallery">
      <figure>
        <img class="yts-showcase" src="readme-assets/youtube-sidebar.png" alt="Generated chapters with clickable transcript-aligned timestamps">
        <figcaption>Clickable chapters aligned back to real transcript cue times.</figcaption>
      </figure>
      <figure>
        <img class="yts-showcase" src="readme-assets/youtube-summary.png" alt="A structured video summary inside YouTube's native panel">
        <figcaption>A reader-friendly summary beside YouTube’s own Transcript.</figcaption>
      </figure>
    </div>
  </section>

  <section class="yts-section">
    <div class="yts-grid">
      <article class="yts-card"><h3>Use YouTube’s chapters</h3><p>Creator chapters and automatic Key moments appear in the same compact format, with an inline option to generate your own when needed.</p></article>
      <article class="yts-card"><h3>Choose local or cloud summaries</h3><p>Keep summaries on the Mac with Apple Intelligence, or use ChatGPT/Codex, Grok, or Gemini. ChatGPT and Grok use subscription sign-in; Gemini uses your Google AI Studio API key, stored in macOS Keychain.</p></article>
      <article class="yts-card"><h3>Fast defaults, flexible choices</h3><p>Choose GPT-6 Luna, GPT-6.1 Sol, Grok, or Gemini. Gemini defaults to Flash latest, with Flash-Lite and Argon also available. Pick Chapters and Summary models independently, with low thinking for all Gemini models. Existing valid selections remain unchanged when upgrading.</p></article>
      <article class="yts-card"><h3>One shared transcript</h3><p>Chapters and Summary share one caption fetch, while generated times are validated against the original transcript cues.</p></article>
      <article class="yts-card"><h3>Safe YouTube navigation</h3><p>Results are tied to the current video so old chapters cannot leak into the next watch page during YouTube’s single-page navigation.</p></article>
      <article class="yts-card"><h3>Caption-aware behavior</h3><p>Videos without a usable transcript stay untouched, including livestreams that have ended but whose captions are still processing.</p></article>
    </div>
  </section>

  <section class="yts-section">
    <div class="yts-release">
      <div>
        <p class="yts-kicker" style="color:#9dccf4">Version 1.2</p>
        <h2>Ready for a cleaner YouTube workflow.</h2>
        <p>Download the signed and notarized macOS app. Unzip it, drag the app onto the included <strong>Applications</strong> shortcut, open it once, and enable the extension in Safari Settings.</p>
      </div>
      <a class="yts-button" href="https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/releases/latest/download/Timestamps-and-Summaries-for-YT.zip">Download for Mac</a>
    </div>
    <div class="yts-links">
      <a href="mailto:hlbkomer@gmail.com">Contact support</a>
      <a href="support.html">Setup &amp; support</a>
      <a href="privacy.html">Privacy Policy</a>
      <a href="terms.html">Terms of Service</a>
      <a href="https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/issues">Support &amp; issue tracker</a>
      <a href="https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries">Source code</a>
    </div>
  </section>
</div>
