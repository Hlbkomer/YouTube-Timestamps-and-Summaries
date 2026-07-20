(function (globalScope) {
    const selectors = {
        nativeTab: "[data-yts-native-tab]",
        nativeCopy: "[data-yts-native-header-copy]",
        sidebarTab: "[data-tab]",
        sidebarCopy: "[data-copy-active]",
        chapterSourceSwitch: "[data-chapter-source-switch]",
        openApp: "[data-open-app]",
        timestamp: "[data-seconds]",
    };
    const extensionOwnedNativeSelector = [
        selectors.nativeTab,
        "[data-yts-native-tab-wrapper]",
        selectors.nativeCopy,
        selectors.chapterSourceSwitch,
        "[data-yts-native-header-action]",
    ].join(", ");

    function controlFromEvent(event, selector) {
        const path = typeof event.composedPath === "function"
            ? event.composedPath()
            : [event.target];
        return path.find((node) => node?.matches?.(selector)) || null;
    }

    function createPageControlHandler(callbacks) {
        return function handlePageControlClick(event) {
            const controls = {
                nativeTab: controlFromEvent(event, selectors.nativeTab),
                nativeCopy: controlFromEvent(event, selectors.nativeCopy),
                sidebarTab: controlFromEvent(event, selectors.sidebarTab),
                sidebarCopy: controlFromEvent(event, selectors.sidebarCopy),
                chapterSourceSwitch: controlFromEvent(event, selectors.chapterSourceSwitch),
                openApp: controlFromEvent(event, selectors.openApp),
                timestamp: controlFromEvent(event, selectors.timestamp),
            };
            const control = controls.nativeTab
                || controls.nativeCopy
                || controls.sidebarTab
                || controls.sidebarCopy
                || controls.chapterSourceSwitch
                || controls.openApp
                || controls.timestamp;
            if (!control) {
                return false;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();

            if (controls.nativeTab) {
                callbacks.selectNativeTab(controls.nativeTab.getAttribute("data-yts-native-tab") || "summary");
            } else if (controls.nativeCopy) {
                callbacks.copyNativeResult();
            } else if (controls.sidebarTab) {
                callbacks.selectSidebarTab(controls.sidebarTab.getAttribute("data-tab") || "timestamps");
            } else if (controls.sidebarCopy) {
                callbacks.copySidebarResult();
            } else if (controls.chapterSourceSwitch) {
                callbacks.switchChapterSource(
                    controls.chapterSourceSwitch.getAttribute("data-chapter-source-switch") || "generated"
                );
            } else if (controls.openApp) {
                callbacks.openApp();
            } else if (controls.timestamp) {
                callbacks.jumpToTime(Number(controls.timestamp.getAttribute("data-seconds") || 0));
            }

            return true;
        };
    }

    function isExtensionOwnedNativeControlNode(node) {
        const element = node?.matches ? node : node?.parentElement;
        return Boolean(
            element?.matches?.(extensionOwnedNativeSelector)
            || element?.closest?.(extensionOwnedNativeSelector)
        );
    }

    globalScope.YouTubeTimestampsPageControls = {
        controlFromEvent,
        createPageControlHandler,
        isExtensionOwnedNativeControlNode,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = globalScope.YouTubeTimestampsPageControls;
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
