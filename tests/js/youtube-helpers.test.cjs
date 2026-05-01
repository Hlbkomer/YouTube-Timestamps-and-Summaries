const test = require("node:test");
const assert = require("node:assert/strict");

const helpers = require("../../YouTube Timestamps and Summaries Extension/Resources/youtube-helpers.js");

test("isVideoURL recognizes watch and live URLs only", () => {
    assert.equal(helpers.isVideoURL("https://www.youtube.com/watch?v=abc123"), true);
    assert.equal(helpers.isVideoURL("https://www.youtube.com/live/Kgm0P-uH-vM?si=test"), true);
    assert.equal(helpers.isVideoURL("https://www.youtube.com/shorts/X4dGtpUD3gA"), false);
    assert.equal(helpers.isVideoURL("https://www.youtube.com/feed/subscriptions"), false);
});

test("getNavigationURL extracts YouTube SPA destination URLs", () => {
    const fromDetailURL = helpers.getNavigationURL({
        detail: { url: "/watch?v=abc123" },
    });
    const fromEndpoint = helpers.getNavigationURL({
        detail: {
            endpoint: {
                commandMetadata: {
                    webCommandMetadata: {
                        url: "/live/Kgm0P-uH-vM",
                    },
                },
            },
        },
    });

    assert.equal(fromDetailURL, "https://www.youtube.com/watch?v=abc123");
    assert.equal(fromEndpoint, "https://www.youtube.com/live/Kgm0P-uH-vM");
});

test("extractVideoKey resolves watch, live, canonical, and player-response sources", () => {
    assert.equal(helpers.extractVideoKey({
        currentUrl: "https://www.youtube.com/watch?v=abc123",
    }), "abc123");

    assert.equal(helpers.extractVideoKey({
        currentUrl: "https://www.youtube.com/live/Kgm0P-uH-vM?si=test",
        pathname: "/live/Kgm0P-uH-vM",
    }), "Kgm0P-uH-vM");

    assert.equal(helpers.extractVideoKey({
        canonicalHref: "https://www.youtube.com/watch?v=fromCanonical",
    }), "fromCanonical");

    assert.equal(helpers.extractVideoKey({
        playerVideoId: "fromPlayerResponse",
    }), "fromPlayerResponse");
});

test("parseTimestamps parses common timestamp formats", () => {
    const parsed = helpers.parseTimestamps([
        "00:00 Intro",
        "01:12 - Market Overview",
        "1:02:03 Deep Dive",
    ].join("\n"));

    assert.deepEqual(parsed, [
        { time: "00:00", label: "Intro", seconds: 0 },
        { time: "01:12", label: "Market Overview", seconds: 72 },
        { time: "1:02:03", label: "Deep Dive", seconds: 3723 },
    ]);
});

test("generation availability defaults to Summary when ChatGPT is disconnected and Apple Intelligence can summarize", () => {
    const status = {
        codexConnected: false,
        timestampsAvailable: false,
        summaryAvailable: true,
        appleIntelligenceAvailable: true,
        summaryEngine: "appleIntelligence",
    };

    assert.equal(helpers.canGenerateTimestampsFromStatus(status), false);
    assert.equal(helpers.canGenerateSummaryFromStatus(status), true);
    assert.equal(helpers.defaultGenerationTab(status), "summary");
});

test("generation availability defaults to Timestamps when ChatGPT is connected", () => {
    const status = {
        codexConnected: true,
        timestampsAvailable: true,
        summaryAvailable: true,
        summaryEngine: "selectedModel",
    };

    assert.equal(helpers.canGenerateTimestampsFromStatus(status), true);
    assert.equal(helpers.canGenerateSummaryFromStatus(status), true);
    assert.equal(helpers.defaultGenerationTab(status), "timestamps");
});

test("selected-model summaries are unavailable without ChatGPT", () => {
    const status = {
        codexConnected: false,
        appleIntelligenceAvailable: true,
        summaryEngine: "selectedModel",
    };

    assert.equal(helpers.canGenerateSummaryFromStatus(status), false);
});

test("Apple Intelligence summary availability can be inferred from settings when explicit status is absent", () => {
    const status = {
        codexConnected: false,
        appleIntelligenceAvailable: true,
        settings: {
            summaryEngine: "appleIntelligence",
        },
    };

    assert.equal(helpers.canGenerateSummaryFromStatus(status), true);
});
