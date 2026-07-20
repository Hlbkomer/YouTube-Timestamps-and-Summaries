const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createNavigationTransitionCoordinator,
    createSerialRefreshCoordinator,
    createVideoRetention,
    reduceStatusState,
} = require("../../YouTube Timestamps and Summaries Extension/Resources/content-state.js");

function deferred() {
    let resolve;
    const promise = new Promise((nextResolve) => {
        resolve = nextResolve;
    });
    return { promise, resolve };
}

test("failed status refresh preserves the last valid capabilities and settings", () => {
    const previous = {
        appleIntelligenceAvailable: true,
        codexConnected: true,
        selectedProviderConnected: true,
        timestampsAvailable: true,
        summaryAvailable: true,
        providerError: "",
        settings: {
            providerID: "openaiCodex",
            modelID: "gpt-5.6-sol",
            summaryEngine: "selectedModel",
        },
    };

    const result = reduceStatusState(previous, null);

    assert.equal(result.applied, false);
    assert.equal(result.value, previous);
    assert.match(result.error, /could not refresh provider status/i);
});

test("successful status refresh derives one coherent capability snapshot", () => {
    const result = reduceStatusState({
        settings: {
            providerID: "openaiCodex",
            summaryEngine: "selectedModel",
        },
    }, {
        ok: true,
        generationMode: "selectedProvider",
        isConfigured: true,
        timestampsAvailable: false,
        summaryAvailable: true,
        appleIntelligence: { isConfigured: true },
        codex: { connected: false, error: "" },
        grok: { connected: false, error: "" },
        settings: {
            providerID: "openaiCodex",
            summaryEngine: "appleIntelligence",
            providerConnected: false,
        },
    });

    assert.equal(result.applied, true);
    assert.deepEqual(result.value, {
        generationMode: "selectedProvider",
        appleIntelligenceAvailable: true,
        codexConnected: false,
        timestampsAvailable: false,
        selectedProviderConnected: false,
        summaryAvailable: true,
        providerError: "",
        statusError: "",
        settings: {
            providerID: "openaiCodex",
            summaryEngine: "appleIntelligence",
            providerConnected: false,
        },
    });
});

test("status refresh coordinator serializes overlap and runs one queued refresh", async () => {
    const requests = [deferred(), deferred()];
    let callCount = 0;
    let activeCount = 0;
    let maximumActiveCount = 0;
    const coordinator = createSerialRefreshCoordinator(async () => {
        const requestIndex = callCount;
        callCount += 1;
        activeCount += 1;
        maximumActiveCount = Math.max(maximumActiveCount, activeCount);
        const value = await requests[requestIndex].promise;
        activeCount -= 1;
        return value;
    });

    const first = coordinator.request();
    const second = coordinator.request();
    assert.equal(first, second);
    assert.equal(callCount, 1);

    requests[0].resolve("old");
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(callCount, 2);

    requests[1].resolve("latest");
    assert.equal(await first, "latest");
    assert.equal(maximumActiveCount, 1);
    assert.equal(coordinator.isRefreshing(), false);
});

test("navigation transition holds outgoing UI until finish or bounded recovery", () => {
    let now = 1_000;
    const transition = createNavigationTransitionCoordinator(3_000, () => now);

    assert.equal(transition.shouldHoldUI(), false);
    transition.begin();
    assert.equal(transition.shouldHoldUI(), true);

    now = 3_999;
    assert.equal(transition.shouldHoldUI(), true);
    transition.complete();
    assert.equal(transition.shouldHoldUI(), false);

    transition.begin();
    now = 7_000;
    assert.equal(transition.shouldHoldUI(), false);
});

test("video retention evicts one complete least-recently-used video session", () => {
    const evicted = [];
    const retention = createVideoRetention(3, (videoKey) => evicted.push(videoKey));

    retention.touch("video-a");
    retention.touch("video-b");
    retention.touch("video-c");
    retention.touch("video-a");
    retention.touch("video-d");

    assert.deepEqual(retention.keys(), ["video-c", "video-a", "video-d"]);
    assert.deepEqual(evicted, ["video-b"]);
});

test("video retention keeps active work even when temporarily above its limit", () => {
    const evicted = [];
    const retention = createVideoRetention(2, (videoKey) => evicted.push(videoKey));

    retention.touch("video-a");
    retention.touch("video-b");
    retention.touch("video-c", new Set(["video-a", "video-b", "video-c"]));
    assert.deepEqual(retention.keys(), ["video-a", "video-b", "video-c"]);

    retention.prune(new Set(["video-c"]));
    assert.deepEqual(retention.keys(), ["video-b", "video-c"]);
    assert.deepEqual(evicted, ["video-a"]);
});
