import fs from "node:fs";
import path from "node:path";

const root = path.resolve(
  process.argv[2]
    || "test-results/apple-video-analysis/2026-07-26-shared-map-v1",
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);
const rawRoot = path.join(root, "raw-results");
const outputRoot = path.join(root, "outputs");
fs.mkdirSync(outputRoot, { recursive: true });

function load(videoID, approach) {
  return JSON.parse(
    fs.readFileSync(
      path.join(rawRoot, videoID, `${approach}.json`),
      "utf8",
    ),
  );
}

function debug(response) {
  return response?.debug || {};
}

function calls(response) {
  return Number(debug(response).modelCalls || 0);
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${String(text || "").trim()}\n`, "utf8");
}

const rows = [];
for (const video of manifest) {
  const chaptersOnly = load(video.id, "chaptersOnly");
  const separate = load(video.id, "separate");
  const shared = load(video.id, "sharedChaptersSummary");
  const chapterResponse = chaptersOnly.response;
  const separateResponse = separate.response;
  const separateChapterResponse = separateResponse.chapters || {};
  const separateSummaryResponse = separateResponse.summary || {};
  const sharedResponse = shared.response;
  const videoOutputRoot = path.join(outputRoot, video.id);

  writeText(
    path.join(videoOutputRoot, "01-chapters-only.txt"),
    chapterResponse.chaptersText,
  );
  writeText(
    path.join(videoOutputRoot, "02-separate-chapters.txt"),
    separateChapterResponse.chaptersText,
  );
  writeText(
    path.join(videoOutputRoot, "03-separate-summary.md"),
    separateSummaryResponse.text
      || `FAILED: ${separateSummaryResponse.error || separateResponse.error || "unknown error"}`,
  );
  writeText(
    path.join(videoOutputRoot, "04-shared-chapters.txt"),
    sharedResponse.chaptersText,
  );
  writeText(
    path.join(videoOutputRoot, "05-shared-summary.md"),
    sharedResponse.summaryText,
  );
  writeText(
    path.join(videoOutputRoot, "06-shared-grounded-map.txt"),
    [
      "TOPICS",
      debug(sharedResponse).mappedTopics || "",
      "",
      "POINTS",
      debug(sharedResponse).mappedPoints || "",
      "",
      "CHAPTER CANDIDATES",
      debug(sharedResponse).chapterCandidateMap || "",
    ].join("\n"),
  );

  const separateOK = separateResponse.ok === true;
  const sharedOK = sharedResponse.ok === true;
  const separateSeconds = Number(separate.elapsedSeconds || 0);
  const sharedSeconds = Number(shared.elapsedSeconds || 0);
  const speedupPercent = separateOK && sharedOK
    ? ((separateSeconds - sharedSeconds) / separateSeconds) * 100
    : null;
  const separateSummary = String(separateSummaryResponse.text || "");
  const sharedSummary = String(sharedResponse.summaryText || "");

  rows.push({
    id: video.id,
    title: video.title,
    duration: video.duration,
    chapterOnlyOK: chapterResponse.ok === true,
    chapterSeconds: Number(chaptersOnly.elapsedSeconds || 0),
    chapterCalls: calls(chapterResponse),
    chapterCount: String(chapterResponse.chaptersText || "")
      .split(/\r?\n/)
      .filter(Boolean)
      .length,
    separateOK,
    separateSeconds,
    separateCalls: calls(separateResponse),
    separateSummaryCharacters: separateSummary.length,
    sharedOK,
    sharedSeconds,
    sharedCalls: calls(sharedResponse),
    sharedSummaryCharacters: sharedSummary.length,
    sharedChapterCount: String(sharedResponse.chaptersText || "")
      .split(/\r?\n/)
      .filter(Boolean)
      .length,
    speedupPercent,
    separateError: separateSummaryResponse.error
      || separateResponse.error
      || "",
  });
}

const successfulComparisons = rows.filter((row) => row.separateOK && row.sharedOK);
const comparableSeparateSeconds = successfulComparisons
  .reduce((sum, row) => sum + row.separateSeconds, 0);
const comparableSharedSeconds = successfulComparisons
  .reduce((sum, row) => sum + row.sharedSeconds, 0);
const comparableSeparateCalls = successfulComparisons
  .reduce((sum, row) => sum + row.separateCalls, 0);
const comparableSharedCalls = successfulComparisons
  .reduce((sum, row) => sum + row.sharedCalls, 0);
const aggregateSpeedup = (
  (comparableSeparateSeconds - comparableSharedSeconds)
  / comparableSeparateSeconds
) * 100;

const metrics = {
  generatedAt: new Date().toISOString(),
  implementation: "shared-map-v1-compact-candidates",
  success: {
    chaptersOnly: rows.filter((row) => row.chapterOnlyOK).length,
    separate: rows.filter((row) => row.separateOK).length,
    sharedChaptersSummary: rows.filter((row) => row.sharedOK).length,
    totalVideos: rows.length,
  },
  comparableSuccessfulVideos: successfulComparisons.length,
  comparableTotals: {
    separateSeconds: comparableSeparateSeconds,
    sharedSeconds: comparableSharedSeconds,
    savedSeconds: comparableSeparateSeconds - comparableSharedSeconds,
    speedupPercent: aggregateSpeedup,
    separateCalls: comparableSeparateCalls,
    sharedCalls: comparableSharedCalls,
    savedCalls: comparableSeparateCalls - comparableSharedCalls,
  },
  rows,
};
fs.writeFileSync(
  path.join(root, "metrics.json"),
  `${JSON.stringify(metrics, null, 2)}\n`,
  "utf8",
);

const tableRows = rows.map((row) => {
  const separateLabel = row.separateOK
    ? `${row.separateSeconds.toFixed(1)}s / ${row.separateCalls}`
    : "FAILED";
  const sharedLabel = row.sharedOK
    ? `${row.sharedSeconds.toFixed(1)}s / ${row.sharedCalls}`
    : "FAILED";
  const speedup = row.speedupPercent == null
    ? "n/a"
    : `${row.speedupPercent.toFixed(1)}%`;
  return `| ${row.id} | ${row.duration} | ${row.chapterCount} | ${separateLabel} | ${sharedLabel} | ${speedup} | ${row.separateSummaryCharacters} | ${row.sharedSummaryCharacters} |`;
});

const comparison = `# Apple Intelligence shared video-map comparison

All timings are wall-clock seconds on the same M1 Max test machine. Calls are local Apple Intelligence model calls.

| Video | Duration | Chapters | Separate time / calls | Shared time / calls | Shared faster | Separate summary chars | Shared summary chars |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${tableRows.join("\n")}

## Aggregate

- Chapters-only map: ${metrics.success.chaptersOnly}/${rows.length} succeeded
- Separate chapters + existing summary: ${metrics.success.separate}/${rows.length} succeeded
- Shared chapters + summary: ${metrics.success.sharedChaptersSummary}/${rows.length} succeeded
- Across the ${successfulComparisons.length} videos where both full approaches succeeded, shared processing took ${comparableSharedSeconds.toFixed(1)} seconds versus ${comparableSeparateSeconds.toFixed(1)} seconds separately: ${aggregateSpeedup.toFixed(1)}% faster
- Shared used ${comparableSharedCalls} model calls versus ${comparableSeparateCalls}: ${comparableSeparateCalls - comparableSharedCalls} fewer calls
- The separate path failed on 425R4PQ5svQ because the existing adaptive summary repeatedly returned model-internal \`TOOL CALL\` text on chunk 15 of 15. The shared compact map succeeded on the same transcript.

See \`outputs/<video-id>/\` for the readable chapters, summaries, and grounded shared map. See \`raw-results/<video-id>/\` for complete response metadata.
`;
fs.writeFileSync(path.join(root, "comparison.md"), comparison, "utf8");
process.stdout.write(`${comparison}\n`);
