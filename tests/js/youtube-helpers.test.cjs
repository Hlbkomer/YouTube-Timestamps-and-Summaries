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

test("looksLikeInputRequest matches Gemini missing-input replies without hiding normal summaries", () => {
    const missingInputReply = "Please provide the link to the video, a transcript, or the video file itself. Once you provide the content, I will generate the timestamps for you in the requested format.";
    const realSummary = "This video explains how to share a video link with your team, highlights the main steps, and ends with practical takeaways.";

    assert.equal(helpers.looksLikeInputRequest(missingInputReply), true);
    assert.equal(helpers.looksLikeInputRequest(realSummary), false);
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
