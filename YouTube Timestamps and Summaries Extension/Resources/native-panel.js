(function (globalScope) {
    const NATIVE_PANEL_STYLE_ID = "youtube-timestamps-native-panel-style";
    const NATIVE_PANEL_TAB_WRAPPER_ATTRIBUTE = "data-yts-native-tab-wrapper";
    const NATIVE_PANEL_TAB_ATTRIBUTE = "data-yts-native-tab";
    const NATIVE_PANEL_HEADER_ACTION_ATTRIBUTE = "data-yts-native-header-action";
    const NATIVE_PANEL_HEADER_COPY_ATTRIBUTE = "data-yts-native-header-copy";
    const NATIVE_PANEL_CONTENT_ACTIVE_ATTRIBUTE = "data-yts-extension-content-active";
    const NATIVE_PANEL_SIBLING_SUPPRESSED_ATTRIBUTE = "data-yts-native-sibling-suppressed";
    const NATIVE_PANEL_NATIVE_TAB_HIDDEN_ATTRIBUTE = "data-yts-native-owned-tab-hidden";
    const NATIVE_PANEL_NATIVE_TAB_PREVIOUS_DISPLAY_ATTRIBUTE = "data-yts-native-owned-tab-previous-display";
    const NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE = "data-yts-native-owned-tab-visually-inactive";
    const NATIVE_PANEL_VISIBILITY_EXPANDED = "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED";
    const NATIVE_PANEL_VISIBILITY_HIDDEN = "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN";
    const NATIVE_PANEL_TAB_ORDER = ["chapters", "summary", "transcript", "timeline"];
    const TRANSCRIPT_COPY_REFRESH_DELAYS_MS = [0, 150, 450, 900, 1500];
    const NATIVE_PANEL_BODY_MIN_HEIGHT_PX = 260;
    const NATIVE_PANEL_BODY_MAX_HEIGHT_PX = 620;
    const NATIVE_PANEL_VIEWPORT_BOTTOM_GAP_PX = 16;
    const NATIVE_PANEL_RESYNC_DELAY_MS = 0;

    function createPanelCloseLifecycle() {
        let phase = "idle";

        return {
            begin() {
                phase = "closing";
            },
            reset() {
                phase = "idle";
            },
            reconcile({ dismissed, visible }) {
                if (!dismissed) {
                    phase = "idle";
                    return { blockOpen: false, reopened: false };
                }

                if (!visible) {
                    phase = "closed";
                    return { blockOpen: true, reopened: false };
                }

                if (phase === "closed") {
                    phase = "idle";
                    return { blockOpen: false, reopened: true };
                }

                // The close control fires before YouTube changes the panel's
                // visibility. Treat that still-visible frame as closing, not
                // as evidence that the panel was opened again.
                return { blockOpen: true, reopened: false };
            },
        };
    }

    function createNativePanelController(deps) {
        let nativePanelResyncTimeouts = [];
        let nativePanelTabSwitchTimeout = null;
        let nativePanelDismissTimeout = null;
        let transcriptCopyRefreshTimeout = null;
        let activeNativeContent = null;
        const wiredNativeTabLists = new WeakSet();
        const wiredHeaderActionHosts = new WeakSet();
        const wiredHeaderCopyButtons = new WeakSet();
        const panelCloseLifecycle = createPanelCloseLifecycle();

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

        function setAttributeIfChanged(element, name, value) {
            const nextValue = String(value);
            if (element.getAttribute(name) !== nextValue) {
                element.setAttribute(name, nextValue);
            }
        }

        function setTextContentIfChanged(element, value) {
            const nextValue = String(value);
            if (element.textContent !== nextValue) {
                element.textContent = nextValue;
            }
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
            const panels = Array.from(doc.querySelectorAll("ytd-engagement-panel-section-list-renderer"));
            for (const panel of panels) {
                const title = nativePanelTitle(panel);
                if (title === "In this video") {
                    return panel;
                }
            }

            // The parent shell has no stable target-id. During some YouTube
            // experiments its title arrives after the chip row, so identify
            // it only from recognized native tab semantics. Never use a raw
            // button count: generic panels such as Description can briefly
            // expose tab-list-like markup while YouTube initializes them.
            for (const panel of panels) {
                if (panel.getAttribute("target-id")) {
                    continue;
                }

                const tabList = panel.querySelector?.("chip-bar-view-model [role='tablist'], #subheader [role='tablist'], [role='tablist']");
                if (!tabList) {
                    continue;
                }

                const nativeButtons = querySelectorAllSafe(tabList, "button[role='tab'], button, [role='tab']");
                const nativeKinds = new Set(
                    nativeButtons
                        .map((button) => nativeOwnedTabKindFromText(deps.visibleText(button)))
                        .filter(Boolean)
                );
                if (
                    nativeKinds.has("transcript")
                    || (nativeKinds.has("chapters") && nativeKinds.has("timeline"))
                ) {
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
            return ["timestamps", "summary"];
        }

        function tabLabel(kind) {
            if (kind === "timestamps") {
                return state().isLoading.timestamps || deps.isTimestampChapterDiscoveryPending?.()
                    ? "Chapters..."
                    : "Chapters";
            }

            return deps.buttonLabel(kind);
        }

        function tabAriaLabel(kind) {
            return kind === "timestamps" ? "Chapters" : "Summary";
        }

        function nativeOwnedTabKindFromText(value) {
            const text = String(value || "").toLowerCase();
            if (/\b(?:transcript|transcription|transkript|transkrip|prepis|přepis|transcripci[oó]n|trascrizione)\b/.test(text)) {
                return "transcript";
            }
            if (/\b(?:chapters?|key\s+moments?|moments?\s+cl[eé]s?|momentos?\s+clave|momenti\s+chiave|schl[uü]sselmomente|belangrijke\s+momenten|kl[ií]čov[eé]\s+momenty|kľúčov[eé]\s+momenty|kluczowe\s+momenty|kapitel|kapitoly|kapitola|chapitres?|cap[ií]tulos?|capitoli|rozdziały|hoofdstukken)\b/.test(text)) {
                return "chapters";
            }
            if (/\b(?:timeline|zeitachse|chronologie|l[ií]nea\s+de\s+tiempo)\b/.test(text) || text.includes("časová os")) {
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

            const orderedEntries = [...entries].sort((a, b) => {
                const orderDelta = tabOrderIndex(a.kind) - tabOrderIndex(b.kind);
                return orderDelta || a.sourceIndex - b.sourceIndex;
            });

            if (entries.every((entry, index) => entry.item === orderedEntries[index].item)) {
                return;
            }

            for (const entry of orderedEntries) {
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

        function hasNativeOwnedTab(kind, mount = getMount()) {
            return Boolean(nativeOwnedTabButton(kind, mount));
        }

        function hasNativeChapterSurface() {
            if (hasNativeOwnedTab("chapters")) {
                return true;
            }

            return Array.from(doc.querySelectorAll("ytd-engagement-panel-section-list-renderer"))
                .some((panel) => nativeOwnedTabKindFromText(nativePanelTitle(panel)) === "chapters");
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

            const nextTab = preferredExtensionTab();
            if (!nextTab) {
                return;
            }

            currentState.nativeExtensionTab = nextTab;
            currentState.nativeYouTubeTab = "";
            currentState.activeTab = nextTab;
        }

        function showNativePanel(mount) {
            const panel = mount?.panel;
            if (!panel) {
                return false;
            }

            panel.hidden = false;
            panel.removeAttribute("hidden");
            panel.setAttribute("visibility", NATIVE_PANEL_VISIBILITY_EXPANDED);
            panel.style.removeProperty("visibility");
            if (win.getComputedStyle?.(panel)?.display === "none") {
                panel.style.display = "block";
            }

            return isNativePanelVisible(panel);
        }

        function open(mount) {
            const panel = mount?.panel;
            if (!panel) {
                return false;
            }

            const wasVisible = isNativePanelVisible(panel);
            const currentState = state();
            const closeState = panelCloseLifecycle.reconcile({
                dismissed: Boolean(currentState.nativePanelDismissed),
                visible: wasVisible,
            });
            if (closeState.blockOpen) {
                syncPanelHostVisibility();
                return false;
            }
            if (closeState.reopened) {
                // The panel became hidden after the close and was made visible
                // again later. Preserve its last selected surface on reopen.
                currentState.nativePanelDismissed = false;
            }

            if (
                !wasVisible
                && currentState.userSelectedTab
                && !currentState.nativeExtensionTab
                && currentState.nativeYouTubeTab
            ) {
                // Transcript and Timeline may move to a sibling engagement
                // surface. Once a person chooses a YouTube-owned tab, do not
                // reopen this panel behind YouTube's back during reconciliation.
                syncPanelHostVisibility();
                return false;
            }

            if (!wasVisible && !showNativePanel(mount)) {
                return false;
            }

            selectDefaultExtensionTab(mount);
            syncTabs(mount);
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

        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}].ytChipBarViewModelChipWrapper,
        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}][role='presentation'],
        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}][role='tab'],
        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}] button,
        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}] [role='tab'] {
            background: transparent !important;
            color: var(--yt-spec-text-primary, #0f0f0f) !important;
            box-shadow: none !important;
        }

        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}].ytChipBarViewModelChipWrapper::before,
        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}].ytChipBarViewModelChipWrapper::after,
        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}][role='presentation']::before,
        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}][role='presentation']::after,
        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}] button::before,
        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}] button::after,
        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}] [role='tab']::before,
        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}] [role='tab']::after {
            background: transparent !important;
            box-shadow: none !important;
        }

        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}] .ytChipShapeChip {
            background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05)) !important;
            color: var(--yt-spec-text-primary, #0f0f0f) !important;
            box-shadow: none !important;
        }

        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}] .ytChipShapeChip::before,
        [${NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE}] .ytChipShapeChip::after {
            background: transparent !important;
            box-shadow: none !important;
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

        [${NATIVE_PANEL_CONTENT_ACTIVE_ATTRIBUTE}] > :not(#${sidebarHostID}) {
            display: none !important;
        }

        [${NATIVE_PANEL_SIBLING_SUPPRESSED_ATTRIBUTE}] {
            display: none !important;
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

        .yts-native-header-copy-button[data-copied="true"] {
            color: #2e9b4b;
        }

        .yts-native-header-copy-button[data-copied="true"] svg {
            animation: yts-native-copy-confirmation 320ms ease-out;
        }

        @keyframes yts-native-copy-confirmation {
            0% { opacity: 0; transform: scale(0.55); }
            65% { opacity: 1; transform: scale(1.18); }
            100% { opacity: 1; transform: scale(1); }
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
        }

        function clearDismissTimeout() {
            if (nativePanelDismissTimeout !== null) {
                win.clearTimeout(nativePanelDismissTimeout);
                nativePanelDismissTimeout = null;
            }
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

        function syncTabsIfMounted() {
            const mount = getMount({ requireVisible: true });
            if (!mount) {
                return null;
            }

            return syncTabs(mount);
        }

        function scheduleResync() {
            clearResync();
            const timeoutID = win.setTimeout(() => {
                nativePanelResyncTimeouts = nativePanelResyncTimeouts.filter((id) => id !== timeoutID);
                const mount = syncTabsIfMounted();
                if (mount && panelHost()?.dataset.ytsPlacement === "native") {
                    syncBodyViewport(mount);
                }
            }, NATIVE_PANEL_RESYNC_DELAY_MS);
            nativePanelResyncTimeouts.push(timeoutID);
        }

        function scheduleNativeOwnedTabSelection(nativeYouTubeTab = "") {
            clearResync();
            clearTabSwitch();
            nativePanelTabSwitchTimeout = win.setTimeout(() => {
                nativePanelTabSwitchTimeout = null;
                clearExtensionTab(nativeYouTubeTab || selectedYouTubeTabKind() || "native");
            }, 0);
        }

        function syncContentVisibility(mount = getMount()) {
            const nextContent = mount?.content || null;
            if (activeNativeContent && activeNativeContent !== nextContent) {
                activeNativeContent.removeAttribute(NATIVE_PANEL_CONTENT_ACTIVE_ATTRIBUTE);
            }
            activeNativeContent = nextContent;
            if (!nextContent) {
                for (const panel of querySelectorAllSafe(doc, `[${NATIVE_PANEL_SIBLING_SUPPRESSED_ATTRIBUTE}]`)) {
                    panel.removeAttribute(NATIVE_PANEL_SIBLING_SUPPRESSED_ATTRIBUTE);
                }
                return;
            }

            const extensionContentActive = Boolean(state().nativeExtensionTab);
            nextContent.toggleAttribute(NATIVE_PANEL_CONTENT_ACTIVE_ATTRIBUTE, extensionContentActive);
            if (!extensionContentActive) {
                for (const panel of querySelectorAllSafe(doc, `[${NATIVE_PANEL_SIBLING_SUPPRESSED_ATTRIBUTE}]`)) {
                    panel.removeAttribute(NATIVE_PANEL_SIBLING_SUPPRESSED_ATTRIBUTE);
                }
                return;
            }

            // YouTube renders Transcript, Timeline, and native Chapters in
            // sibling engagement panels. Suppress any currently expanded
            // sibling with our own CSS marker while extension content is
            // active, without rewriting YouTube's visibility/hidden state.
            for (const panel of doc.querySelectorAll("ytd-engagement-panel-section-list-renderer")) {
                if (panel === mount.panel || panel.parentElement !== mount.panel.parentElement) {
                    continue;
                }

                const visibility = panel.getAttribute("visibility") || "";
                if (!panel.hidden && visibility !== NATIVE_PANEL_VISIBILITY_HIDDEN) {
                    panel.setAttribute(NATIVE_PANEL_SIBLING_SUPPRESSED_ATTRIBUTE, "");
                }
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
                restoreHiddenNativeOwnedTab(element);
            }
        }

        function restoreHiddenNativeOwnedTab(element) {
            if (!element?.hasAttribute?.(NATIVE_PANEL_NATIVE_TAB_HIDDEN_ATTRIBUTE)) {
                return;
            }

            const previousDisplay = element.getAttribute(NATIVE_PANEL_NATIVE_TAB_PREVIOUS_DISPLAY_ATTRIBUTE) || "";
            if (previousDisplay) {
                element.style.display = previousDisplay;
            } else {
                element.style.removeProperty("display");
            }

            element.removeAttribute(NATIVE_PANEL_NATIVE_TAB_HIDDEN_ATTRIBUTE);
            element.removeAttribute(NATIVE_PANEL_NATIVE_TAB_PREVIOUS_DISPLAY_ATTRIBUTE);
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
                && (
                    state().timestampsSource === "youtubeChapters"
                    || state().nativeChaptersOverridden
                    || deps.isTimestampChapterDiscoveryPending?.()
                )
                && extensionTabKinds().includes("timestamps");
        }

        function syncNativeOwnedTabVisibility(mount = getMount()) {
            if (!mount?.tabList) {
                restoreHiddenNativeOwnedTabs();
                return;
            }

            for (const button of querySelectorAllSafe(mount.tabList, "button[role='tab'], button, [role='tab']")) {
                if (button.hasAttribute(NATIVE_PANEL_TAB_ATTRIBUTE)) {
                    continue;
                }

                const kind = nativeOwnedTabKindFromText(deps.visibleText(button));
                const container = nativeOwnedTabContainer(button);
                if (shouldHideNativeOwnedTab(kind)) {
                    hideNativeOwnedTabElement(container);
                } else {
                    restoreHiddenNativeOwnedTab(container);
                }
            }
        }

        function syncNativeOwnedTabSelectionAppearance(mount = getMount()) {
            if (!mount?.tabList) {
                return;
            }

            const extensionTabActive = Boolean(state().nativeExtensionTab);
            const selectedNativeTab = extensionTabActive ? "" : state().nativeYouTubeTab;
            for (const button of querySelectorAllSafe(mount.tabList, "button[role='tab'], button, [role='tab']")) {
                if (button.hasAttribute(NATIVE_PANEL_TAB_ATTRIBUTE)) {
                    continue;
                }

                const container = nativeOwnedTabContainer(button);
                if (!container) {
                    continue;
                }

                container.toggleAttribute(NATIVE_PANEL_NATIVE_TAB_VISUALLY_INACTIVE_ATTRIBUTE, extensionTabActive);
                if (!extensionTabActive) {
                    if (selectedNativeTab) {
                        const selected = nativeOwnedTabKindFromText(deps.visibleText(button)) === selectedNativeTab;
                        setAttributeIfChanged(button, "aria-selected", selected ? "true" : "false");
                        if (button.hasAttribute("aria-pressed")) {
                            setAttributeIfChanged(button, "aria-pressed", selected ? "true" : "false");
                        }
                        if (container !== button && container.hasAttribute?.("aria-selected")) {
                            setAttributeIfChanged(container, "aria-selected", selected ? "true" : "false");
                        }
                        if (container !== button && container.hasAttribute?.("aria-pressed")) {
                            setAttributeIfChanged(container, "aria-pressed", selected ? "true" : "false");
                        }
                    }
                    continue;
                }

                // YouTube leaves Transcript/Timeline selected when an injected
                // extension tab takes over the shared content surface. Reflect
                // the actual visible surface without changing native click flow.
                if (button.getAttribute("aria-selected") === "true") {
                    button.setAttribute("aria-selected", "false");
                }
                if (button.getAttribute("aria-pressed") === "true") {
                    button.setAttribute("aria-pressed", "false");
                }
                if (container !== button && container.getAttribute?.("aria-selected") === "true") {
                    container.setAttribute("aria-selected", "false");
                }
                if (container !== button && container.getAttribute?.("aria-pressed") === "true") {
                    container.setAttribute("aria-pressed", "false");
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

        function isPanelCloseTarget(rawTarget, panel) {
            if (!rawTarget || !panel) {
                return false;
            }

            const closeControl = panelCloseControl(panelHeader(panel));
            return Boolean(
                closeControl
                && (
                    closeControl === rawTarget
                    || closeControl.contains?.(rawTarget)
                    || rawTarget.contains?.(closeControl)
                )
            );
        }

        function nativePanelKind(panel) {
            const identity = `${panel?.getAttribute?.("target-id") || ""} ${nativePanelTitle(panel)}`
                .replace(/[_-]+/g, " ");
            return nativeOwnedTabKindFromText(identity);
        }

        function hideIntegratedPanel(mount) {
            const panel = mount?.panel;
            if (!panel) {
                return;
            }

            panel.hidden = true;
            panel.setAttribute("hidden", "");
            panel.setAttribute("visibility", NATIVE_PANEL_VISIBILITY_HIDDEN);
            panel.style.removeProperty("display");
            panel.style.removeProperty("visibility");
        }

        function dismissIntegratedPanel(mount) {
            const currentState = state();
            panelCloseLifecycle.begin();
            currentState.nativePanelDismissed = true;
            currentState.userSelectedTab = true;
            clearTranscriptCopyRefresh();
            clearTabSwitch();
            clearResync();
            clearDismissTimeout();

            // YouTube receives the original Close click. Finalize after its
            // handler because extension-owned Chapters/Summary can make the
            // shell visible without changing YouTube's private open state.
            nativePanelDismissTimeout = win.setTimeout(() => {
                nativePanelDismissTimeout = null;
                if (!state().nativePanelDismissed) {
                    return;
                }

                hideIntegratedPanel(mount);
                panelCloseLifecycle.reconcile({ dismissed: true, visible: false });
                syncContentVisibility(null);
                cleanupHeaderActions();
            }, 0);
        }

        function handlePagePanelCloseClick(event) {
            const rawTarget = event.target || null;
            const clickedPanel = rawTarget?.closest?.("ytd-engagement-panel-section-list-renderer");
            if (!clickedPanel || !isPanelCloseTarget(rawTarget, clickedPanel)) {
                return false;
            }

            const mount = getMount();
            if (!mount) {
                return false;
            }

            const clickedKind = nativePanelKind(clickedPanel);
            if (
                clickedPanel !== mount.panel
                && clickedKind !== "transcript"
                && clickedKind !== "timeline"
            ) {
                return false;
            }

            // Observe only. YouTube remains responsible for its own native
            // Transcript/Timeline surface; we close the shell we made visible.
            dismissIntegratedPanel(mount);
            return true;
        }

        function handlePageTranscriptOpenClick(event) {
            const descriptionTranscriptSection = event.target?.closest?.(
                "ytd-video-description-transcript-section-renderer"
            );
            const trigger = event.target?.closest?.("button, [role='button']");
            if (
                !descriptionTranscriptSection
                || !trigger
                || nativeOwnedTabKindFromText(deps.visibleText(trigger)) !== "transcript"
            ) {
                return false;
            }

            const mount = getMount();
            const transcriptButton = nativeOwnedTabButton("transcript", mount);
            if (!mount || !transcriptButton || !showNativePanel(mount)) {
                return false;
            }

            // YouTube's description command opens a separate modern Transcript
            // engagement panel. Route it through the existing Transcript chip
            // instead so the integrated In this video tab row remains the one
            // visible owner and cannot stack above a second panel.
            event.preventDefault?.();
            event.stopPropagation?.();
            event.stopImmediatePropagation?.();

            const currentState = state();
            clearDismissTimeout();
            panelCloseLifecycle.reset();
            currentState.nativePanelDismissed = false;
            currentState.userSelectedTab = true;
            syncContentVisibility(mount);

            // Keep the current extension ownership in place during the click,
            // exactly as when the person selects the in-panel Transcript chip.
            // Its capture listener hands ownership to YouTube on the next turn,
            // after YouTube has completed the native surface transition.
            transcriptButton.click?.();
            return true;
        }

        function wireHeaderActionHost(host) {
            if (wiredHeaderActionHosts.has(host)) {
                return;
            }

            wiredHeaderActionHosts.add(host);
            host.addEventListener("click", (event) => {
                if (!event.target?.closest?.(`[${NATIVE_PANEL_HEADER_COPY_ATTRIBUTE}]`)) {
                    return;
                }

                event.preventDefault();
                stopHeaderCopyEvent(event);
                void deps.copyHeaderResult();
            }, true);
        }

        function headerActionHost(panel) {
            const header = panelHeader(panel);
            if (!header) {
                return null;
            }

            let host = header.querySelector(`[${NATIVE_PANEL_HEADER_ACTION_ATTRIBUTE}]`);
            if (host) {
                wireHeaderActionHost(host);
                return host;
            }

            host = doc.createElement("div");
            host.className = "yts-native-header-actions";
            host.setAttribute(NATIVE_PANEL_HEADER_ACTION_ATTRIBUTE, "");
            wireHeaderActionHost(host);

            const closeControl = panelCloseControl(header);
            if (closeControl?.parentElement) {
                closeControl.parentElement.insertBefore(host, closeControl);
                return host;
            }

            header.append(host);
            return host;
        }

        function wireHeaderCopyButton(button) {
            if (wiredHeaderCopyButtons.has(button)) {
                return;
            }

            wiredHeaderCopyButtons.add(button);
            button.addEventListener("click", (event) => {
                event.preventDefault();
                stopHeaderCopyEvent(event);
                void deps.copyHeaderResult();
            });
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
                host.append(button);
            }
            wireHeaderCopyButton(button);

            if (copyKind === "transcript" && !deps.cachedTranscriptCopyText()) {
                deps.prefetchTranscriptForCopy();
            }

            const label = deps.copyButtonLabel(copyKind);
            const canCopy = deps.hasCopyText(copyKind);
            const copied = Boolean(state().copyFeedback[copyKind]);
            const copiedValue = copied ? "true" : "false";
            const iconState = copied ? "copied" : "copy";
            if (button.dataset.copied !== copiedValue) {
                button.dataset.copied = copiedValue;
            }
            if (button.disabled !== !canCopy) {
                button.disabled = !canCopy;
            }
            setAttributeIfChanged(button, "aria-label", label);
            setAttributeIfChanged(button, "title", label);
            if (button.dataset.ytsCopyIconState !== iconState) {
                button.innerHTML = deps.copyIcon(copied);
                button.dataset.ytsCopyIconState = iconState;
            }

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
                    currentState.userSelectedTab = true;
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

        function attachNativeOwnedTabListener(tabList) {
            if (wiredNativeTabLists.has(tabList)) {
                return;
            }

            wiredNativeTabLists.add(tabList);
            tabList.dataset.ytsNativeTabListener = "true";
            tabList.addEventListener("click", (event) => {
                const target = event.target?.closest?.("[role='tab'], button");
                if (!target) {
                    return;
                }

                const extensionKind = target.getAttribute(NATIVE_PANEL_TAB_ATTRIBUTE);
                if (extensionKind) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation?.();
                    void handleExtensionTabSelection(extensionKind);
                    return;
                }

                scheduleNativeOwnedTabSelection(nativeOwnedTabKindFromText(deps.visibleText(target)));
            }, true);
        }

        function syncTabs(mount = getMount()) {
            if (!mount) {
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
                setTextContentIfChanged(button, tabLabel(kind));
                setAttributeIfChanged(button, "aria-label", tabAriaLabel(kind));
                setAttributeIfChanged(button, "aria-selected", selected ? "true" : "false");
                setAttributeIfChanged(button, "aria-busy", currentState.isLoading[kind] ? "true" : "false");
            }

            reorderTabs(mount);
            syncNativeOwnedTabVisibility(mount);
            syncNativeOwnedTabSelectionAppearance(mount);
            syncContentVisibility(mount);
            syncBodyViewport(mount);
            syncHeaderCopyButton(mount);
            return mount;
        }

        async function handleExtensionTabSelection(kind) {
            clearTabSwitch();
            const currentState = state();
            clearDismissTimeout();
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
            clearDismissTimeout,
            clearTranscriptCopyRefresh,
            extensionTabKinds,
            getMount,
            hasNativeChapterSurface,
            hasNativeOwnedTab,
            headerCopyKind,
            handlePagePanelCloseClick,
            handlePageTranscriptOpenClick,
            open,
            scheduleResync,
            scheduleTranscriptCopyRefresh,
            selectExtensionTab: handleExtensionTabSelection,
            selectDefaultExtensionTab,
            syncBodyViewport,
            syncContentVisibility,
            syncHeaderCopyButton,
            syncNativeOwnedTabSelectionAppearance,
            syncTabs,
        };
    }

    globalScope.YouTubeTimestampsNativePanel = {
        createPanelCloseLifecycle,
        createNativePanelController,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = globalScope.YouTubeTimestampsNativePanel;
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
