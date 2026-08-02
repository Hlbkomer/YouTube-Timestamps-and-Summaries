(function (globalScope) {
    const TRANSCRIPT_OPEN_CONTROL_PATTERN = /\b(?:transcript|transcription|transkript|transkrip|prepis|přepis|transcripci[oó]n|trascrizione)\b/i;

    function isTranscriptOpenControlLabel(value) {
        return TRANSCRIPT_OPEN_CONTROL_PATTERN.test(String(value || ""));
    }

    function transcriptOpenControlLabel(control) {
        return [
            control?.innerText,
            control?.textContent,
            control?.getAttribute?.("aria-label"),
            control?.getAttribute?.("title"),
        ].filter(Boolean).join(" ");
    }

    function transcriptOpenControl(
        visibleControls = [],
        sectionControls = [],
        labelForControl = transcriptOpenControlLabel
    ) {
        return [...visibleControls, ...sectionControls].find((control) => (
            control
            && control.disabled !== true
            && control.getAttribute?.("aria-disabled") !== "true"
            && isTranscriptOpenControlLabel(labelForControl(control))
        )) || null;
    }

    function createTranscriptOrchestrator({
        completedCache,
        requestCache,
        resolveTranscript,
        onCacheHit = () => {},
        onSharedRequest = () => {},
        onPassiveFailure = () => {},
    }) {
        const availabilityByVideoKey = new Map();

        function status(videoKey) {
            if (completedCache.get(videoKey)?.text) {
                return "available";
            }
            if (requestCache.has(videoKey)) {
                return "pending";
            }
            return availabilityByVideoKey.get(videoKey) || "unknown";
        }

        function forget(videoKey) {
            availabilityByVideoKey.delete(videoKey);
        }

        function hasAvailableTranscript(videoKey) {
            return status(videoKey) === "available";
        }

        function notifySharedRequest(existingRequest, kind) {
            const consumerKind = String(kind || "");
            if (!consumerKind) {
                return;
            }

            if (!(existingRequest.notifiedSharedKinds instanceof Set)) {
                existingRequest.notifiedSharedKinds = new Set();
            }
            if (existingRequest.notifiedSharedKinds.has(consumerKind)) {
                return;
            }

            existingRequest.notifiedSharedKinds.add(consumerKind);
            onSharedRequest(consumerKind);
        }

        async function get(videoKey, kind, { allowNativePanelOpen = true } = {}) {
            if (completedCache.has(videoKey)) {
                const transcript = completedCache.get(videoKey);
                availabilityByVideoKey.set(videoKey, transcript?.text ? "available" : "unavailable");
                onCacheHit(kind, transcript);
                return transcript;
            }

            const existingRequest = requestCache.get(videoKey);
            if (existingRequest) {
                notifySharedRequest(existingRequest, kind);
                if (!allowNativePanelOpen || existingRequest.allowNativePanelOpen) {
                    return existingRequest.promise;
                }

                const sharedTranscript = await existingRequest.promise.catch((error) => {
                    onPassiveFailure(kind, error);
                    return null;
                });
                if (sharedTranscript?.text) {
                    return sharedTranscript;
                }
                if (completedCache.has(videoKey)) {
                    return completedCache.get(videoKey);
                }
            }

            availabilityByVideoKey.set(videoKey, "pending");
            let request;
            try {
                request = resolveTranscript(videoKey, kind, { allowNativePanelOpen });
            } catch (error) {
                availabilityByVideoKey.set(videoKey, "unavailable");
                throw error;
            }
            requestCache.set(videoKey, {
                promise: request,
                allowNativePanelOpen,
                notifiedSharedKinds: new Set(),
            });

            try {
                const transcript = await request;
                availabilityByVideoKey.set(videoKey, transcript?.text ? "available" : "unavailable");
                return transcript;
            } catch (error) {
                availabilityByVideoKey.set(videoKey, "unavailable");
                throw error;
            } finally {
                if (requestCache.get(videoKey)?.promise === request) {
                    requestCache.delete(videoKey);
                }
            }
        }

        return { forget, get, hasAvailableTranscript, status };
    }

    const transcriptOrchestrator = {
        createTranscriptOrchestrator,
        isTranscriptOpenControlLabel,
        transcriptOpenControl,
    };
    globalScope.YouTubeTimestampsTranscriptOrchestrator = transcriptOrchestrator;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = transcriptOrchestrator;
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
