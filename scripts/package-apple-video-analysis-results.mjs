import fs from "node:fs";
import path from "node:path";

const root = path.resolve(
  process.argv[2]
    || "test-results/apple-video-analysis/2026-07-26-shared-map-v1",
);
const leanOnly = process.argv.includes("--lean-only");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);
const rawRoot = path.join(root, "raw-results");
const outputRoot = path.join(root, "outputs");
fs.mkdirSync(outputRoot, { recursive: true });

function load(folderName, approach) {
  return JSON.parse(
    fs.readFileSync(
      path.join(rawRoot, folderName, `${approach}.json`),
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
  const folderName = video.folderName || video.id;
  const chaptersOnly = load(folderName, "chaptersOnly");
  const leanChaptersOnly = load(folderName, "leanChaptersOnly");
  const separate = load(folderName, "separate");
  const shared = load(folderName, "sharedChaptersSummary");
  const chapterResponse = chaptersOnly.response;
  const leanChapterResponse = leanChaptersOnly.response;
  const separateResponse = separate.response;
  const separateChapterResponse = separateResponse.chapters || {};
  const separateSummaryResponse = separateResponse.summary || {};
  const sharedResponse = shared.response;
  const videoOutputRoot = path.join(outputRoot, folderName);

  if (!leanOnly) {
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
  }
  writeText(
    path.join(videoOutputRoot, "07-lean-chapters-only.txt"),
    leanChapterResponse.chaptersText,
  );

  const separateOK = separateResponse.ok === true;
  const summaryOK = separateSummaryResponse.ok === true;
  const sharedOK = sharedResponse.ok === true;
  const leanChapterOK = leanChapterResponse.ok === true;
  const separateSeconds = Number(separate.elapsedSeconds || 0);
  const summarySeconds = Number(
    debug(separateResponse).summaryElapsedSeconds
      ?? Math.max(0, separateSeconds - Number(chaptersOnly.elapsedSeconds || 0)),
  );
  const summaryCalls = Number(
    debug(separateResponse).summaryModelCalls
      ?? Math.max(0, calls(separateResponse) - calls(chapterResponse)),
  );
  const leanChapterSeconds = Number(leanChaptersOnly.elapsedSeconds || 0);
  const sharedSeconds = Number(shared.elapsedSeconds || 0);
  const speedupPercent = separateOK && sharedOK
    ? ((separateSeconds - sharedSeconds) / separateSeconds) * 100
    : null;
  const separateSummary = String(separateSummaryResponse.text || "");
  const sharedSummary = String(sharedResponse.summaryText || "");
  const normalizedMapChapters = String(chapterResponse.chaptersText || "").trim();
  const normalizedLeanChapters = String(leanChapterResponse.chaptersText || "").trim();
  const optimizedSeparateOK = leanChapterOK && summaryOK;
  const optimizedSeparateSeconds = leanChapterSeconds + summarySeconds;
  const optimizedSeparateCalls = calls(leanChapterResponse) + summaryCalls;
  const sharedVsOptimizedSpeedupPercent = optimizedSeparateOK && sharedOK
    ? ((optimizedSeparateSeconds - sharedSeconds) / optimizedSeparateSeconds) * 100
    : null;

  rows.push({
    id: video.id,
    folderName,
    title: video.title,
    duration: video.duration,
    durationSeconds: video.durationSeconds,
    chapterOnlyOK: chapterResponse.ok === true,
    chapterSeconds: Number(chaptersOnly.elapsedSeconds || 0),
    chapterCalls: calls(chapterResponse),
    chapterCount: String(chapterResponse.chaptersText || "")
      .split(/\r?\n/)
      .filter(Boolean)
      .length,
    leanChapterOK,
    leanChapterSeconds,
    leanChapterCalls: calls(leanChapterResponse),
    leanChapterCount: normalizedLeanChapters
      .split(/\r?\n/)
      .filter(Boolean)
      .length,
    leanMatchesMapChapters: normalizedLeanChapters === normalizedMapChapters,
    leanChapterSpeedupPercent: chapterResponse.ok === true && leanChapterOK
      ? (
        (Number(chaptersOnly.elapsedSeconds || 0) - leanChapterSeconds)
        / Number(chaptersOnly.elapsedSeconds || 0)
      ) * 100
      : null,
    summaryOK,
    summarySeconds,
    summaryCalls,
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
    optimizedSeparateOK,
    optimizedSeparateSeconds,
    optimizedSeparateCalls,
    sharedVsOptimizedSpeedupPercent,
    speedupPercent,
    separateError: separateSummaryResponse.error
      || separateResponse.error
      || "",
  });
}

const successfulComparisons = rows.filter((row) => row.separateOK && row.sharedOK);
const successfulOptimizedComparisons = rows.filter(
  (row) => row.optimizedSeparateOK && row.sharedOK,
);
const successfulLeanComparisons = rows.filter(
  (row) => row.chapterOnlyOK && row.leanChapterOK,
);
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
const mapChapterSeconds = successfulLeanComparisons
  .reduce((sum, row) => sum + row.chapterSeconds, 0);
const leanChapterSeconds = successfulLeanComparisons
  .reduce((sum, row) => sum + row.leanChapterSeconds, 0);
const mapChapterCalls = successfulLeanComparisons
  .reduce((sum, row) => sum + row.chapterCalls, 0);
const leanChapterCalls = successfulLeanComparisons
  .reduce((sum, row) => sum + row.leanChapterCalls, 0);
const leanChapterSpeedup = (
  (mapChapterSeconds - leanChapterSeconds)
  / mapChapterSeconds
) * 100;
const optimizedSeparateSeconds = successfulOptimizedComparisons
  .reduce((sum, row) => sum + row.optimizedSeparateSeconds, 0);
const optimizedSeparateCalls = successfulOptimizedComparisons
  .reduce((sum, row) => sum + row.optimizedSeparateCalls, 0);
const optimizedSharedSeconds = successfulOptimizedComparisons
  .reduce((sum, row) => sum + row.sharedSeconds, 0);
const optimizedSharedCalls = successfulOptimizedComparisons
  .reduce((sum, row) => sum + row.sharedCalls, 0);
const optimizedSharedSpeedup = (
  (optimizedSeparateSeconds - optimizedSharedSeconds)
  / optimizedSeparateSeconds
) * 100;

const metrics = {
  generatedAt: new Date().toISOString(),
  implementation: "shared-map-v1-with-lean-chapters",
  success: {
    chaptersOnly: rows.filter((row) => row.chapterOnlyOK).length,
    leanChaptersOnly: rows.filter((row) => row.leanChapterOK).length,
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
  leanChapterTotals: {
    comparableVideos: successfulLeanComparisons.length,
    mapSeconds: mapChapterSeconds,
    leanSeconds: leanChapterSeconds,
    savedSeconds: mapChapterSeconds - leanChapterSeconds,
    speedupPercent: leanChapterSpeedup,
    mapCalls: mapChapterCalls,
    leanCalls: leanChapterCalls,
    savedCalls: mapChapterCalls - leanChapterCalls,
    exactChapterMatches: successfulLeanComparisons.filter(
      (row) => row.leanMatchesMapChapters,
    ).length,
    mapChapterCount: successfulLeanComparisons
      .reduce((sum, row) => sum + row.chapterCount, 0),
    leanChapterCount: successfulLeanComparisons
      .reduce((sum, row) => sum + row.leanChapterCount, 0),
  },
  optimizedComparisonTotals: {
    comparableVideos: successfulOptimizedComparisons.length,
    separateSeconds: optimizedSeparateSeconds,
    sharedSeconds: optimizedSharedSeconds,
    savedSeconds: optimizedSeparateSeconds - optimizedSharedSeconds,
    sharedSpeedupPercent: optimizedSharedSpeedup,
    separateCalls: optimizedSeparateCalls,
    sharedCalls: optimizedSharedCalls,
    savedCalls: optimizedSeparateCalls - optimizedSharedCalls,
  },
  rows,
};
fs.writeFileSync(
  path.join(root, "metrics.json"),
  `${JSON.stringify(metrics, null, 2)}\n`,
  "utf8",
);

const tableRows = [...rows]
  .sort((left, right) => left.durationSeconds - right.durationSeconds)
  .map((row) => {
    const mapChapterLabel = row.chapterOnlyOK
      ? `${row.chapterSeconds.toFixed(1)}s / ${row.chapterCalls}`
      : "FAILED";
    const leanChapterLabel = row.leanChapterOK
      ? `${row.leanChapterSeconds.toFixed(1)}s / ${row.leanChapterCalls}`
      : "FAILED";
    const summaryLabel = row.summaryOK
      ? `${row.summarySeconds.toFixed(1)}s / ${row.summaryCalls}`
      : `FAILED after ${row.summarySeconds.toFixed(1)}s`;
    const optimizedSeparateLabel = row.optimizedSeparateOK
      ? `${row.optimizedSeparateSeconds.toFixed(1)}s / ${row.optimizedSeparateCalls}`
      : "FAILED";
    const sharedLabel = row.sharedOK
      ? `${row.sharedSeconds.toFixed(1)}s / ${row.sharedCalls}`
      : "FAILED";
    const leanSpeedup = row.leanChapterSpeedupPercent == null
      ? "n/a"
      : `${row.leanChapterSpeedupPercent.toFixed(1)}%`;
    const sharedSpeedup = row.sharedVsOptimizedSpeedupPercent == null
      ? "n/a"
      : `${row.sharedVsOptimizedSpeedupPercent.toFixed(1)}%`;
    return `| ${row.folderName} | ${row.duration} | ${row.chapterCount} → ${row.leanChapterCount} | ${mapChapterLabel} | ${leanChapterLabel} | ${leanSpeedup} | ${summaryLabel} | ${optimizedSeparateLabel} | ${sharedLabel} | ${sharedSpeedup} |`;
  });

const comparison = `# Apple Intelligence shared video-map comparison

All timings are wall-clock seconds on the same M1 Max test machine. Calls are local Apple Intelligence model calls.

| Video | Duration | Chapters map → lean | Map chapters | Lean chapters | Lean faster | Stored summary | Optimized separate | Shared | Shared faster |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${tableRows.join("\n")}

## Aggregate

- Map-based chapters-only: ${metrics.success.chaptersOnly}/${rows.length} succeeded
- Lean chapters-only: ${metrics.success.leanChaptersOnly}/${rows.length} succeeded
- Separate chapters + existing summary: ${metrics.success.separate}/${rows.length} succeeded
- Shared chapters + summary: ${metrics.success.sharedChaptersSummary}/${rows.length} succeeded
- Across all ${successfulLeanComparisons.length} videos, lean chapters took ${leanChapterSeconds.toFixed(1)} seconds versus ${mapChapterSeconds.toFixed(1)} seconds for map-based chapters: ${leanChapterSpeedup.toFixed(1)}% faster
- Lean chapters used ${leanChapterCalls} model calls versus ${mapChapterCalls}: ${mapChapterCalls - leanChapterCalls} fewer calls
- Lean generated ${metrics.leanChapterTotals.leanChapterCount} final chapters versus ${metrics.leanChapterTotals.mapChapterCount} for the map-based path
- Across the ${successfulOptimizedComparisons.length} videos with a usable stored Apple summary, shared processing took ${optimizedSharedSeconds.toFixed(1)} seconds versus an estimated ${optimizedSeparateSeconds.toFixed(1)} seconds for lean chapters plus that stored summary: ${optimizedSharedSpeedup.toFixed(1)}% faster
- Shared used ${optimizedSharedCalls} model calls versus an estimated ${optimizedSeparateCalls}: ${optimizedSeparateCalls - optimizedSharedCalls} fewer calls
- The separate path failed on 425R4PQ5svQ because the existing adaptive summary repeatedly returned model-internal \`TOOL CALL\` text on chunk 15 of 15. The shared compact map succeeded on the same transcript.

Map-based chapters and all summary/shared values are reused from the earlier run. Only lean chapters were regenerated.

See \`outputs/<number-description-video-id>/07-lean-chapters-only.txt\` for the new readable chapter lists. See \`raw-results/<number-description-video-id>/leanChaptersOnly.json\` for complete response metadata.
`;
fs.writeFileSync(path.join(root, "comparison.md"), comparison, "utf8");
process.stdout.write(`${comparison}\n`);
