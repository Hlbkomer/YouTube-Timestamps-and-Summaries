# Apple Intelligence shared video-map comparison

All timings are wall-clock seconds on the same M1 Max test machine. Calls are local Apple Intelligence model calls.

| Video | Duration | Chapters map → lean | Map chapters | Lean chapters | Lean faster | Stored summary | Optimized separate | Shared | Shared faster |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 04-news-Z1sUt6gAbUg | 3:47 | 2 → 1 | 7.6s / 1 | 4.5s / 1 | 40.9% | 10.9s / 1 | 15.4s / 2 | 8.9s / 2 | 42.0% |
| 01-movie-review-b_W0z6hZlrI | 12:07 | 5 → 3 | 22.1s / 2 | 15.0s / 2 | 32.2% | 16.2s / 3 | 31.2s / 5 | 26.2s / 3 | 16.0% |
| 05-lux-UvjW6qASU48 | 29:23 | 7 → 5 | 37.6s / 5 | 30.3s / 4 | 19.3% | 32.3s / 5 | 62.7s / 9 | 40.7s / 6 | 35.0% |
| 09-asmongold-hasan-commentary-CMQwmnd3Ak8 | 34:30 | 8 → 6 | 47.6s / 6 | 36.9s / 5 | 22.4% | 37.3s / 5 | 74.2s / 10 | 53.8s / 7 | 27.5% |
| 02-openai-interview-VZTmS4B840k | 44:40 | 10 → 7 | 52.9s / 7 | 46.0s / 6 | 13.2% | 42.2s / 6 | 88.2s / 12 | 58.4s / 8 | 33.7% |
| 07-politics-EfKReR8i6W0 | 52:54 | 9 → 7 | 52.5s / 7 | 39.6s / 5 | 24.5% | 41.8s / 6 | 81.4s / 11 | 58.6s / 8 | 28.1% |
| 06-mma-betting-n6CNgAtdMw0 | 1:31:18 | 16 → 15 | 121.8s / 15 | 103.3s / 13 | 15.2% | 92.1s / 12 | 195.4s / 25 | 137.9s / 16 | 29.4% |
| 03-crypto-WsCf_rCJxnM | 1:56:16 | 16 → 16 | 162.0s / 20 | 126.0s / 16 | 22.2% | 127.0s / 15 | 253.1s / 31 | 186.4s / 21 | 26.4% |
| 10-nuxanor-commentary-425R4PQ5svQ | 2:17:04 | 20 → 18 | 183.2s / 21 | 136.4s / 17 | 25.6% | FAILED after 125.8s | FAILED | 178.9s / 22 | n/a |
| 08-joe-rogan-Lb_1d68vx-g | 2:59:38 | 20 → 20 | 198.2s / 24 | 160.7s / 20 | 18.9% | 147.8s / 18 | 308.6s / 38 | 220.5s / 25 | 28.5% |

## Aggregate

- Map-based chapters-only: 10/10 succeeded
- Lean chapters-only: 10/10 succeeded
- Separate chapters + existing summary: 9/10 succeeded
- Shared chapters + summary: 10/10 succeeded
- Across all 10 videos, lean chapters took 698.8 seconds versus 885.5 seconds for map-based chapters: 21.1% faster
- Lean chapters used 89 model calls versus 108: 19 fewer calls
- Lean generated 98 final chapters versus 113 for the map-based path
- Across the 9 videos with a usable stored Apple summary, shared processing took 791.3 seconds versus an estimated 1110.1 seconds for lean chapters plus that stored summary: 28.7% faster
- Shared used 96 model calls versus an estimated 143: 47 fewer calls
- The separate path failed on 425R4PQ5svQ because the existing adaptive summary repeatedly returned model-internal `TOOL CALL` text on chunk 15 of 15. The shared compact map succeeded on the same transcript.

Map-based chapters and all summary/shared values are reused from the earlier run. Only lean chapters were regenerated.

See `outputs/<number-description-video-id>/07-lean-chapters-only.txt` for the new readable chapter lists. See `raw-results/<number-description-video-id>/leanChaptersOnly.json` for complete response metadata.
