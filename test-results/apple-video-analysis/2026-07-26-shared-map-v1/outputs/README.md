# Output file legend

Each numbered video folder contains:

1. `01-chapters-only.txt`: chapters from the new video-map pipeline when Apple Intelligence is asked to create chapters only.
2. `02-separate-chapters.txt`: the chapter half of the separate comparison. It reuses the exact chapters-only result above, so files 01 and 02 are intentionally identical.
3. `03-separate-summary.md`: summary from the existing Apple Intelligence summary pipeline, run separately from chapters.
4. `04-shared-chapters.txt`: chapters from the new shared run, where a single grounded video map supplies both chapters and the summary.
5. `05-shared-summary.md`: summary composed from that shared grounded video map.
6. `06-shared-grounded-map.txt`: diagnostic semantic map behind files 04 and 05: extracted topics, factual points, and timestamp-anchored chapter candidates.

The comparison is therefore:

- Separate: files 02 + 03
- Shared: files 04 + 05
- Chapters-only quality check: file 01
- Shared diagnostic evidence: file 06
