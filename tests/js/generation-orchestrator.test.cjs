const test = require("node:test");
const assert = require("node:assert/strict");

const {
    automaticGenerationKinds,
    createJobPoller,
    createRequestDeduplicator,
    generationRequestIsCurrent,
    generationKindForTab,
    generationTimeoutForTranscript,
    invalidateGenerationIDs,
    transcriptForGeneration,
} = require("../../YouTube Timestamps and Summaries Extension/Resources/generation-orchestrator.js");

test("native chapters never suppress an unattempted automatic summary", () => {
    assert.deepEqual(automaticGenerationKinds({
        canGenerateTimestamps: true,
        canGenerateSummary: true,
        timestampsText: "0:00 Native chapter",
        summaryText: "",
        attempted: {
            timestamps: true,
            summary: false,
        },
    }), ["summary"]);

    assert.deepEqual(automaticGenerationKinds({
        canGenerateTimestamps: true,
        canGenerateSummary: true,
        timestampsText: "",
        summaryText: "",
        timestampsBlocked: true,
        attempted: {
            timestamps: false,
            summary: false,
        },
    }), ["summary"]);
});

test("generation identity cannot collide across video resets", () => {
    const invalidated = invalidateGenerationIDs({ timestamps: 1, summary: 4 });
    assert.deepEqual(invalidated, { timestamps: 2, summary: 5 });

    assert.equal(generationRequestIsCurrent({
        currentVideoKey: "video-b",
        requestVideoKey: "video-a",
        currentGenerationID: 1,
        requestGenerationID: 1,
    }), false);
    assert.equal(generationRequestIsCurrent({
        currentVideoKey: "video-a",
        requestVideoKey: "video-a",
        currentGenerationID: invalidated.timestamps,
        requestGenerationID: 1,
    }), false);
    assert.equal(generationRequestIsCurrent({
        currentVideoKey: "video-a",
        requestVideoKey: "video-a",
        currentGenerationID: 2,
        requestGenerationID: 2,
    }), true);
});

test("generation request preparation is deterministic", () => {
    assert.equal(generationKindForTab("timestamps", true), "selectedProviderTimestamps");
    assert.equal(generationKindForTab("summary", true), "selectedProviderSummary");
    assert.equal(generationKindForTab("summary", false), "summaryFull");
    assert.equal(transcriptForGeneration("summary", "[00:01] Hello\n[01:02:03] World"), "Hello\nWorld");
    assert.equal(transcriptForGeneration("timestamps", "[00:01] Hello"), "[00:01] Hello");
    assert.equal(generationTimeoutForTranscript("x".repeat(30000)), 6 * 60 * 1000);
    assert.equal(generationTimeoutForTranscript("x".repeat(40001)), 7.5 * 60 * 1000);
});

test("generation request deduplication always releases its key", async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const deduplicator = createRequestDeduplicator();
    const first = deduplicator.run("video:summary", () => pending);
    const duplicate = await deduplicator.run("video:summary", () => assert.fail("duplicate task ran"));

    assert.equal(duplicate.started, false);
    assert.equal(deduplicator.isActive("video:summary"), true);
    release("done");
    assert.deepEqual(await first, { started: true, value: "done" });
    assert.equal(deduplicator.isActive("video:summary"), false);
});

test("background generation polling reports progress and normalizes completion", async () => {
    let clock = 0;
    const responses = [
        { ok: true, status: "running", debug: { messages: "started" } },
        { ok: true, status: "running", debug: { messages: "working" } },
        { ok: true, status: "completed", text: "result", engineLabel: "Grok 4.5", debug: {} },
    ];
    const messages = [];
    const waits = [];
    const poller = createJobPoller({
        request: async () => responses.shift(),
        now: () => clock,
        sleep: async (milliseconds) => { clock += milliseconds; },
        pollIntervalMs: 1000,
        waitNoticeIntervalMs: 1000,
    });

    const response = await poller.poll({
        jobID: "job-1",
        timeoutMs: 10000,
        onMessages: (message) => messages.push(message),
        onWait: (seconds) => waits.push(seconds),
    });

    assert.equal(response.ok, true);
    assert.equal(response.text, "result");
    assert.equal(response.engineLabel, "Grok 4.5");
    assert.deepEqual(messages, ["started", "working"]);
    assert.deepEqual(waits, [1]);
});

test("background polling discards a response after video state becomes stale", async () => {
    const poller = createJobPoller({
        request: async () => ({ ok: true, status: "completed", text: "old video" }),
    });

    assert.deepEqual(await poller.poll({
        jobID: "job-old",
        timeoutMs: 1000,
        isCurrent: () => false,
    }), { stale: true });
});
