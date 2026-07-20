const test = require("node:test");
const assert = require("node:assert/strict");

const {
    NATIVE_CHAPTER_DISCOVERY_GRACE_MS,
    isTerminalDetectionStatus,
    mergeDetectionStatus,
    normalizeDetectionStatus,
} = require("../../YouTube Timestamps and Summaries Extension/Resources/chapter-state.js");

test("resolved chapter detection never regresses to pending or unknown", () => {
    assert.equal(mergeDetectionStatus("available", "pending"), "available");
    assert.equal(mergeDetectionStatus("available", "unknown"), "available");
    assert.equal(mergeDetectionStatus("unavailable", "pending"), "unavailable");
    assert.equal(mergeDetectionStatus("unavailable", "unknown"), "unavailable");
});

test("chapter detection normalizes availability without popup presentation state", () => {
    assert.equal(NATIVE_CHAPTER_DISCOVERY_GRACE_MS, 30000);
    assert.equal(normalizeDetectionStatus("anything", true), "available");
    assert.equal(normalizeDetectionStatus("pending"), "pending");
    assert.equal(normalizeDetectionStatus("anything"), "unknown");
    assert.equal(isTerminalDetectionStatus("available"), true);
    assert.equal(isTerminalDetectionStatus("unavailable"), true);
    assert.equal(isTerminalDetectionStatus("pending"), false);
});
