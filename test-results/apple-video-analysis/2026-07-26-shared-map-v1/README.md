# Apple Intelligence shared video-map test

This folder contains the internal ten-video comparison described in `docs/apple-intelligence-video-map.md`.

- `comparison.md`: concise timing and success table.
- `metrics.json`: machine-readable aggregate and per-video metrics.
- `manifest.json`: the ten-video corpus.
- `outputs/<video-id>/`: readable chapters, separate/shared summaries, and the shared grounded map.
- `raw-results/<video-id>/`: complete response and debug payloads.
- `sources/`: the two additional transcripts fetched for this run. The other eight reuse the stored provider-test corpus through manifest-relative paths.

The separate approach is:

`chapters-only map + current adaptive Apple summary`

The shared approach is:

`one anchored transcript map -> deterministic chapters + summary composition`

All generation ran locally on the same M1 Max machine.
