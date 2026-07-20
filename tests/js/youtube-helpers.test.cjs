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

test("getNavigationResponse extracts fresh YouTube SPA page data", () => {
    const response = { engagementPanels: [{ id: "new-video-panel" }] };
    const nestedResponse = { contents: { id: "page-data" } };

    assert.equal(helpers.getNavigationResponse({ detail: { response } }), response);
    assert.equal(helpers.getNavigationResponse({
        detail: { pageData: { response: nestedResponse } },
    }), nestedResponse);
    assert.equal(helpers.getNavigationResponse({ detail: { response: [] } }), null);
    assert.equal(helpers.getNavigationResponse({}), null);
});

test("getNavigationResponseVideoKey validates SPA data ownership", () => {
    assert.equal(helpers.getNavigationResponseVideoKey({
        playerResponse: { videoDetails: { videoId: "newVideo" } },
    }), "newVideo");
    assert.equal(helpers.getNavigationResponseVideoKey({
        currentEndpoint: {
            commandMetadata: {
                webCommandMetadata: { url: "/watch?v=endpointVideo" },
            },
        },
    }), "endpointVideo");
    assert.equal(helpers.getNavigationResponseVideoKey({}), "");
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

test("parseNativeYouTubeChapters reads macro marker engagement panels", () => {
    const parsed = helpers.parseNativeYouTubeChapters({
        engagementPanels: [
            {
                engagementPanelSectionListRenderer: {
                    targetId: "engagement-panel-macro-markers-description-chapters",
                    content: {
                        macroMarkersListRenderer: {
                            contents: [
                                {
                                    macroMarkersInfoItemRenderer: {
                                        infoText: { simpleText: "Chapters" },
                                    },
                                },
                                {
                                    macroMarkersListItemRenderer: {
                                        title: { simpleText: "Show Open" },
                                        timeDescription: { simpleText: "0:00" },
                                        onTap: {
                                            watchEndpoint: {
                                                startTimeSeconds: 0,
                                            },
                                        },
                                        repeatButton: {
                                            toggleButtonRenderer: {
                                                defaultServiceEndpoint: {
                                                    repeatChapterCommand: {
                                                        startTimeMs: "0",
                                                        endTimeMs: "300000",
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                                {
                                    macroMarkersListItemRenderer: {
                                        title: { runs: [{ text: "Headlines" }] },
                                        timeDescription: { simpleText: "5:00" },
                                        onTap: {
                                            watchEndpoint: {
                                                startTimeSeconds: 300,
                                            },
                                        },
                                        repeatButton: {
                                            toggleButtonRenderer: {
                                                defaultServiceEndpoint: {
                                                    repeatChapterCommand: {
                                                        startTimeMs: "300000",
                                                        endTimeMs: "900000",
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
            },
        ],
    });

    assert.deepEqual(parsed, [
        { time: "0:00", label: "Show Open", seconds: 0 },
        { time: "5:00", label: "Headlines", seconds: 300 },
    ]);
});

test("parseNativeYouTubeChapters finds Key moments in nested macro-marker data", () => {
    const parsed = helpers.parseNativeYouTubeChapters({
        frameworkUpdates: {
            entityBatchUpdate: {
                mutations: [{
                    payload: {
                        keyMomentsSurface: {
                            content: {
                                macroMarkersListRenderer: {
                                    contents: [
                                        {
                                            macroMarkersInfoItemRenderer: {
                                                infoText: { simpleText: "Key moments" },
                                            },
                                        },
                                        {
                                            macroMarkersListItemRenderer: {
                                                title: { simpleText: "Opening" },
                                                timeDescription: { simpleText: "0:00" },
                                            },
                                        },
                                        {
                                            macroMarkersListItemRenderer: {
                                                title: { simpleText: "Main result" },
                                                navigationEndpoint: {
                                                    watchEndpoint: { startTimeSeconds: 145 },
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    },
                }],
            },
        },
    });

    assert.deepEqual(parsed, [
        { time: "0:00", label: "Opening", seconds: 0 },
        { time: "2:25", label: "Main result", seconds: 145 },
    ]);
});

test("parseNativeYouTubeChapters falls back to player bar chapters", () => {
    const parsed = helpers.parseNativeYouTubeChapters({
        playerOverlays: {
            playerOverlayRenderer: {
                decoratedPlayerBarRenderer: {
                    decoratedPlayerBarRenderer: {
                        playerBar: {
                            multiMarkersPlayerBarRenderer: {
                                markersMap: [
                                    {
                                        value: {
                                            chapters: [
                                                {
                                                    chapterRenderer: {
                                                        title: { simpleText: "Intro" },
                                                        timeRangeStartMillis: 0,
                                                    },
                                                },
                                                {
                                                    chapterRenderer: {
                                                        title: { simpleText: "Manual Overwrite" },
                                                        timeRangeStartMillis: 107000,
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
            },
        },
    });

    assert.deepEqual(parsed, [
        { time: "0:00", label: "Intro", seconds: 0 },
        { time: "1:47", label: "Manual Overwrite", seconds: 107 },
    ]);
});

test("parseNativeYouTubeChapters deduplicates repeated native chapter entries", () => {
    const parsed = helpers.parseNativeYouTubeChapters({
        engagementPanels: [
            {
                engagementPanelSectionListRenderer: {
                    content: {
                        macroMarkersListRenderer: {
                            contents: [
                                {
                                    macroMarkersListItemRenderer: {
                                        title: { simpleText: "Intro" },
                                        timeDescription: { simpleText: "0:00" },
                                    },
                                },
                                {
                                    macroMarkersListItemRenderer: {
                                        title: { simpleText: "Intro" },
                                        timeDescription: { simpleText: "0:00" },
                                    },
                                },
                            ],
                        },
                    },
                },
            },
        ],
    });

    assert.deepEqual(parsed, [
        { time: "0:00", label: "Intro", seconds: 0 },
    ]);
});

test("parseNativeYouTubeChaptersFromDOM reads YouTube's live macro-marker nodes", () => {
    function chapterNode(title, time) {
        const titleNode = {
            textContent: title,
            getAttribute: () => title,
        };
        const timeNode = {
            textContent: time,
            getAttribute: () => "",
        };
        const detailsNode = {
            querySelector(selector) {
                if (selector.includes("h3.macro-markers")) {
                    return titleNode;
                }
                if (selector.includes("#time")) {
                    return timeNode;
                }
                return null;
            },
        };

        return {
            querySelector(selector) {
                return selector === "#details:not([hidden])" ? detailsNode : null;
            },
        };
    }

    const root = {
        querySelectorAll(selector) {
            assert.equal(selector, "ytd-macro-markers-list-item-renderer");
            return [
                chapterNode("Show Open", "0:00"),
                chapterNode("Headlines", "5:00"),
            ];
        },
    };

    assert.deepEqual(helpers.parseNativeYouTubeChaptersFromDOM(root), [
        { time: "0:00", label: "Show Open", seconds: 0 },
        { time: "5:00", label: "Headlines", seconds: 300 },
    ]);
});

test("parseNativeYouTubeChaptersFromDOM prefers renderer data when available", () => {
    const root = {
        querySelectorAll() {
            return [{
                data: {
                    title: { simpleText: "Deep Dive" },
                    timeDescription: { simpleText: "12:34" },
                    onTap: {
                        watchEndpoint: {
                            startTimeSeconds: 754,
                        },
                    },
                },
            }];
        },
    };

    assert.deepEqual(helpers.parseNativeYouTubeChaptersFromDOM(root), [
        { time: "12:34", label: "Deep Dive", seconds: 754 },
    ]);
});

test("hasNativeYouTubeChapters reports absent native chapters", () => {
    assert.equal(helpers.parseNativeYouTubeChapters({ engagementPanels: [] }).length, 0);
    assert.equal(helpers.hasNativeYouTubeChapters({ engagementPanels: [] }), false);
});

test("renderSummaryHTML preserves bold sections and one nested bullet level", () => {
    const html = helpers.renderSummaryHTML([
        "Quick overview with **important** detail and <unsafe>.",
        "",
        "**Main Topic**",
        "- First **key** point",
        "  - Nested detail with [link](https://example.com) and `code`",
        "- Second *emphasis* point",
        "",
        "__Next Topic__:",
        "* Star bullet",
    ].join("\n"));

    assert.equal(
        html,
        '<p>Quick overview with <strong>important</strong> detail and &lt;unsafe&gt;.</p>'
            + '<div class="summary-section-title"><strong>Main Topic</strong></div>'
            + '<ul><li>First <strong>key</strong> point<ul><li>Nested detail with link and code</li></ul></li><li>Second emphasis point</li></ul>'
            + '<div class="summary-section-title"><strong>Next Topic</strong>:</div>'
            + '<ul><li>Star bullet</li></ul>',
    );
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
