# Apple Intelligence shared video-map comparison

All timings are wall-clock seconds on the same M1 Max test machine. Calls are local Apple Intelligence model calls.

| Video | Duration | Chapters | Separate time / calls | Shared time / calls | Shared faster | Separate summary chars | Shared summary chars |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 01-movie-review-b_W0z6hZlrI | 12:07 | 5 | 38.3s / 5 | 26.2s / 3 | 31.6% | 763 | 1065 |
| 02-openai-interview-VZTmS4B840k | 44:40 | 10 | 95.1s / 13 | 58.4s / 8 | 38.6% | 1238 | 1170 |
| 03-crypto-WsCf_rCJxnM | 1:56:16 | 16 | 289.0s / 35 | 186.4s / 21 | 35.5% | 2239 | 3108 |
| 04-news-Z1sUt6gAbUg | 3:47 | 2 | 18.5s / 2 | 8.9s / 2 | 51.8% | 1686 | 589 |
| 05-lux-UvjW6qASU48 | 29:23 | 7 | 69.9s / 10 | 40.7s / 6 | 41.8% | 1158 | 811 |
| 06-mma-betting-n6CNgAtdMw0 | 1:31:18 | 16 | 213.9s / 27 | 137.9s / 16 | 35.6% | 2060 | 2682 |
| 07-politics-EfKReR8i6W0 | 52:54 | 9 | 94.3s / 13 | 58.6s / 8 | 37.9% | 1463 | 1265 |
| 08-joe-rogan-Lb_1d68vx-g | 2:59:38 | 20 | 346.1s / 42 | 220.5s / 25 | 36.3% | 3339 | 3375 |
| 09-asmongold-hasan-commentary-CMQwmnd3Ak8 | 34:30 | 8 | 84.8s / 11 | 53.8s / 7 | 36.6% | 1171 | 1188 |
| 10-nuxanor-commentary-425R4PQ5svQ | 2:17:04 | 20 | FAILED | 178.9s / 22 | n/a | 0 | 2482 |

## Aggregate

- Chapters-only map: 10/10 succeeded
- Separate chapters + existing summary: 9/10 succeeded
- Shared chapters + summary: 10/10 succeeded
- Across the 9 videos where both full approaches succeeded, shared processing took 791.3 seconds versus 1250.0 seconds separately: 36.7% faster
- Shared used 96 model calls versus 158: 62 fewer calls
- The separate path failed on 425R4PQ5svQ because the existing adaptive summary repeatedly returned model-internal `TOOL CALL` text on chunk 15 of 15. The shared compact map succeeded on the same transcript.

See `outputs/<number-description-video-id>/` for the readable chapters, summaries, and grounded shared map. See `raw-results/<number-description-video-id>/` for complete response metadata.
