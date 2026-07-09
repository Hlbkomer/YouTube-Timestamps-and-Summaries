const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const manifestPath = path.resolve(
    __dirname,
    "../../YouTube Timestamps and Summaries Extension/Resources/manifest.json",
);
const popupPath = path.resolve(
    __dirname,
    "../../YouTube Timestamps and Summaries Extension/Resources/popup.html",
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const popupHTML = fs.readFileSync(popupPath, "utf8");

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

test("toolbar action exposes popup controls for settings and chapter override", () => {
    assert.equal(manifest.action.default_popup, "popup.html");
    assert.ok(manifest.permissions.includes("activeTab"), "popup page actions need the active YouTube tab");
    assert.ok(manifest.permissions.includes("nativeMessaging"), "settings action opens the companion app through the native bridge");
    assert.ok(!manifest.permissions.includes("storage"), "popup no longer stores a custom extension-enabled toggle");
    assert.doesNotMatch(popupHTML, /id="extension-enabled"/);
    assert.doesNotMatch(popupHTML, /Extension enabled/);
    assert.doesNotMatch(popupHTML, /id="chapter-preference"/);
    assert.doesNotMatch(popupHTML, /Prefer native YouTube chapters/);
    assert.match(popupHTML, /id="video-chapter-source"/);
    assert.match(popupHTML, /Current video chapters/);
    assert.match(popupHTML, /id="video-chapter-source-native" value="native">Native/);
    assert.match(popupHTML, /id="video-chapter-source-generated" value="generated">Generated/);
    assert.doesNotMatch(popupHTML, /Show generated chapters \(Override native chapters\)/);
    assert.doesNotMatch(popupHTML, /id="video-chapter-source" type="checkbox"/);
    assert.doesNotMatch(popupHTML, /Regenerate Chapters/);
});
