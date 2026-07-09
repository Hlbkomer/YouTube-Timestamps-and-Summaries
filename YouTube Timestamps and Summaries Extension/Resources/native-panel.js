(function (globalScope) {
    const NATIVE_PANEL_STYLE_ID = "youtube-timestamps-native-panel-style";
    const NATIVE_PANEL_TAB_WRAPPER_ATTRIBUTE = "data-yts-native-tab-wrapper";
    const NATIVE_PANEL_TAB_ATTRIBUTE = "data-yts-native-tab";
    const NATIVE_PANEL_HEADER_ACTION_ATTRIBUTE = "data-yts-native-header-action";
    const NATIVE_PANEL_HEADER_COPY_ATTRIBUTE = "data-yts-native-header-copy";
    const NATIVE_PANEL_HIDDEN_BY_EXTENSION_ATTRIBUTE = "data-yts-native-hidden-by-extension";
    const NATIVE_PANEL_PREVIOUS_DISPLAY_ATTRIBUTE = "data-yts-native-previous-display";
    const NATIVE_PANEL_PREVIOUS_HIDDEN_ATTRIBUTE = "data-yts-native-previous-hidden";
    const NATIVE_PANEL_PREVIOUS_VISIBILITY_ATTRIBUTE = "data-yts-native-previous-visibility";
    const NATIVE_PANEL_NATIVE_TAB_HIDDEN_ATTRIBUTE = "data-yts-native-owned-tab-hidden";
    const NATIVE_PANEL_NATIVE_TAB_PREVIOUS_DISPLAY_ATTRIBUTE = "data-yts-native-owned-tab-previous-display";
    const NATIVE_PANEL_VISIBILITY_EXPANDED = "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED";
    const NATIVE_PANEL_VISIBILITY_HIDDEN = "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN";
    const NATIVE_PANEL_TAB_ORDER = ["chapters", "summary", "transcript", "timeline"];
    const TRANSCRIPT_COPY_REFRESH_DELAYS_MS = [0, 150, 450, 900, 1500];
    const NATIVE_PANEL_BODY_MIN_HEIGHT_PX = 260;
    const NATIVE_PANEL_BODY_MAX_HEIGHT_PX = 620;
    const NATIVE_PANEL_VIEWPORT_BOTTOM_GAP_PX = 16;
    const NATIVE_PANEL_RESYNC_DELAYS_MS = [0, 25, 75, 150, 300, 600, 1000];
    const NATIVE_PANEL_NATIVE_TAB_HANDOFF_GRACE_MS = 700;

    function createNativePanelController(deps) {
        let nativePanelResyncTimeouts = [];
        let nativePanelTabSwitchTimeout = null;
        let nativePanelTabSwitchGraceTimeout = null;
        let nativePanelTabSwitchInProgress = false;
        let transcriptCopyRefreshTimeout = null;

        const doc = deps.document || globalScope.document;
        const win = deps.window || globalScope.window;
        const sidebarHostID = deps.sidebarHostID;

        function state() {
            return deps.getState();
        }

        function panelHost() {
            return deps.getPanelHost();
        }

        function querySelectorAllSafe(root, selector) {
            return deps.querySelectorAllSafe(root, selector);
        }

        function directChildByID(element, id) {
            return Array.from(element?.children || []).find((child) => child.id === id) || null;
        }

        function nativePanelTitle(panel) {
            return deps.normalizeText(
                panel?.querySelector?.("ytd-engagement-panel-title-header-renderer #title-text")?.textContent
                || panel?.querySelector?.("ytd-engagement-panel-title-header-renderer #title")?.textContent
                || panel?.querySelector?.("#title-text")?.textContent
                || ""
            );
        }

        function getNativeInThisVideoPanel() {
            for (const panel of doc.querySelectorAll("ytd-engagement-panel-section-list-renderer")) {
                if (nativePanelTitle(panel) === "In this video") {
                    return panel;
                }
            }

            return null;
        }

        function isNativePanelVisible(panel) {
            if (!panel?.isConnected || panel.hidden) {
                return false;
            }

            const visibility = panel.getAttribute("visibility") || "";
            const style = win.getComputedStyle?.(panel);

            return visibility !== NATIVE_PANEL_VISIBILITY_HIDDEN
                && (!style || (style.display !== "none" && style.visibility !== "hidden"));
        }

        function getMount({ requireVisible = false } = {}) {
            const panel = getNativeInThisVideoPanel();
            if (!panel) {
                return null;
            }

            if (requireVisible && !isNativePanelVisible(panel)) {
                return null;
            }

            const content = directChildByID(panel, "content");
            const tabList = panel.querySelector("chip-bar-view-model [role='tablist'], #subheader [role='tablist'], [role='tablist']");
            if (!content || !tabList) {
                return null;
            }

            return {
                panel,
                content,
                tabList,
            };
        }

        function extensionTabKinds() {
            const currentState = state();
            const kinds = [];
            if (currentState.timestampsSource !== "youtubeChapters") {
                kinds.push("timestamps");
            }
            kinds.push("summary");

            return kinds;
        }

        function tabLabel(kind) {
            if (kind === "timestamps") {
                return state().isLoading.timestamps ? "Chapters..." : "Chapters";
            }

            return deps.buttonLabel(kind);
        }

        function tabAriaLabel(kind) {
            return kind === "timestamps" ? "Chapters" : "Summary";
        }

        function nativeOwnedTabKindFromText(value) {
            const text = String(value || "").toLowerCase();
            if (/\b(?:transcript|transkript|transkrip|prepis|přepis)\b/.test(text)) {
                return "transcript";
            }
            if (/\b(?:chapters?|kapitel)\b/.test(text)) {
                return "chapters";
            }
            if (/\b(?:timeline)\b/.test(text)) {
                return "timeline";
            }

            return "";
        }

        function extensionTabOrderKind(kind) {
            return kind === "timestamps" ? "chapters" : kind;
        }

        function tabButtonForItem(item) {
            if (item?.matches?.(`[${NATIVE_PANEL_TAB_ATTRIBUTE}], button[role='tab'], [role='tab'], button`)) {
                return item;
            }

            return item?.querySelector?.(`[${NATIVE_PANEL_TAB_ATTRIBUTE}], button[role='tab'], [role='tab'], button`) || null;
        }

        function tabOrderKindForItem(item) {
            const button = tabButtonForItem(item);
            if (!button) {
                return "";
            }

            const extensionKind = button.getAttribute(NATIVE_PANEL_TAB_ATTRIBUTE);
            if (extensionKind) {
                return extensionTabOrderKind(extensionKind);
            }

            return nativeOwnedTabKindFromText(deps.visibleText(button));
        }

        function tabOrderIndex(kind) {
            const index = NATIVE_PANEL_TAB_ORDER.indexOf(kind);
            return index >= 0 ? index : NATIVE_PANEL_TAB_ORDER.length;
        }

        function reorderTabs(mount = getMount()) {
            const tabList = mount?.tabList;
            if (!tabList) {
                return;
            }

            const entries = Array.from(tabList.children)
                .map((item, sourceIndex) => ({
                    item,
                    sourceIndex,
                    kind: tabOrderKindForItem(item),
                }))
                .filter((entry) => entry.kind);

            entries.sort((a, b) => {
                const orderDelta = tabOrderIndex(a.kind) - tabOrderIndex(b.kind);
                return orderDelta || a.sourceIndex - b.sourceIndex;
            });

            for (const entry of entries) {
                tabList.append(entry.item);
            }
        }

        function isNativeOwnedTabSelected(button) {
            if (!button || button.hasAttribute(NATIVE_PANEL_TAB_ATTRIBUTE)) {
                return false;
            }

            if (button.getAttribute("aria-selected") === "true" || button.getAttribute("aria-pressed") === "true") {
                return true;
            }

            const selectedRoot = button.closest?.("[aria-selected='true'], [aria-pressed='true'], [class*='Selected'], [class*='selected']");
            return Boolean(selectedRoot);
        }

        function selectedYouTubeTabKind(mount = getMount()) {
            if (!mount?.tabList) {
                return state().nativeYouTubeTab || "";
            }

            const buttons = querySelectorAllSafe(mount.tabList, "button[role='tab'], button, [role='tab']");
            for (const button of buttons) {
                if (!isNativeOwnedTabSelected(button)) {
                    continue;
                }

                const kind = nativeOwnedTabKindFromText(deps.visibleText(button));
                if (kind) {
                    return kind;
                }
            }

            return state().nativeYouTubeTab || "";
        }

        function nativeOwnedTabButton(kind, mount = getMount()) {
            if (!kind || !mount?.tabList) {
                return null;
            }

            return querySelectorAllSafe(mount.tabList, "button[role='tab'], button, [role='tab']")
                .find((button) => !button.hasAttribute(NATIVE_PANEL_TAB_ATTRIBUTE)
                    && nativeOwnedTabKindFromText(deps.visibleText(button)) === kind)
                || null;
        }

        function selectNativeOwnedTab(kind, mount = getMount(), { preserveUserSelection = false } = {}) {
            const button = nativeOwnedTabButton(kind, mount);
            if (!button) {
                return false;
            }

            const currentState = state();
            const wasUserSelected = currentState.userSelectedTab;
            currentState.nativeExtensionTab = "";
            currentState.nativeYouTubeTab = kind;
            if (!isNativeOwnedTabSelected(button)) {
                button.click();
            }
            currentState.nativeExtensionTab = "";
            currentState.nativeYouTubeTab = kind;
            if (preserveUserSelection) {
                currentState.userSelectedTab = wasUserSelected;
            }
            syncTabs(mount);
            scheduleResync();
            return true;
        }

        function scrollElementIntoView(element, options) {
            if (!element?.scrollIntoView) {
                return;
            }

            try {
                element.scrollIntoView(options);
            } catch (_) {
                element.scrollIntoView();
            }
        }

        function focusElementWithoutScroll(element) {
            if (!element?.focus) {
                return;
            }

            try {
                element.focus({ preventScroll: true });
            } catch (_) {
                element.focus();
            }
        }

        function revealNativeOwnedTab(kind, mount = getMount(), { revealPanel = false, focus = false } = {}) {
            const button = nativeOwnedTabButton(kind, mount);
            if (!button) {
                return false;
            }

            if (revealPanel) {
                scrollElementIntoView(mount?.panel, {
                    block: "start",
                    inline: "nearest",
                    behavior: "smooth",
                });
            }

            scrollElementIntoView(nativeOwnedTabContainer(button), {
                block: "nearest",
                inline: "center",
                behavior: "smooth",
            });

            if (focus) {
                focusElementWithoutScroll(button);
            }

            return true;
        }

        function preferredExtensionTab() {
            const currentState = state();
            const kinds = extensionTabKinds();
            if (kinds.includes(currentState.activeTab)) {
                return currentState.activeTab;
            }

            if (currentState.nativeExtensionTab && kinds.includes(currentState.nativeExtensionTab)) {
                return currentState.nativeExtensionTab;
            }

            return kinds[0] || "";
        }

        function selectDefaultExtensionTab(mount = getMount()) {
            const currentState = state();
            if (currentState.userSelectedTab) {
                return;
            }

            if (currentState.timestampsSource === "youtubeChapters") {
                if (selectNativeOwnedTab("chapters", mount, { preserveUserSelection: true })) {
                    return;
                }

                currentState.nativeExtensionTab = "";
                currentState.nativeYouTubeTab = "chapters";
                currentState.activeTab = "timestamps";
                return;
            }

            const nextTab = preferredExtensionTab();
            if (!nextTab) {
                return;
            }

            currentState.nativeExtensionTab = nextTab;
            currentState.nativeYouTubeTab = "";
            currentState.activeTab = nextTab;
        }

        function hideSiblingEngagementPanels(activePanel) {
            for (const panel of doc.querySelectorAll("ytd-engagement-panel-section-list-renderer")) {
                if (panel === activePanel || panel.parentElement !== activePanel?.parentElement) {
                    continue;
                }

                if (!isNativePanelVisible(panel)) {
                    continue;
                }

                rememberNativeOwnedElementState(panel);
                panel.setAttribute("visibility", NATIVE_PANEL_VISIBILITY_HIDDEN);
                panel.hidden = true;
                panel.style.removeProperty("display");
                panel.style.removeProperty("visibility");
            }
        }

        function restoreRoot(mount) {
            return mount?.panel?.parentElement || mount?.panel || doc;
        }

        function keepVisible(mount, { hideSiblings = Boolean(state().nativeExtensionTab) } = {}) {
            const panel = mount?.panel;
            if (!panel) {
                return false;
            }

            if (hideSiblings) {
                hideSiblingEngagementPanels(panel);
            } else {
                restoreNativeOwnedElements(restoreRoot(mount));
            }

            panel.hidden = false;
            panel.removeAttribute("hidden");
            panel.setAttribute("visibility", NATIVE_PANEL_VISIBILITY_EXPANDED);
            panel.style.removeProperty("display");
            panel.style.removeProperty("visibility");
            if (win.getComputedStyle?.(panel)?.display === "none") {
                panel.style.display = "block";
            }

            return true;
        }

        function open(mount) {
            if (state().nativePanelDismissed) {
                syncPanelHostVisibility();
                return false;
            }

            if (shouldRespectYouTubeTimelineSurface()) {
                restoreNativeOwnedElements(restoreRoot(mount));
                syncPanelHostVisibility();
                syncTabs(mount);
                return true;
            }

            if (!keepVisible(mount)) {
                return false;
            }

            selectDefaultExtensionTab(mount);
            keepVisible(mount);
            return true;
        }

        function ensureStyle() {
            if (doc.getElementById(NATIVE_PANEL_STYLE_ID)) {
                return;
            }

            const style = doc.createElement("style");
            style.id = NATIVE_PANEL_STYLE_ID;
            style.textContent = `
        [${NATIVE_PANEL_TAB_WRAPPER_ATTRIBUTE}] {
            display: block;
        }

        .yts-native-panel-tab {
            appearance: none;
            border: 0;
            border-radius: 8px;
            background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05));
            color: var(--yt-spec-text-primary, #0f0f0f);
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 32px;
            padding: 0 12px;
            font: 500 14px/20px "Roboto", "Arial", sans-serif;
            white-space: nowrap;
        }

        .yts-native-panel-tab:hover {
            background: var(--yt-spec-button-chip-background-hover, rgba(0, 0, 0, 0.1));
        }

        .yts-native-panel-tab[aria-selected="true"] {
            background: var(--yt-spec-text-primary, #0f0f0f);
            color: var(--yt-spec-text-primary-inverse, #fff);
        }

        .yts-native-panel-tab[aria-busy="true"] {
            opacity: 0.72;
        }

        html[dark] .yts-native-panel-tab[aria-selected="true"],
        [dark] .yts-native-panel-tab[aria-selected="true"] {
            background: var(--yt-spec-static-brand-white, #f1f1f1);
            color: #0f0f0f;
        }

        #${sidebarHostID}[data-yts-placement="native"] {
            display: block;
            width: 100%;
            min-height: 0;
        }

        .yts-native-header-actions {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
            margin-left: auto;
        }

        .yts-native-header-copy-button {
            appearance: none;
            border: 0;
            border-radius: 999px;
            background: transparent;
            color: var(--yt-spec-icon-inactive, var(--yt-spec-text-secondary, #606060));
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            padding: 8px;
            opacity: 0.72;
            transition: background 120ms ease, color 120ms ease, opacity 120ms ease;
        }

        .yts-native-header-copy-button svg {
            display: block;
            fill: currentColor;
            width: 20px;
            height: 20px;
        }

        .yts-native-header-copy-button:hover:not(:disabled),
        .yts-native-header-copy-button[data-copied="true"] {
            background: var(--yt-spec-button-chip-background-hover, rgba(0, 0, 0, 0.1));
            color: var(--yt-spec-text-primary, #0f0f0f);
            opacity: 1;
        }

        .yts-native-header-copy-button:disabled {
            cursor: default;
            opacity: 0.28;
        }
    `;
            doc.documentElement.append(style);
        }

        function cleanupTabs(activeTabList = null) {
            restoreHiddenNativeOwnedTabs(activeTabList || doc);
            for (const wrapper of doc.querySelectorAll(`[${NATIVE_PANEL_TAB_WRAPPER_ATTRIBUTE}]`)) {
                if (activeTabList && activeTabList.contains(wrapper)) {
                    continue;
                }
                wrapper.remove();
            }
        }

        function cleanupHeaderActions(activePanel = null) {
            for (const action of doc.querySelectorAll(`[${NATIVE_PANEL_HEADER_ACTION_ATTRIBUTE}]`)) {
                if (activePanel && activePanel.contains(action)) {
                    continue;
                }
                action.remove();
            }
        }

        function clearResync() {
            for (const timeoutID of nativePanelResyncTimeouts) {
                win.clearTimeout(timeoutID);
            }
            nativePanelResyncTimeouts = [];
        }

        function clearTabSwitch() {
            if (nativePanelTabSwitchTimeout !== null) {
                win.clearTimeout(nativePanelTabSwitchTimeout);
                nativePanelTabSwitchTimeout = null;
            }
            if (nativePanelTabSwitchGraceTimeout !== null) {
                win.clearTimeout(nativePanelTabSwitchGraceTimeout);
                nativePanelTabSwitchGraceTimeout = null;
            }
            nativePanelTabSwitchInProgress = false;
        }

        function beginNativeTabSwitchGrace() {
            if (nativePanelTabSwitchGraceTimeout !== null) {
                win.clearTimeout(nativePanelTabSwitchGraceTimeout);
            }
            nativePanelTabSwitchInProgress = true;
            nativePanelTabSwitchGraceTimeout = win.setTimeout(() => {
                nativePanelTabSwitchGraceTimeout = null;
                nativePanelTabSwitchInProgress = false;
            }, NATIVE_PANEL_NATIVE_TAB_HANDOFF_GRACE_MS);
        }

        function syncPanelHostVisibility() {
            const host = panelHost();
            if (!host || host.dataset.ytsPlacement !== "native") {
                return;
            }

            host.hidden = !state().nativeExtensionTab;
            if (host.hidden) {
                host.setAttribute("hidden", "");
            } else {
                host.removeAttribute("hidden");
            }
        }

        function shouldRespectYouTubeTimelineSurface() {
            const currentState = state();
            return currentState.userSelectedTab
                && !currentState.nativeExtensionTab
                && currentState.nativeYouTubeTab === "timeline";
        }

        function syncTabsIfMounted() {
            const mount = getMount();
            if (!mount) {
                return null;
            }

            if (state().nativePanelDismissed) {
                syncPanelHostVisibility();
                return mount;
            }

            if (shouldRespectYouTubeTimelineSurface()) {
                restoreNativeOwnedElements(restoreRoot(mount));
                syncPanelHostVisibility();
                return syncTabs(mount);
            }

            keepVisible(mount);
            return syncTabs(mount);
        }

        function scheduleResync() {
            clearResync();
            for (const delay of NATIVE_PANEL_RESYNC_DELAYS_MS) {
                const timeoutID = win.setTimeout(() => {
                    nativePanelResyncTimeouts = nativePanelResyncTimeouts.filter((id) => id !== timeoutID);
                    const mount = syncTabsIfMounted();
                    if (mount && panelHost()?.dataset.ytsPlacement === "native") {
                        syncBodyViewport(mount);
                    }
                }, delay);
                nativePanelResyncTimeouts.push(timeoutID);
            }
        }

        function scheduleNativeOwnedTabSelection(nativeYouTubeTab = "") {
            const nextNativeYouTubeTab = nativeYouTubeTab || selectedYouTubeTabKind();
            if (!nextNativeYouTubeTab) {
                return;
            }

            const mount = getMount();
            if (mount) {
                restoreNativeOwnedElements(restoreRoot(mount));
            }
            clearResync();
            clearTabSwitch();
            beginNativeTabSwitchGrace();

            nativePanelTabSwitchTimeout = win.setTimeout(() => {
                nativePanelTabSwitchTimeout = null;
                clearExtensionTab(nextNativeYouTubeTab);
            }, 0);
        }

        function restoreNativeOwnedElements(root = doc) {
            for (const element of querySelectorAllSafe(root, `[${NATIVE_PANEL_HIDDEN_BY_EXTENSION_ATTRIBUTE}]`)) {
                const previousDisplay = element.getAttribute(NATIVE_PANEL_PREVIOUS_DISPLAY_ATTRIBUTE) || "";
                if (previousDisplay) {
                    element.style.display = previousDisplay;
                } else {
                    element.style.removeProperty("display");
                }

                if (element.hasAttribute(NATIVE_PANEL_PREVIOUS_HIDDEN_ATTRIBUTE)) {
                    const previousHidden = element.getAttribute(NATIVE_PANEL_PREVIOUS_HIDDEN_ATTRIBUTE);
                    element.hidden = previousHidden === "true";
                    if (previousHidden === "true") {
                        element.setAttribute("hidden", "");
                    } else {
                        element.removeAttribute("hidden");
                    }
                }

                if (element.hasAttribute(NATIVE_PANEL_PREVIOUS_VISIBILITY_ATTRIBUTE)) {
                    const previousVisibility = element.getAttribute(NATIVE_PANEL_PREVIOUS_VISIBILITY_ATTRIBUTE) || "";
                    if (previousVisibility) {
                        element.setAttribute("visibility", previousVisibility);
                    } else {
                        element.removeAttribute("visibility");
                    }
                }

                element.removeAttribute(NATIVE_PANEL_HIDDEN_BY_EXTENSION_ATTRIBUTE);
                element.removeAttribute(NATIVE_PANEL_PREVIOUS_DISPLAY_ATTRIBUTE);
                element.removeAttribute(NATIVE_PANEL_PREVIOUS_HIDDEN_ATTRIBUTE);
                element.removeAttribute(NATIVE_PANEL_PREVIOUS_VISIBILITY_ATTRIBUTE);
            }
        }

        function rememberNativeOwnedElementState(element) {
            if (!element || element.hasAttribute(NATIVE_PANEL_HIDDEN_BY_EXTENSION_ATTRIBUTE)) {
                return;
            }

            element.setAttribute(NATIVE_PANEL_PREVIOUS_DISPLAY_ATTRIBUTE, element.style.display || "");
            element.setAttribute(NATIVE_PANEL_PREVIOUS_HIDDEN_ATTRIBUTE, element.hidden ? "true" : "false");
            element.setAttribute(NATIVE_PANEL_PREVIOUS_VISIBILITY_ATTRIBUTE, element.getAttribute("visibility") || "");
            element.setAttribute(NATIVE_PANEL_HIDDEN_BY_EXTENSION_ATTRIBUTE, "");
        }

        function hideNativeOwnedElement(element) {
            if (!element || element === panelHost() || panelHost()?.contains(element)) {
                return;
            }

            rememberNativeOwnedElementState(element);
            element.style.display = "none";
        }

        function syncContentVisibility(mount = getMount()) {
            if (!mount?.panel) {
                restoreNativeOwnedElements();
                return;
            }

            restoreNativeOwnedElements(mount.panel);
            if (!state().nativeExtensionTab) {
                restoreNativeOwnedElements(restoreRoot(mount));
                return;
            }

            for (const child of Array.from(mount.content?.children || [])) {
                if (child !== panelHost()) {
                    hideNativeOwnedElement(child);
                }
            }

            for (const transcriptSearch of querySelectorAllSafe(mount.panel, "ytd-transcript-search-panel-renderer")) {
                hideNativeOwnedElement(transcriptSearch);
            }
        }

        function nativeOwnedTabContainer(button) {
            return button?.closest?.(".ytChipBarViewModelChipWrapper, [role='presentation']")
                || button?.parentElement
                || button
                || null;
        }

        function restoreHiddenNativeOwnedTabs(root = doc) {
            for (const element of querySelectorAllSafe(root, `[${NATIVE_PANEL_NATIVE_TAB_HIDDEN_ATTRIBUTE}]`)) {
                const previousDisplay = element.getAttribute(NATIVE_PANEL_NATIVE_TAB_PREVIOUS_DISPLAY_ATTRIBUTE) || "";
                if (previousDisplay) {
                    element.style.display = previousDisplay;
                } else {
                    element.style.removeProperty("display");
                }

                element.removeAttribute(NATIVE_PANEL_NATIVE_TAB_HIDDEN_ATTRIBUTE);
                element.removeAttribute(NATIVE_PANEL_NATIVE_TAB_PREVIOUS_DISPLAY_ATTRIBUTE);
            }
        }

        function hideNativeOwnedTabElement(element) {
            if (!element || element.hasAttribute(NATIVE_PANEL_NATIVE_TAB_HIDDEN_ATTRIBUTE)) {
                return;
            }

            element.setAttribute(NATIVE_PANEL_NATIVE_TAB_PREVIOUS_DISPLAY_ATTRIBUTE, element.style.display || "");
            element.setAttribute(NATIVE_PANEL_NATIVE_TAB_HIDDEN_ATTRIBUTE, "");
            element.style.display = "none";
        }

        function shouldHideNativeOwnedTab(kind) {
            return kind === "chapters"
                && state().nativeChaptersOverridden
                && extensionTabKinds().includes("timestamps");
        }

        function syncNativeOwnedTabVisibility(mount = getMount()) {
            if (!mount?.tabList) {
                restoreHiddenNativeOwnedTabs();
                return;
            }

            restoreHiddenNativeOwnedTabs(mount.tabList);
            for (const button of querySelectorAllSafe(mount.tabList, "button[role='tab'], button, [role='tab']")) {
                if (button.hasAttribute(NATIVE_PANEL_TAB_ATTRIBUTE)) {
                    continue;
                }

                const kind = nativeOwnedTabKindFromText(deps.visibleText(button));
                if (shouldHideNativeOwnedTab(kind)) {
                    hideNativeOwnedTabElement(nativeOwnedTabContainer(button));
                }
            }
        }

        function nativeTabWrapper(kind) {
            const wrapper = doc.createElement("div");
            wrapper.setAttribute(NATIVE_PANEL_TAB_WRAPPER_ATTRIBUTE, "");
            wrapper.dataset.ytsKind = kind;
            wrapper.setAttribute("role", "presentation");
            wrapper.className = "ytChipBarViewModelChipWrapper";

            const button = doc.createElement("button");
            button.type = "button";
            button.className = "yts-native-panel-tab";
            button.setAttribute("role", "tab");
            button.setAttribute(NATIVE_PANEL_TAB_ATTRIBUTE, kind);
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                void handleExtensionTabSelection(kind);
            });

            wrapper.append(button);
            return wrapper;
        }

        function panelHeader(panel) {
            return panel?.querySelector?.("ytd-engagement-panel-title-header-renderer")
                || panel?.querySelector?.("#header")
                || null;
        }

        function panelCloseControl(header) {
            const selectors = [
                "#dismiss-button",
                "#close-button",
                "#visibility-button",
                "button[aria-label*='Close' i]",
                "button[aria-label*='Dismiss' i]",
                "tp-yt-paper-icon-button[aria-label*='Close' i]",
                "tp-yt-paper-icon-button[aria-label*='Dismiss' i]",
                "yt-icon-button[aria-label*='Close' i]",
                "yt-icon-button[aria-label*='Dismiss' i]",
            ];

            for (const selector of selectors) {
                const control = querySelectorAllSafe(header, selector).find(Boolean);
                if (control) {
                    return control.closest?.("button, tp-yt-paper-icon-button, yt-icon-button, ytd-button-renderer, yt-button-shape")
                        || control;
                }
            }

            return null;
        }

        function isNativePanelCloseTarget(rawTarget, target, mount = getMount()) {
            if (!rawTarget || !mount?.panel) {
                return false;
            }

            const header = panelHeader(mount.panel);
            if (!header?.contains?.(rawTarget)) {
                return false;
            }

            const control = panelCloseControl(header);
            if (!control) {
                return false;
            }

            return control === rawTarget
                || control === target
                || Boolean(control.contains?.(rawTarget))
                || Boolean(control.contains?.(target))
                || Boolean(target?.contains?.(control));
        }

        function dismissNativePanel(mount = getMount()) {
            const currentState = state();
            currentState.nativePanelDismissed = true;
            currentState.nativeExtensionTab = "";
            currentState.nativeYouTubeTab = "";
            currentState.userSelectedTab = true;
            clearTranscriptCopyRefresh();
            clearTabSwitch();
            clearResync();
            restoreNativeOwnedElements(restoreRoot(mount));
            syncPanelHostVisibility();
            syncContentVisibility(mount);
            cleanupHeaderActions();
        }

        function headerActionHost(panel) {
            const header = panelHeader(panel);
            if (!header) {
                return null;
            }

            let host = header.querySelector(`[${NATIVE_PANEL_HEADER_ACTION_ATTRIBUTE}]`);
            if (host) {
                return host;
            }

            host = doc.createElement("div");
            host.className = "yts-native-header-actions";
            host.setAttribute(NATIVE_PANEL_HEADER_ACTION_ATTRIBUTE, "");

            const closeControl = panelCloseControl(header);
            if (closeControl?.parentElement) {
                closeControl.parentElement.insertBefore(host, closeControl);
                return host;
            }

            header.append(host);
            return host;
        }

        function stopHeaderCopyEvent(event) {
            event.stopPropagation();
            event.stopImmediatePropagation?.();
        }

        function clearTranscriptCopyRefresh() {
            if (transcriptCopyRefreshTimeout !== null) {
                win.clearTimeout(transcriptCopyRefreshTimeout);
                transcriptCopyRefreshTimeout = null;
            }
        }

        function scheduleTranscriptCopyRefresh(mount = getMount()) {
            if (transcriptCopyRefreshTimeout !== null || headerCopyKind(mount) !== "transcript" || deps.transcriptCopyText()) {
                return;
            }

            deps.prefetchTranscriptForCopy();

            const run = (attemptIndex) => {
                transcriptCopyRefreshTimeout = null;
                if (headerCopyKind() !== "transcript") {
                    return;
                }

                if (deps.transcriptCopyText()) {
                    syncHeaderCopyButton();
                    return;
                }

                const nextDelay = TRANSCRIPT_COPY_REFRESH_DELAYS_MS[attemptIndex + 1];
                if (typeof nextDelay !== "number") {
                    return;
                }

                transcriptCopyRefreshTimeout = win.setTimeout(() => run(attemptIndex + 1), nextDelay);
            };

            transcriptCopyRefreshTimeout = win.setTimeout(() => run(0), TRANSCRIPT_COPY_REFRESH_DELAYS_MS[0]);
        }

        function headerCopyKind(mount = getMount()) {
            const currentState = state();
            if (currentState.nativeExtensionTab) {
                return currentState.activeTab;
            }

            const nativeKind = selectedYouTubeTabKind(mount);
            return nativeKind === "transcript" ? "transcript" : "";
        }

        function syncHeaderCopyButton(mount = getMount()) {
            const copyKind = headerCopyKind(mount);
            if (!mount?.panel || !copyKind) {
                clearTranscriptCopyRefresh();
                cleanupHeaderActions();
                return null;
            }

            cleanupHeaderActions(mount.panel);
            ensureStyle();
            const host = headerActionHost(mount.panel);
            if (!host) {
                return null;
            }

            let button = host.querySelector(`[${NATIVE_PANEL_HEADER_COPY_ATTRIBUTE}]`);
            if (!button) {
                button = doc.createElement("button");
                button.type = "button";
                button.className = "yts-native-header-copy-button";
                button.setAttribute(NATIVE_PANEL_HEADER_COPY_ATTRIBUTE, "");
                button.addEventListener("pointerdown", stopHeaderCopyEvent, true);
                button.addEventListener("mousedown", stopHeaderCopyEvent, true);
                button.addEventListener("touchstart", stopHeaderCopyEvent, true);
                button.addEventListener("click", (event) => {
                    event.preventDefault();
                    stopHeaderCopyEvent(event);
                    void deps.copyHeaderResult();
                });
                host.append(button);
            }

            if (copyKind === "transcript" && !deps.cachedTranscriptCopyText()) {
                deps.prefetchTranscriptForCopy();
            }

            const label = deps.copyButtonLabel(copyKind);
            const canCopy = deps.hasCopyText(copyKind);
            button.dataset.copied = state().copyFeedback[copyKind] ? "true" : "false";
            button.disabled = !canCopy;
            button.setAttribute("aria-label", label);
            button.setAttribute("title", label);
            button.innerHTML = deps.copyIcon();

            if (copyKind === "transcript" && !canCopy) {
                scheduleTranscriptCopyRefresh(mount);
            } else {
                clearTranscriptCopyRefresh();
            }

            return button;
        }

        function clearExtensionTab(nativeYouTubeTab = "") {
            const currentState = state();
            const nextNativeYouTubeTab = nativeYouTubeTab || selectedYouTubeTabKind();
            if (!currentState.nativeExtensionTab) {
                if (nextNativeYouTubeTab) {
                    currentState.nativeYouTubeTab = nextNativeYouTubeTab;
                    syncTabs();
                    syncPanelHostVisibility();
                    scheduleResync();
                }
                return;
            }

            currentState.nativeExtensionTab = "";
            currentState.nativeYouTubeTab = nextNativeYouTubeTab;
            currentState.userSelectedTab = true;
            syncTabs();
            syncPanelHostVisibility();
            scheduleResync();
        }

        function handleYouTubeControlClick(event) {
            const rawTarget = event.target || null;
            const target = rawTarget?.closest?.("button, [role='button'], a, tp-yt-paper-icon-button, yt-icon-button, ytd-button-renderer, yt-button-shape");
            const mount = getMount();
            if (isNativePanelCloseTarget(rawTarget, target, mount)) {
                dismissNativePanel(mount);
                return;
            }

            if (!target || target.hasAttribute(NATIVE_PANEL_TAB_ATTRIBUTE) || panelHost()?.contains(target)) {
                return;
            }

            const nativeYouTubeTab = nativeOwnedTabKindFromText(deps.visibleText(target));
            if (!nativeYouTubeTab) {
                return;
            }

            const clickIsNativeTab = Boolean(mount?.tabList?.contains(target));
            const currentState = state();
            currentState.nativePanelDismissed = false;
            if (nativeYouTubeTab === "transcript" && !clickIsNativeTab && nativeOwnedTabButton("transcript", mount)) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation?.();
                currentState.userSelectedTab = true;
                restoreNativeOwnedElements(restoreRoot(mount));
                keepVisible(mount, { hideSiblings: false });
                selectNativeOwnedTab("transcript", mount);
                revealNativeOwnedTab("transcript", mount, { revealPanel: true, focus: true });
                syncPanelHostVisibility();
                scheduleResync();
                return;
            }

            if (!currentState.nativeExtensionTab) {
                currentState.userSelectedTab = true;
                currentState.nativeYouTubeTab = nativeYouTubeTab;
                scheduleNativeOwnedTabSelection(nativeYouTubeTab);
                return;
            }

            currentState.userSelectedTab = true;
            scheduleNativeOwnedTabSelection(nativeYouTubeTab);
        }

        function attachNativeOwnedTabListener(tabList) {
            if (tabList.dataset.ytsNativeTabListener === "true") {
                return;
            }

            tabList.dataset.ytsNativeTabListener = "true";
            tabList.addEventListener("click", (event) => {
                const target = event.target?.closest?.("button[role='tab'], button");
                if (!target || target.hasAttribute(NATIVE_PANEL_TAB_ATTRIBUTE)) {
                    return;
                }

                scheduleNativeOwnedTabSelection(nativeOwnedTabKindFromText(deps.visibleText(target)));
            }, true);
        }

        function syncTabs(mount = getMount()) {
            if (!mount) {
                if (nativePanelTabSwitchInProgress) {
                    syncPanelHostVisibility();
                    return null;
                }
                cleanupTabs();
                cleanupHeaderActions();
                syncContentVisibility(null);
                syncBodyViewport(null);
                return null;
            }

            ensureStyle();
            cleanupTabs(mount.tabList);
            attachNativeOwnedTabListener(mount.tabList);

            const desiredKinds = extensionTabKinds();
            const desired = new Set(desiredKinds);
            for (const wrapper of Array.from(mount.tabList.querySelectorAll(`[${NATIVE_PANEL_TAB_WRAPPER_ATTRIBUTE}]`))) {
                if (!desired.has(wrapper.dataset.ytsKind || "")) {
                    wrapper.remove();
                }
            }

            for (const kind of desiredKinds) {
                let wrapper = mount.tabList.querySelector(`[${NATIVE_PANEL_TAB_WRAPPER_ATTRIBUTE}][data-yts-kind="${kind}"]`);
                if (!wrapper) {
                    wrapper = nativeTabWrapper(kind);
                    mount.tabList.append(wrapper);
                }

                const button = wrapper.querySelector(`[${NATIVE_PANEL_TAB_ATTRIBUTE}]`);
                if (!button) {
                    continue;
                }

                const currentState = state();
                const selected = currentState.nativeExtensionTab === kind;
                button.textContent = tabLabel(kind);
                button.setAttribute("aria-label", tabAriaLabel(kind));
                button.setAttribute("aria-selected", selected ? "true" : "false");
                button.setAttribute("aria-busy", currentState.isLoading[kind] ? "true" : "false");
            }

            reorderTabs(mount);
            syncNativeOwnedTabVisibility(mount);
            syncOwnedTabPressedState(mount);
            syncContentVisibility(mount);
            syncBodyViewport(mount);
            syncHeaderCopyButton(mount);
            return mount;
        }

        function syncOwnedTabPressedState(mount = getMount()) {
            if (!mount?.tabList) {
                return;
            }

            const extensionTabIsActive = Boolean(state().nativeExtensionTab);
            const selectedNativeTab = extensionTabIsActive ? "" : state().nativeYouTubeTab;
            mount.tabList.dataset.ytsExtensionTabActive = extensionTabIsActive ? "true" : "false";

            for (const button of mount.tabList.querySelectorAll("button[role='tab'], button")) {
                if (button.hasAttribute(NATIVE_PANEL_TAB_ATTRIBUTE)) {
                    continue;
                }

                if (!extensionTabIsActive && !selectedNativeTab) {
                    continue;
                }

                const selected = !extensionTabIsActive
                    && nativeOwnedTabKindFromText(deps.visibleText(button)) === selectedNativeTab;
                button.setAttribute("aria-selected", selected ? "true" : "false");
                if (button.hasAttribute("aria-pressed")) {
                    button.setAttribute("aria-pressed", selected ? "true" : "false");
                }

                const chip = button.querySelector(".ytChipShapeChip, [class*='ytChipShapeChip']");
                if (chip?.classList) {
                    chip.classList.toggle("ytChipShapeSelected", selected);
                    chip.classList.toggle("ytChipShapeActive", selected);
                    chip.classList.toggle("ytChipShapeInactive", !selected);
                }
            }
        }

        async function handleExtensionTabSelection(kind) {
            clearTabSwitch();
            const currentState = state();
            currentState.activeTab = kind;
            currentState.nativeExtensionTab = kind;
            currentState.nativeYouTubeTab = "";
            currentState.nativePanelDismissed = false;
            currentState.userSelectedTab = true;
            deps.render();
            syncTabs();
            scheduleResync();

            if (kind === "timestamps") {
                await deps.maybeGenerateTimestamps();
                return;
            }

            await deps.maybeGenerateSummary();
        }

        function syncBodyViewport(mount = getMount()) {
            const host = panelHost();
            if (!host || host.dataset.ytsPlacement !== "native" || !mount?.panel || !mount?.content) {
                host?.style?.removeProperty("--yts-native-body-height");
                host?.style?.removeProperty("--yts-native-body-max-height");
                return;
            }

            const root = host.shadowRoot;
            const nativeBody = root?.querySelector?.(".native-body");
            const bodyRect = nativeBody?.getBoundingClientRect?.();
            const hostRect = host.getBoundingClientRect?.();
            const contentRect = mount.content.getBoundingClientRect?.();
            const panelRect = mount.panel.getBoundingClientRect?.();
            const top = bodyRect?.top || hostRect?.top || contentRect?.top || 0;
            const bottomCandidates = [
                panelRect?.bottom,
                win.innerHeight,
            ].filter((value) => Number.isFinite(value) && value > top);
            if (!Number.isFinite(top) || bottomCandidates.length === 0) {
                return;
            }

            const availableHeight = Math.floor(Math.min(...bottomCandidates) - top - NATIVE_PANEL_VIEWPORT_BOTTOM_GAP_PX);
            if (!Number.isFinite(top) || availableHeight <= 0) {
                return;
            }

            const minimumHeight = Math.min(NATIVE_PANEL_BODY_MIN_HEIGHT_PX, availableHeight);
            const stableHeight = Math.max(
                minimumHeight,
                Math.min(NATIVE_PANEL_BODY_MAX_HEIGHT_PX, availableHeight)
            );

            host.style.setProperty("--yts-native-body-height", `${stableHeight}px`);
            host.style.setProperty("--yts-native-body-max-height", `${stableHeight}px`);
        }

        return {
            cleanupHeaderActions,
            cleanupTabs,
            clearResync,
            clearTabSwitch,
            clearTranscriptCopyRefresh,
            extensionTabKinds,
            getMount,
            handleYouTubeControlClick,
            headerCopyKind,
            open,
            scheduleResync,
            scheduleTranscriptCopyRefresh,
            selectDefaultExtensionTab,
            syncBodyViewport,
            syncContentVisibility,
            syncTabs,
        };
    }

    globalScope.YouTubeTimestampsNativePanel = {
        createNativePanelController,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = globalScope.YouTubeTimestampsNativePanel;
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
