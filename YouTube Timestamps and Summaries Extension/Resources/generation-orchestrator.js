(function (globalScope) {
    const DEFAULT_TIMEOUTS = {
        minimumMs: 6 * 60 * 1000,
        maximumMs: 20 * 60 * 1000,
        freeCharacters: 30000,
        characterBlock: 10000,
        extraMsPerBlock: 45 * 1000,
    };

    function generationTimeoutForTranscript(transcriptText, options = {}) {
        const settings = { ...DEFAULT_TIMEOUTS, ...options };
        const characterCount = typeof transcriptText === "string" ? transcriptText.length : 0;
        const extraCharacters = Math.max(0, characterCount - settings.freeCharacters);
        const extraBlocks = Math.ceil(extraCharacters / settings.characterBlock);
        const timeoutMs = settings.minimumMs + (extraBlocks * settings.extraMsPerBlock);
        return Math.min(settings.maximumMs, Math.max(settings.minimumMs, timeoutMs));
    }

    function generationKindForTab(kind, usesSelectedProvider) {
        if (!usesSelectedProvider) {
            return kind === "summary" ? "summaryFull" : "timestamps";
        }
        return kind === "summary" ? "selectedProviderSummary" : "selectedProviderTimestamps";
    }

    function stripTranscriptTimestamps(transcriptText) {
        return String(transcriptText || "")
            .split(/\r?\n/)
            .map((line) => line.replace(/^\s*\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/, "").trim())
            .filter(Boolean)
            .join("\n");
    }

    function transcriptForGeneration(kind, transcriptText) {
        return kind === "summary"
            ? stripTranscriptTimestamps(transcriptText)
            : transcriptText || "";
    }

    function automaticGenerationKinds({
        canGenerateTimestamps = false,
        canGenerateSummary = false,
        timestampsText = "",
        summaryText = "",
        timestampsBlocked = false,
        attempted = {},
    } = {}) {
        const kinds = [];
        if (
            canGenerateTimestamps
            && !timestampsText
            && !timestampsBlocked
            && !attempted.timestamps
        ) {
            kinds.push("timestamps");
        }
        if (canGenerateSummary && !summaryText && !attempted.summary) {
            kinds.push("summary");
        }
        return kinds;
    }

    function invalidateGenerationIDs(generationIDs = {}) {
        return {
            timestamps: Math.max(0, Number(generationIDs.timestamps) || 0) + 1,
            summary: Math.max(0, Number(generationIDs.summary) || 0) + 1,
        };
    }

    function generationRequestIsCurrent({
        currentVideoKey = "",
        requestVideoKey = "",
        currentGenerationID = 0,
        requestGenerationID = 0,
    } = {}) {
        return Boolean(currentVideoKey)
            && currentVideoKey === requestVideoKey
            && currentGenerationID === requestGenerationID;
    }

    function createRequestDeduplicator(activeKeys = new Set()) {
        async function run(key, task) {
            if (activeKeys.has(key)) {
                return { started: false, value: undefined };
            }
            activeKeys.add(key);
            try {
                return { started: true, value: await task() };
            } finally {
                activeKeys.delete(key);
            }
        }

        return {
            activeKeys,
            isActive: (key) => activeKeys.has(key),
            run,
        };
    }

    function createJobPoller({
        request,
        sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
        now = () => Date.now(),
        pollIntervalMs = 1000,
        waitNoticeIntervalMs = 5000,
    }) {
        async function poll({
            jobID,
            timeoutMs,
            isCurrent = () => true,
            onMessages = () => {},
            onWait = () => {},
            timeoutError = "Timed out waiting for generation.",
        }) {
            const startedAt = now();
            const deadline = startedAt + timeoutMs;
            let lastWaitNoticeAt = startedAt;

            while (now() < deadline) {
                let response;
                try {
                    response = await request(jobID);
                } catch (error) {
                    response = {
                        ok: false,
                        error: error?.message || "Polling the background job failed.",
                        debug: {
                            layer: "content",
                            step: "poll-failed",
                            detail: error?.stack || error?.message || String(error),
                        },
                    };
                }

                if (!isCurrent()) {
                    return { stale: true };
                }
                if (response?.debug?.messages) {
                    onMessages(response.debug.messages);
                }
                if (!response?.ok) {
                    return response;
                }
                if (response.status === "completed") {
                    return {
                        ok: true,
                        text: response.text,
                        engineLabel: response.engineLabel || response.debug?.engineLabel || "",
                        debug: response.debug,
                    };
                }
                if (response.status === "failed") {
                    return {
                        ok: false,
                        error: response.error,
                        debug: response.debug,
                    };
                }

                if (now() - lastWaitNoticeAt >= waitNoticeIntervalMs) {
                    lastWaitNoticeAt = now();
                    onWait(Math.round((now() - startedAt) / 1000));
                }
                await sleep(pollIntervalMs);
            }

            return {
                ok: false,
                error: timeoutError,
                debug: {
                    layer: "content",
                    step: "poll-timeout",
                    detail: `jobId=${jobID}`,
                },
            };
        }

        return { poll };
    }

    const generationOrchestrator = {
        automaticGenerationKinds,
        createJobPoller,
        createRequestDeduplicator,
        generationRequestIsCurrent,
        generationKindForTab,
        generationTimeoutForTranscript,
        invalidateGenerationIDs,
        stripTranscriptTimestamps,
        transcriptForGeneration,
    };
    globalScope.YouTubeTimestampsGenerationOrchestrator = generationOrchestrator;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = generationOrchestrator;
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
