const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createNativePanelController, createPanelCloseLifecycle } = require(
    "../../YouTube Timestamps and Summaries Extension/Resources/native-panel.js",
);

function button(label) {
    return {
        clickCount: 0,
        textContent: label,
        click() {
            this.clickCount += 1;
        },
        getAttribute(name) {
            return name === "aria-label" ? label : null;
        },
        hasAttribute() {
            return false;
        },
    };
}

function tabList(labels) {
    const buttons = labels.map(button);
    return {
        children: [],
        querySelectorAll() {
            return buttons;
        },
    };
}

function panel({ title = "", targetID = "", labels = [], hasMacroMarkers = false, header = null } = {}) {
    const contentAttributes = new Set();
    const content = {
        id: "content",
        removeAttribute(name) {
            contentAttributes.delete(name);
        },
        toggleAttribute(name, force) {
            if (force) contentAttributes.add(name);
            else contentAttributes.delete(name);
        },
    };
    const tabs = labels.length > 0 ? tabList(labels) : null;
    const attributes = new Map([
        ["visibility", "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"],
    ]);
    if (targetID) {
        attributes.set("target-id", targetID);
    }

    return {
        children: [content],
        hidden: false,
        isConnected: true,
        style: {
            display: "",
            removeProperty() {},
        },
        getAttribute(name) {
            return attributes.get(name) || null;
        },
        setAttribute(name, value) {
            attributes.set(name, value);
        },
        removeAttribute(name) {
            attributes.delete(name);
        },
        querySelector(selector) {
            if (selector.includes("#title")) {
                return title ? { textContent: title } : null;
            }
            if (selector.includes("[role='tablist']")) {
                return tabs;
            }
            if (selector.includes("ytd-macro-markers")) {
                return hasMacroMarkers ? {} : null;
            }
            if (selector.includes("ytd-engagement-panel-title-header-renderer") || selector === "#header") {
                return header;
            }
            return null;
        },
    };
}

function controllerFor(panels, state) {
    const document = {
        querySelectorAll(selector) {
            return selector === "ytd-engagement-panel-section-list-renderer" ? panels : [];
        },
    };

    return createNativePanelController({
        document,
        window: {
            getComputedStyle: () => ({ display: "block", visibility: "visible" }),
            clearTimeout() {},
            setTimeout(callback) {
                callback();
                return 1;
            },
        },
        sidebarHostID: "test-host",
        getState: () => state,
        getPanelHost: () => null,
        querySelectorAllSafe(root, selector) {
            return Array.from(root?.querySelectorAll?.(selector) || []);
        },
        normalizeText: (value) => String(value || "").trim(),
        visibleText: (element) => element?.textContent || element?.getAttribute?.("aria-label") || "",
    });
}

test("native panel mounting does not mistake the chapter-data sibling for the parent shell", () => {
    const chapterDataPanel = panel({
        title: "Chapters",
        targetID: "engagement-panel-macro-markers-description-chapters",
        hasMacroMarkers: true,
    });
    const parentPanel = panel({
        title: "In this video",
        labels: ["Timeline", "Chapters", "Transcript"],
    });
    const controller = controllerFor([chapterDataPanel, parentPanel], {});

    assert.equal(controller.getMount()?.panel, parentPanel);
});

test("native panel mounting recognizes a localized parent shell by its tab row", () => {
    const parentPanel = panel({
        title: "",
        labels: ["Prepis"],
    });
    const controller = controllerFor([parentPanel], {});

    assert.equal(controller.getMount()?.panel, parentPanel);
    assert.equal(controller.hasNativeOwnedTab("transcript"), true);
});

test("native panel mounting rejects Description surfaces with tab-list-like markup", () => {
    const targetlessDescription = panel({
        title: "Description",
        labels: ["Likes", "Views"],
    });
    const targetedDescription = panel({
        title: "Description",
        targetID: "engagement-panel-structured-description",
        labels: ["Kapitoly", "Prepis"],
    });

    assert.equal(controllerFor([targetlessDescription], {}).getMount(), null);
    assert.equal(controllerFor([targetedDescription], {}).getMount(), null);
});

test("transcript discovery expands a description only with positive transcript-section evidence", () => {
    const contentSource = fs.readFileSync(path.resolve(
        __dirname,
        "../../YouTube Timestamps and Summaries Extension/Resources/content.js",
    ), "utf8");

    assert.match(
        contentSource,
        /const transcriptSection = document\.querySelector\("ytd-video-description-transcript-section-renderer"\);\s*if \(buttons\.length === 0 && transcriptSection\)/,
    );
});

test("Key moments is treated as a YouTube chapter source but uses the compact extension tab", () => {
    const parentPanel = panel({
        title: "In this video",
        labels: ["Key moments", "Transcript"],
    });
    const state = {
        activeTab: "timestamps",
        timestampsSource: "youtubeChapters",
    };
    const controller = controllerFor([parentPanel], state);

    assert.equal(controller.hasNativeOwnedTab("chapters"), true);
    assert.deepEqual(controller.extensionTabKinds(), ["timestamps", "summary"]);
});

test("a standalone Key moments panel keeps lazy chapter discovery pending", () => {
    const keyMomentsPanel = panel({ title: "Key moments" });
    const parentPanel = panel({
        title: "In this video",
        labels: ["Transcript", "Timeline"],
    });
    const controller = controllerFor([keyMomentsPanel, parentPanel], {});

    assert.equal(controller.hasNativeChapterSurface(), true);
});

test("localized Key moments labels are recognized as chapter surfaces", () => {
    const keyMomentsPanel = panel({ title: "Moments clés" });
    const controller = controllerFor([keyMomentsPanel], {});

    assert.equal(controller.hasNativeChapterSurface(), true);
});

test("reconciliation does not reopen a hidden panel after selecting a YouTube-owned surface", () => {
    const parentPanel = panel({
        title: "In this video",
        labels: ["Timeline", "Chapters", "Transcript"],
    });
    const state = {
        userSelectedTab: true,
        nativeExtensionTab: "",
        nativeYouTubeTab: "timeline",
        nativePanelDismissed: false,
    };
    const controller = controllerFor([parentPanel], state);
    const mount = controller.getMount();

    assert.equal(controller.open(mount), false);
    assert.equal(parentPanel.getAttribute("visibility"), "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN");
});

test("native close remains latched until the panel was actually hidden", () => {
    const lifecycle = createPanelCloseLifecycle();

    lifecycle.begin();
    assert.deepEqual(
        lifecycle.reconcile({ dismissed: true, visible: true }),
        { blockOpen: true, reopened: false },
    );
    assert.deepEqual(
        lifecycle.reconcile({ dismissed: true, visible: false }),
        { blockOpen: true, reopened: false },
    );
    assert.deepEqual(
        lifecycle.reconcile({ dismissed: true, visible: true }),
        { blockOpen: false, reopened: true },
    );
});

test("the page Show transcript command reuses the integrated native Transcript tab", () => {
    const parentPanel = panel({
        title: "In this video",
        labels: ["Transcript"],
    });
    const state = {
        nativeExtensionTab: "timestamps",
        nativeYouTubeTab: "",
        nativePanelDismissed: true,
        userSelectedTab: true,
    };
    const controller = controllerFor([parentPanel], state);
    const transcriptButton = controller.getMount().tabList.querySelectorAll()[0];
    const calls = [];
    const trigger = {
        textContent: "Show transcript",
        getAttribute: () => null,
    };
    const event = {
        target: {
            closest(selector) {
                if (selector === "ytd-video-description-transcript-section-renderer") {
                    return {};
                }
                if (selector === "button, [role='button']") {
                    return trigger;
                }
                return null;
            },
        },
        preventDefault: () => calls.push("preventDefault"),
        stopPropagation: () => calls.push("stopPropagation"),
        stopImmediatePropagation: () => calls.push("stopImmediatePropagation"),
    };

    assert.equal(controller.handlePageTranscriptOpenClick(event), true);
    assert.equal(parentPanel.getAttribute("visibility"), "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
    assert.equal(state.nativePanelDismissed, false);
    assert.equal(state.nativeExtensionTab, "timestamps");
    assert.equal(state.nativeYouTubeTab, "");
    assert.equal(transcriptButton.clickCount, 1);
    assert.deepEqual(calls, ["preventDefault", "stopPropagation", "stopImmediatePropagation"]);
});

function closeSurface(title, targetID = "") {
    const closeTarget = {};
    const closeControl = {
        closest() {
            return this;
        },
        contains(target) {
            return target === closeTarget;
        },
    };
    const header = {
        querySelectorAll() {
            return [closeControl];
        },
    };
    const surface = panel({
        title,
        targetID,
        labels: title === "In this video" ? ["Transcript"] : [],
        header,
    });
    closeTarget.closest = (selector) => (
        selector === "ytd-engagement-panel-section-list-renderer" ? surface : null
    );
    return { closeTarget, surface };
}

test("Close hides an integrated shell that YouTube still considers closed", () => {
    const { closeTarget, surface: parentPanel } = closeSurface("In this video");
    parentPanel.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
    const state = {
        nativeExtensionTab: "timestamps",
        nativeYouTubeTab: "",
        nativePanelDismissed: false,
        userSelectedTab: true,
    };
    const controller = controllerFor([parentPanel], state);

    assert.equal(controller.handlePagePanelCloseClick({ target: closeTarget }), true);
    assert.equal(state.nativePanelDismissed, true);
    assert.equal(state.nativeExtensionTab, "timestamps");
    assert.equal(parentPanel.hidden, true);
    assert.equal(parentPanel.getAttribute("visibility"), "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN");
});

test("closing a reopened Transcript surface also dismisses the integrated shell beneath it", () => {
    const { surface: parentPanel } = closeSurface("In this video");
    const { closeTarget, surface: transcriptPanel } = closeSurface(
        "Transcript",
        "PAmodern_transcript_view",
    );
    parentPanel.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
    transcriptPanel.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
    const state = {
        nativeExtensionTab: "",
        nativeYouTubeTab: "transcript",
        nativePanelDismissed: false,
        userSelectedTab: true,
    };
    const controller = controllerFor([parentPanel, transcriptPanel], state);

    assert.equal(controller.handlePagePanelCloseClick({ target: closeTarget }), true);
    assert.equal(state.nativePanelDismissed, true);
    assert.equal(parentPanel.hidden, true);
    assert.equal(parentPanel.getAttribute("visibility"), "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN");
});

test("Close remains deterministic across repeated Show transcript reopen cycles", () => {
    const { closeTarget, surface: parentPanel } = closeSurface("In this video");
    parentPanel.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
    const state = {
        nativeExtensionTab: "timestamps",
        nativeYouTubeTab: "",
        nativePanelDismissed: false,
        userSelectedTab: true,
    };
    const controller = controllerFor([parentPanel], state);
    const trigger = {
        textContent: "Show transcript",
        getAttribute: () => null,
    };
    const reopenEvent = {
        target: {
            closest(selector) {
                if (selector === "ytd-video-description-transcript-section-renderer") {
                    return {};
                }
                if (selector === "button, [role='button']") {
                    return trigger;
                }
                return null;
            },
        },
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {},
    };

    for (let cycle = 0; cycle < 3; cycle += 1) {
        assert.equal(controller.handlePagePanelCloseClick({ target: closeTarget }), true);
        assert.equal(parentPanel.hidden, true);
        assert.equal(state.nativePanelDismissed, true);

        assert.equal(controller.handlePageTranscriptOpenClick(reopenEvent), true);
        assert.equal(parentPanel.hidden, false);
        assert.equal(parentPanel.getAttribute("visibility"), "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
        assert.equal(state.nativePanelDismissed, false);
    }

    assert.equal(controller.handlePagePanelCloseClick({ target: closeTarget }), true);
    assert.equal(parentPanel.hidden, true);
    assert.equal(state.nativePanelDismissed, true);
});

test("resolved chapter sources refresh the in-panel source footer without popup state", () => {
    const contentSource = fs.readFileSync(path.resolve(
        __dirname,
        "../../YouTube Timestamps and Summaries Extension/Resources/content.js",
    ), "utf8");

    assert.match(
        contentSource,
        /detection\.status = nextStatus;[\s\S]{0,120}scheduleChapterSourceFooterRefresh\(videoKey\);/,
    );
    assert.match(contentSource, /data-chapter-source-switch="\$\{escapeHTML\(sourceSwitch\.source\)\}"/);
    assert.match(contentSource, /"View generated chapters"/);
    assert.match(contentSource, /"Generate chapters from transcript"/);
    assert.match(contentSource, /label: "View YouTube chapters"/);
    assert.match(contentSource, /cachedGenerationResult\(watchVideoKey\(\), "timestamps"\)/);
    assert.match(
        contentSource,
        /function chapterSourceSwitch\(kind\)[\s\S]{0,260}state\.timestampsSource === "youtubeChapters" && canGenerateTimestamps\(\)/,
    );
    assert.match(
        contentSource,
        /function defaultActiveTab\(\) \{\s*if \(state\.timestampsSource === "youtubeChapters"\) \{/,
    );
    assert.doesNotMatch(contentSource, /notifyPageActionsChanged/);
});

test("sidebar and native controls use delegated capture handlers that survive rerenders", () => {
    const contentSource = fs.readFileSync(path.resolve(
        __dirname,
        "../../YouTube Timestamps and Summaries Extension/Resources/content.js",
    ), "utf8");
    const nativePanelSource = fs.readFileSync(path.resolve(
        __dirname,
        "../../YouTube Timestamps and Summaries Extension/Resources/native-panel.js",
    ), "utf8");

    assert.match(contentSource, /root\.addEventListener\("click", handlePanelControlClick, true\)/);
    assert.match(contentSource, /void copyActiveResult\(\)/);
    assert.match(nativePanelSource, /const extensionKind = target\.getAttribute\(NATIVE_PANEL_TAB_ATTRIBUTE\)/);
    assert.match(nativePanelSource, /void handleExtensionTabSelection\(extensionKind\)/);
    assert.match(nativePanelSource, /void deps\.copyHeaderResult\(\)/);
});

test("native Transcript and Timeline tabs remain routed through YouTube", () => {
    const nativePanelSource = fs.readFileSync(path.resolve(
        __dirname,
        "../../YouTube Timestamps and Summaries Extension/Resources/native-panel.js",
    ), "utf8");

    assert.match(nativePanelSource, /event\.target\?\.closest\?\.\("\[role='tab'\], button"\)/);
    assert.match(
        nativePanelSource,
        /if \(extensionKind\) \{[\s\S]{0,400}return;[\s\S]{0,200}scheduleNativeOwnedTabSelection\(nativeOwnedTabKindFromText\(deps\.visibleText\(target\)\)\);/,
    );
    assert.equal(nativePanelSource.includes('nativeYouTubeTab = "timeline"'), false);
});

test("a preserved native header copy control is rewired after the script reloads", () => {
    const listeners = new Map();
    const attributes = new Map([
        ["data-yts-native-header-action", ""],
    ]);
    const buttonAttributes = new Map([
        ["data-yts-native-header-copy", ""],
    ]);
    const copyButton = {
        dataset: {},
        disabled: false,
        innerHTML: "",
        addEventListener(type, listener) {
            const entries = listeners.get(`button:${type}`) || [];
            entries.push(listener);
            listeners.set(`button:${type}`, entries);
        },
        closest(selector) {
            return selector.includes("data-yts-native-header-copy") ? this : null;
        },
        getAttribute(name) {
            return buttonAttributes.get(name) || null;
        },
        setAttribute(name, value) {
            buttonAttributes.set(name, value);
        },
    };
    const host = {
        dataset: {},
        addEventListener(type, listener) {
            const entries = listeners.get(`host:${type}`) || [];
            entries.push(listener);
            listeners.set(`host:${type}`, entries);
        },
        querySelector(selector) {
            return selector.includes("data-yts-native-header-copy") ? copyButton : null;
        },
    };
    const header = {
        querySelector(selector) {
            return selector.includes("data-yts-native-header-action") ? host : null;
        },
    };
    const parentPanel = {
        contains(element) {
            return element === host;
        },
        querySelector(selector) {
            return selector.includes("ytd-engagement-panel-title-header-renderer") ? header : null;
        },
    };
    const state = {
        activeTab: "summary",
        nativeExtensionTab: "summary",
        copyFeedback: { summary: false },
    };
    let copyCount = 0;
    const controller = createNativePanelController({
        document: {
            documentElement: { append() {} },
            getElementById: () => ({}),
            querySelectorAll(selector) {
                return selector.includes("data-yts-native-header-action") ? [host] : [];
            },
        },
        window: {},
        sidebarHostID: "test-host",
        getState: () => state,
        getPanelHost: () => null,
        querySelectorAllSafe: () => [],
        normalizeText: (value) => String(value || "").trim(),
        visibleText: () => "",
        copyButtonLabel: () => "Copy summary",
        hasCopyText: () => true,
        copyIcon: () => "copy icon",
        copyHeaderResult: () => { copyCount += 1; },
    });

    controller.syncHeaderCopyButton({ panel: parentPanel });
    assert.equal((listeners.get("host:click") || []).length, 1);
    assert.equal((listeners.get("button:click") || []).length, 1);

    const event = {
        target: copyButton,
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {},
    };
    listeners.get("host:click")[0](event);
    assert.equal(copyCount, 1);
});

test("native synchronization avoids unconditional control rewrites", () => {
    const nativePanelSource = fs.readFileSync(path.resolve(
        __dirname,
        "../../YouTube Timestamps and Summaries Extension/Resources/native-panel.js",
    ), "utf8");
    const contentSource = fs.readFileSync(path.resolve(
        __dirname,
        "../../YouTube Timestamps and Summaries Extension/Resources/content.js",
    ), "utf8");

    assert.match(nativePanelSource, /function setTextContentIfChanged\(/);
    assert.match(nativePanelSource, /button\.dataset\.ytsCopyIconState !== iconState/);
    assert.match(contentSource, /isExtensionOwnedNativeControlNode\(record\.target\)/);
});

test("inactive native chips use one YouTube background layer", () => {
    const nativePanelSource = fs.readFileSync(path.resolve(
        __dirname,
        "../../YouTube Timestamps and Summaries Extension/Resources/native-panel.js",
    ), "utf8");

    assert.match(
        nativePanelSource,
        /\.yts-native-panel-tab\s*\{[\s\S]*?background: var\(--yt-spec-badge-chip-background, rgba\(0, 0, 0, 0\.05\)\);/,
    );
    assert.match(
        nativePanelSource,
        /NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE\}\]\.ytChipBarViewModelChipWrapper,[\s\S]{0,400}background: transparent !important;/,
    );
    assert.match(
        nativePanelSource,
        /NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE\}\] \.ytChipShapeChip \{\s*background: var\(--yt-spec-badge-chip-background, rgba\(0, 0, 0, 0\.05\)\) !important;/,
    );
    assert.doesNotMatch(nativePanelSource, /\[class\*='ytChipShapeChip'\]/);
});

test("busy tabs preserve the normal idle or selected palette", () => {
    const nativePanelSource = fs.readFileSync(path.resolve(
        __dirname,
        "../../YouTube Timestamps and Summaries Extension/Resources/native-panel.js",
    ), "utf8");
    const contentSource = fs.readFileSync(path.resolve(
        __dirname,
        "../../YouTube Timestamps and Summaries Extension/Resources/content.js",
    ), "utf8");

    assert.doesNotMatch(nativePanelSource, /\.yts-native-panel-tab\[aria-busy=/);
    assert.doesNotMatch(contentSource, /\.tab(?:\.active)?\[aria-busy=/);
    assert.match(contentSource, /--tab-background: var\(--yt-spec-badge-chip-background, #f2f2f2\)/);
    assert.match(contentSource, /--tab-selected-background: var\(--yt-spec-text-primary, #0f0f0f\)/);
    assert.match(contentSource, /background: var\(--tab-background\);/);
    assert.match(contentSource, /background: var\(--tab-selected-background\);/);
});

test("SPA tab injection is not blocked by transcript or generation startup", () => {
    const contentSource = fs.readFileSync(path.resolve(
        __dirname,
        "../../YouTube Timestamps and Summaries Extension/Resources/content.js",
    ), "utf8");

    assert.match(contentSource, /function autogenerateAnalysisInBackground\(\)/);
    assert.doesNotMatch(
        contentSource,
        /async function reconcilePanel\(\)[\s\S]{0,2600}await maybeAutogenerateAnalysis\(\)/,
    );
    assert.match(contentSource, /removePanel\(\{ preserveNativeControls: true \}\)/);
    assert.match(
        contentSource,
        /new MutationObserver\(\(records\) => \{[\s\S]{0,500}nativePanel\.syncTabs\(\);[\s\S]{0,180}scheduleNativePanelRefresh\(\);/,
    );
});

for (const { label, kind } of [
    { label: "Transcript", kind: "transcript" },
    { label: "Timeline", kind: "timeline" },
]) test(`native ${label} selection survives repeated extension-tab round trips`, () => {
    const nativePanelSource = fs.readFileSync(path.resolve(
        __dirname,
        "../../YouTube Timestamps and Summaries Extension/Resources/native-panel.js",
    ), "utf8");
    const attributes = new Map([
        ["aria-selected", "true"],
    ]);
    const containerAttributes = new Map([
        ["aria-selected", "true"],
    ]);
    const chipClasses = new Set(["ytChipShapeChip", "ytChipShapeSelected", "ytChipShapeActive"]);
    const container = {
        getAttribute: (name) => containerAttributes.get(name) || null,
        hasAttribute: (name) => containerAttributes.has(name),
        setAttribute: (name, value) => containerAttributes.set(name, value),
        toggleAttribute(name, force) {
            if (force) containerAttributes.set(name, "");
            else containerAttributes.delete(name);
        },
    };
    const nativeButton = {
        closest: () => container,
        getAttribute: (name) => attributes.get(name) || null,
        hasAttribute: (name) => name === "data-yts-native-tab" ? false : attributes.has(name),
        setAttribute: (name, value) => attributes.set(name, value),
    };
    const state = { nativeExtensionTab: "timestamps" };
    const controller = createNativePanelController({
        document: {},
        window: {},
        sidebarHostID: "test-host",
        getState: () => state,
        getPanelHost: () => null,
        querySelectorAllSafe: () => [nativeButton],
        normalizeText: (value) => String(value || "").trim(),
        visibleText: () => label,
    });

    for (let cycle = 0; cycle < 3; cycle += 1) {
        state.nativeExtensionTab = cycle % 2 === 0 ? "timestamps" : "summary";
        controller.syncNativeOwnedTabSelectionAppearance({ tabList: {} });
        assert.equal(attributes.get("aria-selected"), "false");
        assert.equal(containerAttributes.get("aria-selected"), "false");
        assert.equal(containerAttributes.has("data-yts-native-owned-tab-visually-inactive"), true);
        assert.equal(chipClasses.has("ytChipShapeSelected"), true);
        assert.equal(chipClasses.has("ytChipShapeActive"), true);
        assert.equal(chipClasses.has("ytChipShapeInactive"), false);

        state.nativeExtensionTab = "";
        state.nativeYouTubeTab = kind;
        controller.syncNativeOwnedTabSelectionAppearance({ tabList: {} });
        assert.equal(containerAttributes.has("data-yts-native-owned-tab-visually-inactive"), false);
        assert.equal(attributes.get("aria-selected"), "true");
        assert.equal(containerAttributes.get("aria-selected"), "true");
        assert.equal(chipClasses.has("ytChipShapeSelected"), true);
        assert.equal(chipClasses.has("ytChipShapeActive"), true);
        assert.equal(chipClasses.has("ytChipShapeInactive"), false);
    }

    assert.match(nativePanelSource, /VISUALLY_INACTIVE_ATTRIBUTE\}\] \.ytChipShapeChip/);
    assert.doesNotMatch(nativePanelSource, /chip\.classList\.(?:add|remove|toggle)/);
});
