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
const popupSource = fs.readFileSync(path.resolve(
    __dirname,
    "../../YouTube Timestamps and Summaries Extension/Resources/popup.js",
), "utf8");
const backgroundSource = fs.readFileSync(path.resolve(
    __dirname,
    "../../YouTube Timestamps and Summaries Extension/Resources/background.js",
), "utf8");
const contentSource = fs.readFileSync(path.resolve(
    __dirname,
    "../../YouTube Timestamps and Summaries Extension/Resources/content.js",
), "utf8");
const routeGuardSource = fs.readFileSync(path.resolve(
    __dirname,
    "../../YouTube Timestamps and Summaries Extension/Resources/route-guard.js",
), "utf8");

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
    assert.deepEqual(entry.js, [
        "chapter-state.js",
        "content-state.js",
        "transcript-orchestrator.js",
        "generation-orchestrator.js",
        "youtube-helpers.js",
        "page-controls.js",
        "native-panel.js",
        "content.js",
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
    assert.match(routeGuardSource, /function reloadCurrentVideoPage\(\)/);
    assert.match(routeGuardSource, /document\.addEventListener\("yt-navigate-finish"/);
    assert.match(routeGuardSource, /window\.setInterval\(checkForVideoURLChange, VIDEO_URL_CHECK_INTERVAL_MS\)/);
    assert.match(routeGuardSource, /window\.location\.reload\(\)/);
});

test("watch-page integration survives YouTube SPA video switches", () => {
    assert.match(contentSource, /function rememberNavigationData\(event\)/);
    assert.match(contentSource, /navigationDataCache\.videoKey === videoKey/);
    assert.match(contentSource, /document\.addEventListener\("yt-page-data-updated", handlePageDataUpdated\)/);
    assert.match(contentSource, /window\.setInterval\(checkForNavigationURLChange, NAVIGATION_URL_CHECK_INTERVAL_MS\)/);
    assert.match(contentSource, /responseVideoKey && responseVideoKey !== activeVideoKey/);
    assert.match(contentSource, /function playerResponseForVideo\(videoKey\)/);
    assert.match(contentSource, /response\?\.videoDetails\?\.videoId === videoKey/);
    assert.match(contentSource, /itemVideoKey[\s\S]{0,120}itemVideoKey === videoKey[\s\S]{0,120}Boolean\(playerResponse\)/);
    assert.match(contentSource, /parseNativeYouTubeChapters\(playerResponseForVideo\(videoKey\)\)/);
    assert.match(contentSource, /const NATIVE_PANEL_DISCOVERY_GRACE_MS = 5 \* 1000/);
    assert.match(contentSource, /function scheduleNavigationReconciliation\(expectedURL/);
    assert.match(contentSource, /NAVIGATION_RECONCILE_DELAYS_MS/);
    assert.match(contentSource, /createNavigationTransitionCoordinator/);
    assert.match(contentSource, /function handleNavigationStart\(event\) \{[\s\S]{0,180}navigationTransition\.begin\(\)/);
    assert.match(contentSource, /if \(navigationTransition\.shouldHoldUI\(\)\) \{\s*return;\s*\}/);
    assert.match(contentSource, /if \(!watchToWatchNavigation\) \{\s*await ensurePanel\(\);\s*\}/);
    assert.doesNotMatch(
        contentSource,
        /function getPanelMount\(\) \{[\s\S]{0,350}shouldWaitForNativeChapterDetection\(\)/,
    );
    assert.doesNotMatch(contentSource, /if \(!nextURL \|\| !isWatchURL\(nextURL\)\)/);
    assert.doesNotMatch(contentSource, /lastObservedURL = new URL\(nextURL/);
    assert.doesNotMatch(
        contentSource,
        /function handleNavigationStart\(event\) \{[\s\S]{0,180}rememberNavigationData\(event\)/,
    );
    assert.doesNotMatch(
        contentSource,
        /function handleNavigationStart\(event\) \{[\s\S]{0,500}cleanupNonWatchPage\(\)/,
    );
});

test("toolbar action exposes Settings while chapter switching stays in the sidebar", () => {
    assert.equal(manifest.action.default_popup, "popup.html");
    assert.deepEqual(manifest.background.scripts, ["background.js"]);
    assert.ok(!manifest.permissions.includes("activeTab"), "the Settings-only popup does not inspect the active tab");
    assert.ok(manifest.permissions.includes("clipboardWrite"), "sidebar and native-panel copy controls need Safari clipboard access");
    assert.ok(manifest.permissions.includes("nativeMessaging"), "settings action opens the companion app through the native bridge");
    assert.ok(!manifest.permissions.includes("storage"), "popup no longer stores a custom extension-enabled toggle");
    assert.doesNotMatch(popupHTML, /id="extension-enabled"/);
    assert.doesNotMatch(popupHTML, /Extension enabled/);
    assert.doesNotMatch(popupHTML, /id="chapter-preference"/);
    assert.doesNotMatch(popupHTML, /Prefer native YouTube chapters/);
    assert.doesNotMatch(popupHTML, /video-chapter-source/);
    assert.doesNotMatch(popupHTML, /Current video chapters/);
    assert.doesNotMatch(popupHTML, /chapter-state\.js/);
    assert.doesNotMatch(popupSource, /getPageActions|setVideoChapterSource|chapterPickerState/);
    assert.match(popupHTML, /id="open-settings"/);
    assert.match(contentSource, /data-chapter-source-switch/);
    assert.match(contentSource, /function switchVideoChapterSource\(/);
    assert.doesNotMatch(backgroundSource, /pageActionStateByVideoKey|ai:getPageActions|ai:setVideoChapterSource/);
    assert.match(backgroundSource, /case "ai:copyText":/);
    assert.match(backgroundSource, /navigator\.clipboard\.writeText\(value\)/);
});

test("chapter source action stays on one subtle caption line", () => {
    const chapterCaptionCSS = contentSource.match(/\.chapter-result-surface > \.caption \{([\s\S]*?)\n\s*\}/)?.[1] || "";
    const captionLinkCSS = contentSource.match(/\.caption-link \{([\s\S]*?)\n\s*\}/)?.[1] || "";
    const chapterResultCSS = contentSource.match(/\.chapter-result-surface \{([\s\S]*?)\n\s*\}/)?.[1] || "";

    assert.match(contentSource, /return "Chapters provided by YouTube\.";/);
    assert.match(contentSource, />\$\{escapeHTML\(sourceSwitch\.label\)\}<\/button>\.`/);
    assert.match(contentSource, /return `<div class="caption">\$\{escapeHTML\(resultCaption\(kind\)\)\}\$\{sourceActionHTML\}<\/div>`/);
    assert.match(chapterCaptionCSS, /text-align: left/);
    assert.match(captionLinkCSS, /font-weight: inherit/);
    assert.match(captionLinkCSS, /text-decoration: underline/);
    assert.match(chapterResultCSS, /gap: 10px/);
});
