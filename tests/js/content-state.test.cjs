const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createNavigationTransitionCoordinator,
    createSerialRefreshCoordinator,
    createVideoRetention,
    reduceStatusState,
    requestStatusWithRetry,
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
            modelID: "gpt-6.1-sol",
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

test("status request retries timeouts with a short backoff and returns the first real answer", async () => {
    const delays = [];
    const retries = [];
    let calls = 0;
    const result = await requestStatusWithRetry({
        request: async () => {
            calls += 1;
            if (calls < 3) {
                throw new Error("Timed out after 20 seconds.");
            }
            return { ok: true, isConfigured: false };
        },
        sleep: async (ms) => { delays.push(ms); },
        maxAttempts: 3,
        retryDelayMs: 1000,
        onRetry: (error, attempt) => retries.push([error.message, attempt]),
    });

    assert.equal(calls, 3);
    assert.deepEqual(delays, [1000, 2000]);
    assert.deepEqual(retries, [
        ["Timed out after 20 seconds.", 1],
        ["Timed out after 20 seconds.", 2],
    ]);
    assert.equal(result.transientFailure, false);
    assert.equal(result.attempts, 3);
    assert.deepEqual(result.response, { ok: true, isConfigured: false });
});

test("status request treats a missing background answer as transient", async () => {
    let calls = 0;
    const result = await requestStatusWithRetry({
        request: async () => {
            calls += 1;
            return calls === 1 ? undefined : { ok: true };
        },
        sleep: async () => {},
    });

    assert.equal(calls, 2);
    assert.equal(result.transientFailure, false);
    assert.deepEqual(result.response, { ok: true });
});

test("status request does not retry a definitive failure from the native host", async () => {
    let calls = 0;
    const result = await requestStatusWithRetry({
        request: async () => {
            calls += 1;
            return { ok: false, error: "Native host rejected the request." };
        },
        sleep: async () => { throw new Error("should not sleep"); },
    });

    assert.equal(calls, 1);
    assert.equal(result.transientFailure, false);
    assert.equal(result.response.error, "Native host rejected the request.");
});

test("status request gives up after the bounded attempts with a retryable failure", async () => {
    let calls = 0;
    const delays = [];
    const result = await requestStatusWithRetry({
        request: async () => {
            calls += 1;
            throw new Error("Timed out after 20 seconds.");
        },
        sleep: async (ms) => { delays.push(ms); },
        maxAttempts: 3,
        retryDelayMs: 1000,
    });

    assert.equal(calls, 3);
    assert.deepEqual(delays, [1000, 2000]);
    assert.equal(result.transientFailure, true);
    assert.deepEqual(result.response, { ok: false, error: "Timed out after 20 seconds." });
    assert.equal(reduceStatusState({}, result.response).applied, false);
});

test("panel shows a neutral checking state until a definitive provider status arrives", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const contentSource = fs.readFileSync(path.resolve(
        __dirname,
        "../../YouTube Timestamps and Summaries Extension/Resources/content.js",
    ), "utf8");

    assert.match(contentSource, /statusKnown: false,/);
    assert.match(
        contentSource,
        /function renderActiveContent\(\) \{[\s\S]{0,500}if \(statusGatesActiveTab && !state\.statusKnown\) \{\s*return renderStatusPendingState\(\);/,
    );
    assert.match(contentSource, /Checking provider status\.\.\./);
    assert.match(contentSource, /data-retry-status>Try Again</);
    assert.match(
        contentSource,
        /contentState\.requestStatusWithRetry\(\{[\s\S]{0,200}type: "ai:getStatus"/,
    );
    assert.match(
        contentSource,
        /Object\.assign\(state, statusResult\.value\);\s*state\.statusKnown = true;/,
    );
    assert.match(contentSource, /retryStatus: \(\) => \{ refreshStatusInBackground\(\); \}/);
});


test("Gemini errors come from the selected provider while Apple summaries remain available", () => {
    const result = reduceStatusState({}, {
        ok: true,
        appleIntelligence: { isConfigured: true },
        timestampsAvailable: false,
        summaryAvailable: true,
        codex: { connected: false, error: "Wrong provider error" },
        gemini: { connected: false, error: "The Gemini API key could not be read from Keychain." },
        settings: { providerID: "googleGemini", providerConnected: false, summaryEngine: "appleIntelligence" },
    });
    assert.equal(result.value.providerError, "The Gemini API key could not be read from Keychain.");
    assert.equal(result.value.summaryAvailable, true);
    assert.equal(result.value.timestampsAvailable, false);
});
