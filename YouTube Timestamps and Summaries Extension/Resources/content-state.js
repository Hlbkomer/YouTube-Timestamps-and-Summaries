(function (globalScope) {
    function reduceStatusState(previousState = {}, response) {
        if (!response || response.ok !== true) {
            return {
                applied: false,
                error: String(response?.error || "The extension could not refresh provider status."),
                value: previousState,
            };
        }

        const settings = {
            ...(previousState.settings || {}),
            ...(response.settings || {}),
        };
        const appleIntelligenceAvailable = Boolean(
            response.appleIntelligence?.isConfigured ?? response.isConfigured
        );
        const codexConnected = Boolean(response.codex?.connected);
        const timestampsAvailable = Boolean(response.timestampsAvailable ?? codexConnected);
        const selectedProviderConnected = Boolean(
            response.settings?.providerConnected ?? timestampsAvailable
        );
        const summaryAvailable = Boolean(response.summaryAvailable ?? (
            codexConnected
            || (settings.summaryEngine === "appleIntelligence" && appleIntelligenceAvailable)
        ));

        let providerError = "";
        if (!selectedProviderConnected) {
            providerError = settings.providerID === "xaiOAuth"
                ? String(response.grok?.error || "")
                : String(response.codex?.error || "");
        }

        return {
            applied: true,
            error: "",
            value: {
                generationMode: response.generationMode || previousState.generationMode || "selectedProvider",
                appleIntelligenceAvailable,
                codexConnected,
                timestampsAvailable,
                selectedProviderConnected,
                summaryAvailable,
                providerError,
                statusError: "",
                settings,
            },
        };
    }

    function createSerialRefreshCoordinator(runRefresh) {
        let activeRequest = null;
        let refreshQueued = false;

        function request() {
            if (activeRequest) {
                refreshQueued = true;
                return activeRequest;
            }

            activeRequest = (async () => {
                let result;
                do {
                    refreshQueued = false;
                    result = await runRefresh();
                } while (refreshQueued);
                return result;
            })().finally(() => {
                activeRequest = null;
            });

            return activeRequest;
        }

        return {
            request,
            isRefreshing: () => activeRequest !== null,
        };
    }

    function createNavigationTransitionCoordinator(graceMs, now = () => Date.now()) {
        const maximumHoldMs = Math.max(0, Number(graceMs) || 0);
        let active = false;
        let deadline = 0;

        function begin() {
            active = true;
            deadline = now() + maximumHoldMs;
        }

        function complete() {
            active = false;
            deadline = 0;
        }

        function shouldHoldUI() {
            if (!active) {
                return false;
            }
            if (now() >= deadline) {
                complete();
                return false;
            }
            return true;
        }

        return {
            begin,
            complete,
            shouldHoldUI,
        };
    }

    function createVideoRetention(limit, onEvict = () => {}) {
        const maximumEntries = Math.max(1, Number(limit) || 1);
        const recency = new Map();

        function prune(protectedKeys = []) {
            const protectedSet = protectedKeys instanceof Set
                ? protectedKeys
                : new Set(protectedKeys);

            while (recency.size > maximumEntries) {
                let evictableKey = "";
                for (const key of recency.keys()) {
                    if (!protectedSet.has(key)) {
                        evictableKey = key;
                        break;
                    }
                }
                if (!evictableKey) {
                    break;
                }

                recency.delete(evictableKey);
                onEvict(evictableKey);
            }
        }

        function touch(videoKey, protectedKeys = []) {
            const key = String(videoKey || "").trim();
            if (!key) {
                return;
            }

            recency.delete(key);
            recency.set(key, true);
            prune(protectedKeys);
        }

        function remove(videoKey) {
            const key = String(videoKey || "").trim();
            if (!key || !recency.delete(key)) {
                return false;
            }

            onEvict(key);
            return true;
        }

        return {
            keys: () => Array.from(recency.keys()),
            prune,
            remove,
            touch,
        };
    }

    const contentState = {
        createNavigationTransitionCoordinator,
        createSerialRefreshCoordinator,
        createVideoRetention,
        reduceStatusState,
    };

    globalScope.YouTubeTimestampsContentState = contentState;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = contentState;
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
