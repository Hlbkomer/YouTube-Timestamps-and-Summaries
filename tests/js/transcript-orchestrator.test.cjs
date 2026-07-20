const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createTranscriptOrchestrator,
} = require("../../YouTube Timestamps and Summaries Extension/Resources/transcript-orchestrator.js");

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });
    return { promise, reject, resolve };
}

test("completed transcripts bypass discovery and report a cache hit", async () => {
    const transcript = { text: "hello", lineCount: 1 };
    const cacheHits = [];
    const orchestrator = createTranscriptOrchestrator({
        completedCache: new Map([["video", transcript]]),
        requestCache: new Map(),
        resolveTranscript: async () => assert.fail("cached transcript should not resolve again"),
        onCacheHit: (kind, value) => cacheHits.push([kind, value]),
    });

    assert.equal(await orchestrator.get("video", "summary"), transcript);
    assert.equal(orchestrator.status("video"), "available");
    assert.equal(orchestrator.hasAvailableTranscript("video"), true);
    assert.deepEqual(cacheHits, [["summary", transcript]]);
});

test("simultaneous transcript consumers share one in-flight request", async () => {
    const pending = deferred();
    let resolveCount = 0;
    const requestCache = new Map();
    const orchestrator = createTranscriptOrchestrator({
        completedCache: new Map(),
        requestCache,
        resolveTranscript: () => {
            resolveCount += 1;
            return pending.promise;
        },
    });

    const first = orchestrator.get("video", "timestamps");
    const second = orchestrator.get("video", "summary");
    assert.equal(resolveCount, 1);
    assert.equal(orchestrator.status("video"), "pending");

    const transcript = { text: "shared", lineCount: 1 };
    pending.resolve(transcript);
    assert.equal(await first, transcript);
    assert.equal(await second, transcript);
    assert.equal(orchestrator.status("video"), "available");
    assert.equal(requestCache.size, 0);
});

test("repeated consumers report one shared-wait diagnostic per kind", async () => {
    const pending = deferred();
    const sharedKinds = [];
    const orchestrator = createTranscriptOrchestrator({
        completedCache: new Map(),
        requestCache: new Map(),
        resolveTranscript: () => pending.promise,
        onSharedRequest: (kind) => sharedKinds.push(kind),
    });

    const first = orchestrator.get("video", "summary", { allowNativePanelOpen: false });
    const joinedSummaryA = orchestrator.get("video", "summary", { allowNativePanelOpen: false });
    const joinedSummaryB = orchestrator.get("video", "summary", { allowNativePanelOpen: false });
    const joinedTimestamps = orchestrator.get("video", "timestamps", { allowNativePanelOpen: false });
    assert.deepEqual(sharedKinds, ["summary", "timestamps"]);

    const transcript = { text: "shared", lineCount: 1 };
    pending.resolve(transcript);
    assert.deepEqual(await Promise.all([
        first,
        joinedSummaryA,
        joinedSummaryB,
        joinedTimestamps,
    ]), [transcript, transcript, transcript, transcript]);
});

test("an active request can retry after a shared passive fetch fails", async () => {
    const passive = deferred();
    const passiveFailures = [];
    let resolveCount = 0;
    const orchestrator = createTranscriptOrchestrator({
        completedCache: new Map(),
        requestCache: new Map(),
        resolveTranscript: (_videoKey, _kind, options) => {
            resolveCount += 1;
            if (!options.allowNativePanelOpen) {
                return passive.promise;
            }
            return Promise.resolve({ text: "native panel", lineCount: 1 });
        },
        onPassiveFailure: (_kind, error) => passiveFailures.push(error.message),
    });

    const first = orchestrator.get("video", "summary", { allowNativePanelOpen: false });
    const second = orchestrator.get("video", "transcript", { allowNativePanelOpen: true });
    assert.equal(orchestrator.status("video"), "pending");
    passive.reject(new Error("passive unavailable"));

    await assert.rejects(first, /passive unavailable/);
    assert.deepEqual(await second, { text: "native panel", lineCount: 1 });
    assert.equal(orchestrator.status("video"), "available");
    assert.equal(resolveCount, 2);
    assert.deepEqual(passiveFailures, ["passive unavailable"]);
});

test("a completed transcript miss is terminal for fallback placement until retried", async () => {
    let transcript = null;
    const orchestrator = createTranscriptOrchestrator({
        completedCache: new Map(),
        requestCache: new Map(),
        resolveTranscript: async () => transcript,
    });

    assert.equal(orchestrator.status("video"), "unknown");
    assert.equal(orchestrator.hasAvailableTranscript("video"), false);
    assert.equal(await orchestrator.get("video", ""), null);
    assert.equal(orchestrator.status("video"), "unavailable");
    assert.equal(orchestrator.hasAvailableTranscript("video"), false);

    transcript = { text: "captions appeared", lineCount: 1 };
    assert.deepEqual(await orchestrator.get("video", "summary"), transcript);
    assert.equal(orchestrator.status("video"), "available");
    assert.equal(orchestrator.hasAvailableTranscript("video"), true);

    orchestrator.forget("video");
    assert.equal(orchestrator.status("video"), "unknown");
});
