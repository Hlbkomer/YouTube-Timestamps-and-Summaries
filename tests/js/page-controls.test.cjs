const test = require("node:test");
const assert = require("node:assert/strict");

const { createPageControlHandler, isExtensionOwnedNativeControlNode } = require(
    "../../YouTube Timestamps and Summaries Extension/Resources/page-controls.js",
);

function control(attributes) {
    return {
        getAttribute(name) {
            return attributes[name] || null;
        },
        matches(selector) {
            return Object.keys(attributes).some((name) => selector === `[${name}]`);
        },
    };
}

function clickEvent(target) {
    const calls = {
        prevented: 0,
        stopped: 0,
        immediate: 0,
    };
    return {
        calls,
        target,
        composedPath: () => [target],
        preventDefault: () => { calls.prevented += 1; },
        stopPropagation: () => { calls.stopped += 1; },
        stopImmediatePropagation: () => { calls.immediate += 1; },
    };
}

function harness() {
    const calls = [];
    const handler = createPageControlHandler({
        selectNativeTab: (kind) => calls.push(["native-tab", kind]),
        copyNativeResult: () => calls.push(["native-copy"]),
        selectSidebarTab: (kind) => calls.push(["sidebar-tab", kind]),
        copySidebarResult: () => calls.push(["sidebar-copy"]),
        switchChapterSource: (source) => calls.push(["chapter-source", source]),
        openApp: () => calls.push(["open-app"]),
        jumpToTime: (seconds) => calls.push(["jump", seconds]),
    });
    return { calls, handler };
}

test("stable page routing handles replacement Summary and Copy controls", () => {
    const { calls, handler } = harness();
    const firstSummary = control({ "data-yts-native-tab": "summary" });
    const replacementSummary = control({ "data-yts-native-tab": "summary" });
    const replacementCopy = control({ "data-yts-native-header-copy": "" });

    assert.equal(handler(clickEvent(firstSummary)), true);
    assert.equal(handler(clickEvent(replacementSummary)), true);
    assert.equal(handler(clickEvent(replacementCopy)), true);
    assert.deepEqual(calls, [
        ["native-tab", "summary"],
        ["native-tab", "summary"],
        ["native-copy"],
    ]);
});

test("YouTube-owned Transcript and Timeline controls are not intercepted", () => {
    const { calls, handler } = harness();
    const transcript = control({ role: "tab", "aria-label": "Transcript" });
    const event = clickEvent(transcript);

    assert.equal(handler(event), false);
    assert.deepEqual(calls, []);
    assert.deepEqual(event.calls, {
        prevented: 0,
        stopped: 0,
        immediate: 0,
    });
});

test("standalone sidebar controls use the same stable routing", () => {
    const { calls, handler } = harness();

    handler(clickEvent(control({ "data-tab": "summary" })));
    handler(clickEvent(control({ "data-copy-active": "" })));
    handler(clickEvent(control({ "data-seconds": "125" })));

    assert.deepEqual(calls, [
        ["sidebar-tab", "summary"],
        ["sidebar-copy"],
        ["jump", 125],
    ]);
});

test("chapter source links use stable routing in native and fallback panels", () => {
    const { calls, handler } = harness();

    handler(clickEvent(control({ "data-chapter-source-switch": "generated" })));
    handler(clickEvent(control({ "data-chapter-source-switch": "native" })));

    assert.deepEqual(calls, [
        ["chapter-source", "generated"],
        ["chapter-source", "native"],
    ]);
});

test("native-panel reconciliation can ignore mutations inside extension controls", () => {
    const extensionTab = {
        matches: () => true,
        closest: () => null,
    };
    const extensionTabText = {
        parentElement: extensionTab,
    };
    const youtubeTab = {
        matches: () => false,
        closest: () => null,
    };

    assert.equal(isExtensionOwnedNativeControlNode(extensionTab), true);
    assert.equal(isExtensionOwnedNativeControlNode(extensionTabText), true);
    assert.equal(isExtensionOwnedNativeControlNode(youtubeTab), false);
});
