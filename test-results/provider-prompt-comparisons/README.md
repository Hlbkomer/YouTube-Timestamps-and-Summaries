# Provider prompt comparisons

This directory keeps reproducible ChatGPT and Grok summary-prompt comparisons.
Each dated run contains its manifest, exact source and model-input transcripts,
reader-facing outputs, raw diagnostics, timing/token metrics, and reviewer
notes.

The production prompt is not changed merely because a comparison exists.
Promoting a candidate prompt remains a separate reviewed code change.

Signed Debug comparison tests can stage outputs in the app's temporary
container and attach aggregate JSON plus CSV metrics to the Xcode result
bundle. `scripts/reconstruct-provider-prompt-results.mjs` reconstructs the
per-video hierarchy in this directory without storing credentials or request
tokens.

Full third-party source transcripts and their timestamp-stripped model-input
copies stay in this local project folder but are intentionally ignored by Git.
This keeps local reruns reproducible without publishing complete video
transcripts when the public repository is pushed.
