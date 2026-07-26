# Apple Intelligence shared video-map test

This folder contains the internal ten-video comparison described in `docs/apple-intelligence-video-map.md`.

- `comparison.md`: concise timing and success table.
- `metrics.json`: machine-readable aggregate and per-video metrics.
- `manifest.json`: the ten-video corpus.
- `outputs/<number-description-video-id>/`: readable chapters, separate/shared summaries, and the shared grounded map. See `outputs/README.md` for the six-file legend.
- `raw-results/<number-description-video-id>/`: complete response and debug payloads.
- `sources/`: the two additional transcripts fetched for this run. The other eight reuse the stored provider-test corpus through manifest-relative paths.

The separate approach is:

`chapters-only map + current adaptive Apple summary`

The shared approach is:

`one anchored transcript map -> deterministic chapters + summary composition`

All generation ran locally on the same M1 Max machine.

The two videos added after the earlier eight-video provider-prompt corpus are:

- `09-asmongold-hasan-commentary-CMQwmnd3Ak8`: “Asmongold’s Girlfriend Just Destroyed Hasan..” by MorePegasus, 34:30.
- `10-nuxanor-commentary-425R4PQ5svQ`: “FAIRNESS IS IRRELEVANT... ONLY VICTORY MATTERS.” by Nuxanor, 2:17:04.
