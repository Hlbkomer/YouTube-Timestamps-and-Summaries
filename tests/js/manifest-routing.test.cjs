const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const manifestPath = path.resolve(
    __dirname,
    "../../YouTube Timestamps and Summaries Extension/Resources/manifest.json",
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function scriptsContaining(fileName) {
    return manifest.content_scripts.filter((entry) => entry.js.includes(fileName));
}

test("sidebar content script stays scoped to watch and live pages", () => {
    const [entry] = scriptsContaining("content.js");
    assert.ok(entry, "content.js content script must exist");

    assert.deepEqual(entry.matches, [
        "*://www.youtube.com/watch*",
        "*://youtube.com/watch*",
        "*://m.youtube.com/watch*",
        "*://www.youtube.com/live/*",
        "*://youtube.com/live/*",
        "*://m.youtube.com/live/*",
    ]);
});

test("route guard handles broad YouTube navigation without touching video pages", () => {
    const [entry] = scriptsContaining("route-guard.js");
    assert.ok(entry, "route-guard.js content script must exist");

    assert.deepEqual(entry.matches, [
        "*://www.youtube.com/*",
        "*://youtube.com/*",
        "*://m.youtube.com/*",
    ]);
    assert.deepEqual(entry.exclude_matches, [
        "*://www.youtube.com/watch*",
        "*://youtube.com/watch*",
        "*://m.youtube.com/watch*",
        "*://www.youtube.com/live/*",
        "*://youtube.com/live/*",
        "*://m.youtube.com/live/*",
    ]);
    assert.equal(entry.run_at, "document_start");
});
