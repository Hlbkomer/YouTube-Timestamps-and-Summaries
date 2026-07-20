(() => {
const {
    canGenerateSummaryFromStatus,
    canGenerateTimestampsFromStatus,
    defaultGenerationTab,
    extractVideoKey,
    getNavigationResponse,
    getNavigationResponseVideoKey,
    getNavigationURL,
    isShortsURL,
    parseNativeYouTubeChapters,
    parseNativeYouTubeChaptersFromDOM,
    parseTimestamps: parseTimestampLines,
    renderSummaryHTML: renderFormattedSummaryHTML,
} = globalThis.YouTubeTimestampsHelpers;
const chapterState = globalThis.YouTubeTimestampsChapterState;
const contentState = globalThis.YouTubeTimestampsContentState;
const transcriptOrchestration = globalThis.YouTubeTimestampsTranscriptOrchestrator;
const generationOrchestration = globalThis.YouTubeTimestampsGenerationOrchestrator;
const {
    automaticGenerationKinds,
    generationRequestIsCurrent,
    generationKindForTab,
    generationTimeoutForTranscript,
    invalidateGenerationIDs,
    transcriptForGeneration,
} = generationOrchestration;

const SIDEBAR_HOST_ID = "youtube-timestamps-sidebar-root";
const SIDEBAR_HOST_IDS = [SIDEBAR_HOST_ID];
const COMPANION_APP_URL = "youtube-timestamps-summaries://open";

// Keep this script scoped to watch/live pages in manifest.json. Running the
// sidebar script on Shorts or other YouTube surfaces can disturb YouTube's own
// layout during SPA navigation.
const supportedPath = window.location.pathname === "/watch"
    || window.location.pathname.startsWith("/live/");

if (!supportedPath) {
    for (const hostID of SIDEBAR_HOST_IDS) {
        for (const host of document.querySelectorAll(`#${hostID}`)) {
            host.remove();
        }
    }
    return;
}

let panelHost = null;
let currentVideoKey = null;
let lastObservedURL = window.location.href;
let nativePanelObserver = null;
let nativePanelRefreshFrame = null;
let panelReconciliationInProgress = false;
let panelReconciliationQueued = false;
let nativePanelDiscoveryDeadline = 0;
let videoDiscoveryTimeouts = [];
let navigationReconcileTimeouts = [];
const DEBUG_LINE_LIMIT = 80;
const NATIVE_DISCOVERY_GRACE_MS = chapterState.NATIVE_CHAPTER_DISCOVERY_GRACE_MS;
const NATIVE_PANEL_DISCOVERY_GRACE_MS = 5 * 1000;
const MIN_GENERATION_TIMEOUT_MS = 6 * 60 * 1000;
const PENDING_GENERATION_START_GRACE_MS = 30000;
const VIDEO_SESSION_CACHE_LIMIT = 8;
const TRANSCRIPT_TRACK_WAIT_ATTEMPTS = 16;
const NAVIGATION_URL_CHECK_INTERVAL_MS = 500;
const NAVIGATION_TRANSITION_GRACE_MS = 3 * 1000;
const NAVIGATION_RECONCILE_DELAYS_MS = [100, 300, 700, 1500, 3000, 5000];
// Show successful generation time in the small result caption instead of the tab title.
const SHOW_GENERATION_TIMING_IN_RESULT_CAPTIONS = true;
const NATIVE_TRANSCRIPT_PANEL_SELECTORS = [
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
    'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]',
    'ytd-engagement-panel-section-list-renderer[target-id*="transcript" i]',
    'ytd-engagement-panel-section-list-renderer[target-id*="transkript" i]',
    'ytd-engagement-panel-section-list-renderer[visibility$="EXPANDED"]',
    "ytd-transcript-renderer",
    "ytd-transcript-search-panel-renderer",
    "ytd-transcript-segment-list-renderer",
    "#segments-container",
];
const NATIVE_TRANSCRIPT_OPEN_BUTTON_SELECTORS = [
    "ytd-video-description-transcript-section-renderer button",
    "ytd-video-description-transcript-section-renderer [role='button']",
    "ytd-video-description-transcript-section-renderer .yt-spec-button-shape-next",
    "ytd-video-description-transcript-section-renderer button-view-model",
    "ytd-video-description-transcript-section-renderer yt-button-view-model",
    "ytd-video-description-transcript-section-renderer a",
    "button[aria-label*='transcript' i]",
    "[role='button'][aria-label*='transcript' i]",
    "button[title*='transcript' i]",
];
const DESCRIPTION_EXPAND_BUTTON_SELECTORS = [
    "ytd-watch-metadata ytd-text-inline-expander tp-yt-paper-button#expand",
    "ytd-watch-metadata tp-yt-paper-button#expand",
    "ytd-watch-metadata #description tp-yt-paper-button#expand",
    "ytd-watch-metadata #description button[aria-label*='more' i]",
    "ytd-watch-metadata #description [role='button'][aria-label*='more' i]",
];
const transcriptCache = new Map();
const transcriptRequestCache = new Map();
const timedTextTrackCache = new Map();
const innertubePlayerTrackCache = new Map();
const nativeChapterCache = new Map();
const nativeChapterDetectionByVideoKey = new Map();
const generationRequestKeys = new Set();
const generationResultCache = new Map();
const chapterSourceOverrideByVideoKey = new Map();
let initialPlayerResponseCache = {
    videoKey: "",
    response: null,
};
let initialDataCache = {
    videoKey: "",
    response: null,
};
let navigationDataCache = {
    videoKey: "",
    response: null,
};
const navigationTransition = contentState.createNavigationTransitionCoordinator(
    NAVIGATION_TRANSITION_GRACE_MS
);
let ytcfgCache = null;
let state = {
    ready: false,
    generationMode: "selectedProvider",
    appleIntelligenceAvailable: false,
    codexConnected: false,
    selectedProviderConnected: false,
    providerError: "",
    statusError: "",
    timestampsAvailable: false,
    summaryAvailable: false,
    settings: {
        providerID: "openaiCodex",
        modelID: "gpt-5.6-terra",
        summaryEngine: "selectedModel",
        chapterPreference: "preferNative",
    },
    activeTab: "timestamps",
    nativeExtensionTab: "",
    nativeYouTubeTab: "",
    nativePanelDismissed: false,
    userSelectedTab: false,
    nativeChaptersOverridden: false,
    timestampsText: "",
    timestampsSource: "",
    summaryText: "",
    errors: {
        timestamps: "",
        summary: "",
    },
    debug: {
        timestamps: "",
        summary: "",
    },
    isLoading: {
        timestamps: false,
        summary: false,
    },
    generationIDs: {
        timestamps: 0,
        summary: 0,
    },
    generationDurationsMs: {
        timestamps: 0,
        summary: 0,
    },
    generationEngineLabels: {
        timestamps: "",
        summary: "",
    },
    copyFeedback: {
        timestamps: false,
        summary: false,
        transcript: false,
    },
    copyErrors: {
        timestamps: "",
        summary: "",
        transcript: "",
    },
    autogenerationAttempted: {
        timestamps: false,
        summary: false,
    },
};
const videoRetention = contentState.createVideoRetention(
    VIDEO_SESSION_CACHE_LIMIT,
    evictVideoSession
);
const transcriptOrchestrator = transcriptOrchestration.createTranscriptOrchestrator({
    completedCache: transcriptCache,
    requestCache: transcriptRequestCache,
    resolveTranscript,
    onCacheHit: (kind, transcript) => {
        logTranscriptDebug(kind, `transcript: using cached captions (${transcript.lineCount} lines)`);
        if (transcript.languageCode || transcript.languageLabel) {
            logTranscriptDebug(kind, `transcript: language ${transcript.languageLabel || transcript.languageCode}${transcript.languageCode ? ` (${transcript.languageCode})` : ""}`);
        }
    },
    onSharedRequest: (kind) => logTranscriptDebug(kind, "transcript: waiting for shared transcript fetch"),
    onPassiveFailure: (kind, error) => {
        logTranscriptDebug(kind, `transcript: shared passive fetch failed (${error?.message || String(error)})`);
    },
});
const generationRequestDeduplicator = generationOrchestration.createRequestDeduplicator(generationRequestKeys);
const generationJobPoller = generationOrchestration.createJobPoller({
    request: (jobID) => sendMessageWithTimeout({
        type: "ai:getGenerateJob",
        jobId: jobID,
    }, 20000),
});

let copyFeedbackTimeout = null;
let activeChapterVideoElement = null;
let activeChapterSyncFrame = null;
let chapterSourceFooterRefreshFrame = null;
const wiredPanelRoots = new WeakSet();

const nativePanel = globalThis.YouTubeTimestampsNativePanel.createNativePanelController({
    document,
    window,
    sidebarHostID: SIDEBAR_HOST_ID,
    getState: () => state,
    getPanelHost: () => panelHost,
    querySelectorAllSafe,
    normalizeText: normalizeTranscriptText,
    visibleText,
    buttonLabel,
    copyButtonLabel,
    copyIcon,
    hasCopyText,
    cachedTranscriptCopyText,
    transcriptCopyText,
    prefetchTranscriptForCopy,
    copyHeaderResult,
    isTimestampChapterDiscoveryPending,
    render,
    maybeGenerateTimestamps,
    maybeGenerateSummary,
});

const handlePanelControlClick = globalThis.YouTubeTimestampsPageControls.createPageControlHandler({
    selectNativeTab: (kind) => { void nativePanel.selectExtensionTab(kind); },
    copyNativeResult: () => { void copyHeaderResult(); },
    selectSidebarTab: (kind) => { void handleTabSelection(kind); },
    copySidebarResult: () => { void copyActiveResult(); },
    switchChapterSource: (source) => { void switchVideoChapterSource(source); },
    openApp: () => { void openCompanionApp(); },
    jumpToTime: (seconds) => jumpToTime(seconds),
});

// YouTube frequently replaces the native panel's header and chip row. Capture
// extension-owned controls at stable page boundaries so a replacement cannot
// create a window where Summary, Chapters, or Copy has no listener. The first
// listener finalizes Close for the shell the extension made visible; the next
// redirects the description's separate Show transcript command through the
// integrated native Transcript chip. Window runs before YouTube's document-level
// delegation; document and Shadow Root remain fallbacks for browser-specific
// event retargeting.
window.addEventListener("click", nativePanel.handlePagePanelCloseClick, true);
window.addEventListener("click", nativePanel.handlePageTranscriptOpenClick, true);
window.addEventListener("click", handlePanelControlClick, true);
document.addEventListener("click", handlePanelControlClick, true);

function logDebug(kind, message, extra) {
    const prefix = `[Apple Intelligence content:${kind}]`;
    if (typeof extra === "undefined") {
        console.debug(prefix, message);
    } else {
        console.debug(prefix, message, extra);
    }

    const lines = [
        state.debug[kind],
        message,
    ]
        .filter(Boolean)
        .join("\n")
        .split("\n")
        .slice(-DEBUG_LINE_LIMIT);

    state.debug[kind] = lines.join("\n");
}

function logTranscriptDebug(kind, message, extra) {
    if (kind !== "timestamps" && kind !== "summary") {
        return;
    }

    logDebug(kind, message, extra);
}

function mergeDebugLines(kind, messageBlock) {
    const existingLines = state.debug[kind]
        ? state.debug[kind].split("\n").filter(Boolean)
        : [];
    const incomingLines = String(messageBlock ?? "")
        .split("\n")
        .map((line) => line.trimEnd())
        .filter(Boolean);

    let changed = false;
    for (const line of incomingLines) {
        if (!existingLines.includes(line)) {
            existingLines.push(line);
            changed = true;
        }
    }

    if (changed) {
        state.debug[kind] = existingLines.slice(-DEBUG_LINE_LIMIT).join("\n");
    }

    return changed;
}

function debugSummary(kind) {
    const lines = [];
    lines.push(`engine: ${kind === "summary" ? summaryEngineLabel() : modelLabel()}`);

    if (state.debug[kind]) {
        lines.push(state.debug[kind]);
    }

    return lines.join("\n");
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function modelLabel() {
    return state.settings.modelLabel || state.settings.modelID || "selected model";
}

function providerLabel() {
    return state.settings.providerLabel || "selected provider";
}

function summaryEngineLabel() {
    return state.settings.summaryModelLabel
        || state.settings.summaryEngineLabel
        || (state.settings.summaryEngine === "selectedModel" ? modelLabel() : "Apple Intelligence");
}

function currentResultEngineLabel(kind) {
    if (isTimestampTab(kind)) {
        return modelLabel();
    }

    return state.settings.summaryEngine === "appleIntelligence"
        ? "Apple Intelligence"
        : summaryEngineLabel();
}

function currentGenerationStatus() {
    return {
        appleIntelligenceAvailable: state.appleIntelligenceAvailable,
        codexConnected: state.codexConnected,
        selectedProviderConnected: state.selectedProviderConnected,
        timestampsAvailable: state.timestampsAvailable,
        summaryAvailable: state.summaryAvailable,
        summaryEngine: state.settings.summaryEngine,
    };
}

function canGenerateTimestamps() {
    return canGenerateTimestampsFromStatus(currentGenerationStatus());
}

function canGenerateSummary() {
    return canGenerateSummaryFromStatus(currentGenerationStatus());
}

function canStartGeneration(kind) {
    if (kind === "timestamps") {
        return canGenerateTimestamps();
    }
    if (kind === "summary") {
        return canGenerateSummary();
    }
    return false;
}

function defaultActiveTab() {
    if (state.timestampsSource === "youtubeChapters") {
        return "timestamps";
    }

    return defaultGenerationTab(currentGenerationStatus());
}

function generationResultCacheKey(videoKey, kind) {
    const providerID = state.settings.providerID || "provider";
    const modelID = kind === "summary"
        ? state.settings.summaryModelID || state.settings.modelID || "model"
        : state.settings.modelID || "model";
    const summaryEngine = kind === "summary"
        ? state.settings.summaryEngine || "selectedModel"
        : "timestamps";

    return [
        "youtube-timestamps-generation",
        videoKey || "",
        kind,
        providerID,
        modelID,
        summaryEngine,
    ].join(":");
}

function videoGenerationCachePrefix(videoKey) {
    return `youtube-timestamps-generation:${videoKey || ""}:`;
}

function protectedVideoSessionKeys() {
    const protectedKeys = new Set();
    if (currentVideoKey) {
        protectedKeys.add(currentVideoKey);
    }
    for (const videoKey of transcriptRequestCache.keys()) {
        protectedKeys.add(videoKey);
    }
    for (const requestKey of generationRequestKeys) {
        const separatorIndex = requestKey.lastIndexOf(":");
        const videoKey = separatorIndex >= 0 ? requestKey.slice(0, separatorIndex) : requestKey;
        if (videoKey) {
            protectedKeys.add(videoKey);
        }
    }
    return protectedKeys;
}

function evictVideoSession(videoKey) {
    transcriptCache.delete(videoKey);
    transcriptOrchestrator.forget(videoKey);
    timedTextTrackCache.delete(videoKey);
    innertubePlayerTrackCache.delete(videoKey);
    nativeChapterCache.delete(videoKey);
    nativeChapterDetectionByVideoKey.delete(videoKey);
    chapterSourceOverrideByVideoKey.delete(videoKey);

    const generationPrefix = videoGenerationCachePrefix(videoKey);
    for (const key of Array.from(generationResultCache.keys())) {
        if (key.startsWith(generationPrefix)) {
            generationResultCache.delete(key);
        }
    }

    try {
        const storedKeys = [];
        for (let index = 0; index < (window.sessionStorage?.length || 0); index += 1) {
            const key = window.sessionStorage?.key(index) || "";
            if (key.startsWith(generationPrefix)) {
                storedKeys.push(key);
            }
        }
        for (const key of storedKeys) {
            window.sessionStorage?.removeItem(key);
        }
    } catch (_) {
        // The in-memory state has still been evicted.
    }
}

function touchVideoSession(videoKey) {
    videoRetention.touch(videoKey, protectedVideoSessionKeys());
}

function pendingGenerationCacheKey(videoKey, kind) {
    return `${generationResultCacheKey(videoKey, kind)}:pending`;
}

function normalizeCachedGenerationResult(value) {
    if (!value) {
        return null;
    }

    if (typeof value === "object") {
        const text = String(value.text || "").trim();
        if (!text) {
            return null;
        }

        return {
            text,
            engineLabel: String(value.engineLabel || "").trim(),
            durationMs: Math.max(0, Number(value.durationMs || 0)),
        };
    }

    const rawText = String(value || "").trim();
    if (!rawText) {
        return null;
    }

    try {
        const parsed = JSON.parse(rawText);
        const parsedResult = normalizeCachedGenerationResult(parsed);
        if (parsedResult) {
            return parsedResult;
        }
    } catch (_) {
        // Older session entries stored the generated text directly.
    }

    return {
        text: rawText,
        engineLabel: "",
        durationMs: 0,
    };
}

function cachedGenerationResult(videoKey, kind) {
    const key = generationResultCacheKey(videoKey, kind);
    const inMemory = normalizeCachedGenerationResult(generationResultCache.get(key));
    if (inMemory) {
        return inMemory;
    }

    try {
        const stored = window.sessionStorage?.getItem(key) || "";
        if (stored) {
            const storedResult = normalizeCachedGenerationResult(stored);
            if (storedResult) {
                generationResultCache.set(key, storedResult);
                return storedResult;
            }
        }
    } catch (_) {
        return null;
    }

    return null;
}

function rememberGeneratedText(videoKey, kind, text, metadata = {}) {
    const generatedText = String(text || "").trim();
    if (!videoKey || !generatedText) {
        return;
    }

    const key = generationResultCacheKey(videoKey, kind);
    const result = {
        text: generatedText,
        engineLabel: String(metadata.engineLabel || "").trim(),
        durationMs: Math.max(0, Number(metadata.durationMs || 0)),
    };
    generationResultCache.set(key, result);

    try {
        window.sessionStorage?.setItem(key, JSON.stringify({
            version: 1,
            ...result,
        }));
    } catch (_) {
        // Session storage can be unavailable in some Safari contexts. The
        // in-memory cache still protects this content-script instance.
    }
}

function readPendingGeneration(videoKey, kind) {
    try {
        const rawValue = window.sessionStorage?.getItem(pendingGenerationCacheKey(videoKey, kind)) || "";
        if (!rawValue) {
            return null;
        }

        const pending = JSON.parse(rawValue);
        const deadline = Number(pending?.deadline || 0);
        const createdAt = Number(pending?.createdAt || 0);
        const hasJobID = Boolean(pending?.jobId);
        const graceDeadline = hasJobID
            ? deadline
            : createdAt + PENDING_GENERATION_START_GRACE_MS;

        if (!graceDeadline || Date.now() > graceDeadline) {
            clearPendingGeneration(videoKey, kind);
            return null;
        }

        return {
            jobId: String(pending.jobId || ""),
            createdAt,
            deadline,
            timeoutMs: Number(pending.timeoutMs || MIN_GENERATION_TIMEOUT_MS),
        };
    } catch (_) {
        clearPendingGeneration(videoKey, kind);
        return null;
    }
}

function writePendingGeneration(videoKey, kind, pending) {
    try {
        window.sessionStorage?.setItem(
            pendingGenerationCacheKey(videoKey, kind),
            JSON.stringify(pending)
        );
    } catch (_) {
        // If sessionStorage is unavailable, the in-memory generationRequestKeys
        // guard still protects normal same-runtime duplicate starts.
    }
}

function rememberPendingGenerationStart(videoKey, kind, timeoutMs) {
    writePendingGeneration(videoKey, kind, {
        jobId: "",
        createdAt: Date.now(),
        deadline: Date.now() + timeoutMs,
        timeoutMs,
    });
}

function rememberPendingGenerationJob(videoKey, kind, jobId, timeoutMs) {
    writePendingGeneration(videoKey, kind, {
        jobId,
        createdAt: Date.now(),
        deadline: Date.now() + timeoutMs,
        timeoutMs,
    });
}

function clearPendingGeneration(videoKey, kind, jobId = "") {
    try {
        if (jobId) {
            const pending = readPendingGeneration(videoKey, kind);
            if (pending?.jobId && pending.jobId !== jobId) {
                return;
            }
        }

        window.sessionStorage?.removeItem(pendingGenerationCacheKey(videoKey, kind));
    } catch (_) {
        // Nothing to clear.
    }
}

function formatGenerationDuration(durationMs) {
    const seconds = Math.max(1, Math.round(Number(durationMs || 0) / 1000));
    return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

function rememberGenerationDuration(kind, startedAt) {
    if (!SHOW_GENERATION_TIMING_IN_RESULT_CAPTIONS || !startedAt) {
        return;
    }

    state.generationDurationsMs[kind] = Math.max(0, Date.now() - startedAt);
}

function rememberGenerationEngineLabel(kind, engineLabel) {
    const label = String(engineLabel || "").trim();
    state.generationEngineLabels[kind] = label || currentResultEngineLabel(kind);
}

function responseEngineLabel(kind, response) {
    return String(
        response?.engineLabel
        || response?.debug?.engineLabel
        || response?.debug?.native?.engineLabel
        || ""
    ).trim() || currentResultEngineLabel(kind);
}

function generationStepDescription(kind, usesSelectedProvider) {
    if (!usesSelectedProvider) {
        return kind === "summary"
            ? "step: asking Apple Intelligence to create summary"
            : "step: asking Apple Intelligence to create timestamps";
    }

    return kind === "summary"
        ? `step: asking ${summaryEngineLabel()} to create summary`
        : `step: asking ${modelLabel()} to create timestamps`;
}

function generationWaitDescription(kind, usesSelectedProvider) {
    if (!usesSelectedProvider) {
        return kind === "summary"
            ? "step: waiting for Apple Intelligence summary"
            : "step: waiting for Apple Intelligence timestamps";
    }

    return kind === "summary"
        ? `step: waiting for ${summaryEngineLabel()} summary`
        : `step: waiting for ${modelLabel()} timestamps`;
}

function isCurrentGeneration(videoKey, kind, generationID) {
    return generationRequestIsCurrent({
        currentVideoKey,
        requestVideoKey: videoKey,
        currentGenerationID: state.generationIDs[kind],
        requestGenerationID: generationID,
    });
}

async function sendMessageWithTimeout(message, timeoutMs = MIN_GENERATION_TIMEOUT_MS) {
    let timeoutID = null;

    try {
        return await Promise.race([
            browser.runtime.sendMessage(message),
            new Promise((_, reject) => {
                timeoutID = setTimeout(() => {
                    reject(new Error(`Timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutID !== null) {
            clearTimeout(timeoutID);
        }
    }
}

function isWatchPage() {
    return Boolean(getVideoKey()) && (
        window.location.pathname === "/watch"
        || window.location.pathname.startsWith("/live/")
    );
}

function getVideoKey() {
    const moviePlayer = document.querySelector("#movie_player");
    const playerResponse = typeof moviePlayer?.getPlayerResponse === "function"
        ? moviePlayer.getPlayerResponse()
        : null;

    return extractVideoKey({
        currentUrl: window.location.href,
        canonicalHref: document.querySelector('link[rel="canonical"]')?.href || "",
        ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute("content") || "",
        playerVideoId: playerResponse?.videoDetails?.videoId || "",
        pathname: window.location.pathname,
    });
}

function getPlayerResponse() {
    const moviePlayer = document.querySelector("#movie_player");
    try {
        return typeof moviePlayer?.getPlayerResponse === "function"
            ? moviePlayer.getPlayerResponse()
            : null;
    } catch (_) {
        return null;
    }
}

function parseBalancedJSONObject(source, openBraceIndex) {
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let index = openBraceIndex; index < source.length; index += 1) {
        const character = source[index];

        if (inString) {
            if (isEscaped) {
                isEscaped = false;
            } else if (character === "\\") {
                isEscaped = true;
            } else if (character === "\"") {
                inString = false;
            }
            continue;
        }

        if (character === "\"") {
            inString = true;
            continue;
        }

        if (character === "{") {
            depth += 1;
        } else if (character === "}") {
            depth -= 1;
            if (depth === 0) {
                return source.slice(openBraceIndex, index + 1);
            }
        }
    }

    return "";
}

function parseScriptAssignmentObject(assignmentName) {
    for (const script of document.scripts) {
        const source = script.textContent || "";
        const assignmentIndex = source.indexOf(assignmentName);
        if (assignmentIndex === -1) {
            continue;
        }

        const openBraceIndex = source.indexOf("{", assignmentIndex);
        if (openBraceIndex === -1) {
            continue;
        }

        const json = parseBalancedJSONObject(source, openBraceIndex);
        if (!json) {
            continue;
        }

        try {
            return JSON.parse(json);
        } catch (_) {
            continue;
        }
    }

    return null;
}

function getInitialPlayerResponse(videoKey) {
    if (initialPlayerResponseCache.videoKey === videoKey) {
        return initialPlayerResponseCache.response;
    }

    const response = parseScriptAssignmentObject("ytInitialPlayerResponse");
    const responseVideoKey = response?.videoDetails?.videoId || "";
    initialPlayerResponseCache = {
        videoKey,
        response: !responseVideoKey || responseVideoKey === videoKey ? response : null,
    };

    return initialPlayerResponseCache.response;
}

function getInitialData(videoKey) {
    if (initialDataCache.videoKey === videoKey) {
        return initialDataCache.response;
    }

    if (navigationDataCache.videoKey === videoKey && navigationDataCache.response) {
        initialDataCache = navigationDataCache;
        return initialDataCache.response;
    }

    const response = parseScriptAssignmentObject("ytInitialData");
    const initialPlayerResponse = parseScriptAssignmentObject("ytInitialPlayerResponse");
    const responseVideoKey = initialPlayerResponse?.videoDetails?.videoId || "";

    const usableResponse = responseVideoKey === videoKey ? response : null;
    if (usableResponse) {
        initialDataCache = {
            videoKey,
            response: usableResponse,
        };
    }

    return usableResponse;
}

function nativeChaptersText(chapters) {
    return chapters
        .map((chapter) => `${chapter.time} ${chapter.label}`)
        .join("\n");
}

function normalizedChapterPreference(value) {
    return value === "alwaysGenerate" ? "alwaysGenerate" : "preferNative";
}

function normalizedChapterSourceOverride(value) {
    return value === "generated" || value === "native" ? value : "";
}

function chapterSourceOverride(videoKey = currentVideoKey || getVideoKey() || "") {
    return normalizedChapterSourceOverride(videoKey ? chapterSourceOverrideByVideoKey.get(videoKey) : "");
}

function nativeChapterDetection(videoKey = currentVideoKey || getVideoKey() || "") {
    if (!videoKey) {
        return null;
    }

    let detection = nativeChapterDetectionByVideoKey.get(videoKey);
    if (!detection) {
        detection = {
            status: "pending",
            deadline: Date.now() + NATIVE_DISCOVERY_GRACE_MS,
        };
        nativeChapterDetectionByVideoKey.set(videoKey, detection);
    }

    return detection;
}

function setNativeChapterDetection(videoKey, status) {
    const detection = nativeChapterDetection(videoKey);
    if (!detection) {
        return;
    }

    const nextStatus = chapterState.mergeDetectionStatus(
        detection.status,
        status,
        status === "available"
    );
    if (detection.status === nextStatus) {
        return;
    }

    detection.status = nextStatus;
    scheduleChapterSourceFooterRefresh(videoKey);
}

function scheduleChapterSourceFooterRefresh(videoKey) {
    if (chapterSourceFooterRefreshFrame !== null) {
        return;
    }

    chapterSourceFooterRefreshFrame = requestAnimationFrame(() => {
        chapterSourceFooterRefreshFrame = null;
        if (videoKey === (currentVideoKey || getVideoKey() || "") && panelHost) {
            render();
        }
    });
}

function playerResponseForVideo(videoKey) {
    const response = getPlayerResponse();
    return response?.videoDetails?.videoId === videoKey ? response : null;
}

function liveNativeChapters(videoKey) {
    const playerResponse = playerResponseForVideo(videoKey);
    const chapterItems = querySelectorAllSafe(
        document,
        "ytd-engagement-panel-section-list-renderer ytd-macro-markers-list-item-renderer"
    ).filter((item) => {
        const endpointHref = item.querySelector?.("a#endpoint[href]")?.href || "";
        const itemVideoKey = extractVideoKey({ currentUrl: endpointHref });
        return itemVideoKey
            ? itemVideoKey === videoKey
            : Boolean(playerResponse);
    });

    return parseNativeYouTubeChaptersFromDOM({
        querySelectorAll: () => chapterItems,
    });
}

function nativeChapterSurfaceAvailable() {
    if (nativePanel.hasNativeChapterSurface()) {
        return true;
    }

    // The player renders one hover container per native scrubber segment.
    // Generated extension chapters never alter this player-owned structure.
    return querySelectorAllSafe(document, "#movie_player .ytp-chapter-hover-container").length > 1;
}

function nativeChaptersForVideo(videoKey = currentVideoKey || getVideoKey() || "") {
    if (!videoKey) {
        return [];
    }

    const cachedChapters = nativeChapterCache.get(videoKey);
    if (cachedChapters) {
        setNativeChapterDetection(videoKey, "available");
        return cachedChapters;
    }

    const detection = nativeChapterDetection(videoKey);
    if (detection?.status === "unavailable") {
        return [];
    }

    const initialData = getInitialData(videoKey);
    const chapters = parseNativeYouTubeChapters(initialData);
    if (chapters.length > 0) {
        nativeChapterCache.set(videoKey, chapters);
        setNativeChapterDetection(videoKey, "available");
        return chapters;
    }

    const domChapters = liveNativeChapters(videoKey);
    if (domChapters.length > 0) {
        nativeChapterCache.set(videoKey, domChapters);
        setNativeChapterDetection(videoKey, "available");
        return domChapters;
    }

    const playerChapters = parseNativeYouTubeChapters(playerResponseForVideo(videoKey));
    if (playerChapters.length > 0) {
        nativeChapterCache.set(videoKey, playerChapters);
        setNativeChapterDetection(videoKey, "available");
        return playerChapters;
    }

    // A current, fully parsed ytInitialData response is authoritative for
    // absence unless YouTube is visibly advertising a lazy Chapters/Key
    // moments surface. In that case, keep waiting for its list until the
    // deadline. Availability means we have displayable chapter rows, not only
    // a tab or segmented scrubber that our compact view cannot migrate.
    if (
        (initialData && !nativeChapterSurfaceAvailable())
        || Date.now() >= (detection?.deadline || 0)
    ) {
        setNativeChapterDetection(videoKey, "unavailable");
    }

    return [];
}

function nativeChapterDetectionStatus(videoKey = currentVideoKey || getVideoKey() || "") {
    if (!videoKey) {
        return "unknown";
    }

    if (videoKey === (currentVideoKey || getVideoKey() || "") && state.timestampsSource === "youtubeChapters") {
        setNativeChapterDetection(videoKey, "available");
    }

    nativeChaptersForVideo(videoKey);
    return nativeChapterDetection(videoKey)?.status || "pending";
}

function hasNativeYouTubeChapters(videoKey = currentVideoKey || getVideoKey() || "") {
    if (!videoKey) {
        return false;
    }

    if (videoKey === (currentVideoKey || getVideoKey() || "") && state.timestampsSource === "youtubeChapters") {
        return true;
    }

    return nativeChapterDetectionStatus(videoKey) === "available";
}

function shouldGenerateChaptersInsteadOfNative(videoKey = currentVideoKey || getVideoKey() || "") {
    const override = chapterSourceOverride(videoKey);
    if (override === "generated") {
        return true;
    }

    if (override === "native") {
        return false;
    }

    return normalizedChapterPreference(state.settings.chapterPreference) === "alwaysGenerate";
}

function shouldWaitForNativeChapterDetection(videoKey = currentVideoKey || getVideoKey() || "") {
    return !shouldGenerateChaptersInsteadOfNative(videoKey)
        && nativeChapterDetectionStatus(videoKey) === "pending";
}

function isTimestampChapterDiscoveryPending(videoKey = currentVideoKey || getVideoKey() || "") {
    return !state.timestampsText
        && !state.errors.timestamps
        && !state.isLoading.timestamps
        && shouldWaitForNativeChapterDetection(videoKey);
}

function syncGeneratedChapterOverrideState(videoKey = currentVideoKey || getVideoKey() || "") {
    state.nativeChaptersOverridden = shouldGenerateChaptersInsteadOfNative(videoKey);
}

function applyNativeChaptersIfAvailable(videoKey = currentVideoKey || getVideoKey() || "") {
    syncGeneratedChapterOverrideState(videoKey);
    if (state.nativeChaptersOverridden) {
        return false;
    }

    // A resolved result is stable for this video. YouTube can expose its
    // chapter payload late (for example after returning from fullscreen), but
    // it must not replace generated chapters or trigger a new render loop.
    if (
        !videoKey
        || state.timestampsSource === "youtubeChapters"
        || state.timestampsSource === "generated"
    ) {
        return false;
    }

    const chapters = nativeChaptersForVideo(videoKey);
    if (chapters.length === 0) {
        return false;
    }

    const wasGeneratingTimestamps = state.isLoading.timestamps;
    state.timestampsText = nativeChaptersText(chapters);
    state.timestampsSource = "youtubeChapters";
    state.errors.timestamps = "";
    state.debug.timestamps = "";
    state.isLoading.timestamps = false;
    state.generationDurationsMs.timestamps = 0;
    state.generationEngineLabels.timestamps = "YouTube";
    if (!state.userSelectedTab) {
        state.activeTab = "timestamps";
        const nativeMount = nativePanel.getMount();
        if (nativeMount) {
            nativePanel.selectDefaultExtensionTab(nativeMount);
        }
    }
    if (wasGeneratingTimestamps) {
        state.generationIDs.timestamps += 1;
    }
    clearPendingGeneration(videoKey, "timestamps");
    logDebug(
        "timestamps",
        `chapters: using ${chapters.length} YouTube chapter${chapters.length === 1 ? "" : "s"}`
    );

    return true;
}

function getYTCfg() {
    if (ytcfgCache) {
        return ytcfgCache;
    }

    ytcfgCache = parseScriptAssignmentObject("ytcfg.set") || {};
    return ytcfgCache;
}

function captionTracksFromPlayerResponse(playerResponse) {
    const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    return Array.isArray(tracks) ? tracks.filter((track) => track?.baseUrl) : [];
}

function uniqueCaptionTracks(tracks) {
    const seen = new Set();
    const result = [];

    for (const track of tracks) {
        const key = track?.baseUrl || `${track?.languageCode || ""}:${track?.kind || ""}:${trackLabel(track)}`;
        if (!key || seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(track);
    }

    return result;
}

function getPageCaptionTracks(videoKey) {
    return uniqueCaptionTracks([
        ...captionTracksFromPlayerResponse(getPlayerResponse()),
        ...captionTracksFromPlayerResponse(getInitialPlayerResponse(videoKey)),
    ]);
}

async function fetchInnertubePlayerTracks(videoKey) {
    if (innertubePlayerTrackCache.has(videoKey)) {
        return innertubePlayerTrackCache.get(videoKey);
    }

    const apiKey = getYTCfg().INNERTUBE_API_KEY;
    if (!apiKey) {
        throw new Error("YouTube player page configuration was not found on this page.");
    }

    // Mirrors youtube-transcript-api's working path: ask the player endpoint as
    // an Android client, then fetch captionTracks from that response.
    const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}&prettyPrint=false`, {
        method: "POST",
        credentials: "include",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify({
            context: {
                client: {
                    clientName: "ANDROID",
                    clientVersion: "20.10.38",
                },
            },
            videoId: videoKey,
        }),
    });

    if (!response.ok) {
        throw new Error(`YouTube player transcript lookup failed with ${response.status}.`);
    }

    const data = await response.json();
    const tracks = uniqueCaptionTracks(captionTracksFromPlayerResponse(data));
    innertubePlayerTrackCache.set(videoKey, tracks);
    return tracks;
}

async function fetchTimedTextTracks(videoKey) {
    if (timedTextTrackCache.has(videoKey)) {
        return timedTextTrackCache.get(videoKey);
    }

    const url = new URL("https://www.youtube.com/api/timedtext");
    url.searchParams.set("type", "list");
    url.searchParams.set("v", videoKey);

    const response = await fetch(url.toString(), { credentials: "include" });
    if (!response.ok) {
        throw new Error(`Timed-text track list failed with ${response.status}.`);
    }

    const xml = await response.text();
    const document = new DOMParser().parseFromString(xml, "text/xml");
    const tracks = Array.from(document.querySelectorAll("track"))
        .map((track) => {
            const languageCode = track.getAttribute("lang_code") || "";
            if (!languageCode) {
                return null;
            }

            const trackURL = new URL("https://www.youtube.com/api/timedtext");
            trackURL.searchParams.set("v", videoKey);
            trackURL.searchParams.set("lang", languageCode);
            trackURL.searchParams.set("fmt", "json3");

            const name = track.getAttribute("name") || "";
            if (name) {
                trackURL.searchParams.set("name", name);
            }

            const kind = track.getAttribute("kind") || "";
            if (kind) {
                trackURL.searchParams.set("kind", kind);
            }

            return {
                baseUrl: trackURL.toString(),
                languageCode,
                kind,
                name: {
                    simpleText: track.getAttribute("lang_translated")
                        || track.getAttribute("lang_original")
                        || languageCode,
                },
            };
        })
        .filter(Boolean);

    timedTextTrackCache.set(videoKey, tracks);
    return tracks;
}

async function getCaptionTracks(videoKey) {
    const pageTracks = getPageCaptionTracks(videoKey);
    if (pageTracks.length > 0) {
        return {
            source: "player",
            tracks: pageTracks,
        };
    }

    try {
        const timedTextTracks = await fetchTimedTextTracks(videoKey);
        return {
            source: "timed text",
            tracks: uniqueCaptionTracks(timedTextTracks),
        };
    } catch (error) {
        return {
            source: "timed text",
            tracks: [],
            error: error?.message || String(error),
        };
    }
}

function trackLabel(track) {
    return track?.name?.simpleText
        || track?.name?.runs?.map((run) => run.text).filter(Boolean).join("")
        || track?.languageCode
        || "caption track";
}

function trackLanguageLabel(track) {
    const languageCode = track?.languageCode || "";
    const label = trackLabel(track);
    if (!languageCode) {
        return label;
    }

    try {
        // Keep model-facing language names stable regardless of the user's Safari UI language.
        const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
        return languageNames.of(languageCode) || label || languageCode;
    } catch (_) {
        return label || languageCode;
    }
}

function rankCaptionTracks(tracks) {
    const preferredLanguage = (navigator.language || "").split("-")[0].toLowerCase();
    const usableTracks = tracks.filter((track) => track?.baseUrl);
    const manualTracks = usableTracks.filter((track) => track.kind !== "asr");
    const preferredOrder = [
        ...manualTracks.filter((track) => track.languageCode === preferredLanguage),
        ...usableTracks.filter((track) => track.languageCode === preferredLanguage),
        ...manualTracks.filter((track) => track.languageCode === "en"),
        ...usableTracks.filter((track) => track.languageCode === "en"),
        ...manualTracks,
        ...usableTracks,
    ];

    return uniqueCaptionTracks(preferredOrder);
}

function formatTranscriptTime(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    const twoDigits = (value) => String(value).padStart(2, "0");

    if (hours > 0) {
        return `${hours}:${twoDigits(minutes)}:${twoDigits(remainingSeconds)}`;
    }

    return `${twoDigits(minutes)}:${twoDigits(remainingSeconds)}`;
}

function normalizeTranscriptText(text) {
    return String(text ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function parseJSONTranscript(text) {
    const data = JSON.parse(text);
    const events = Array.isArray(data?.events) ? data.events : [];
    return events
        .map((event) => {
            const line = normalizeTranscriptText(
                Array.isArray(event.segs)
                    ? event.segs.map((segment) => segment?.utf8 || segment?.text || "").join("")
                    : "",
            );
            if (!line) {
                return null;
            }

            return {
                startSeconds: Number(event.tStartMs || 0) / 1000,
                text: line,
            };
        })
        .filter(Boolean);
}

function parseXMLTranscript(text) {
    const document = new DOMParser().parseFromString(text, "text/xml");
    const legacyEntries = Array.from(document.querySelectorAll("text"))
        .map((node) => {
            const line = normalizeTranscriptText(node.textContent || "");
            if (!line) {
                return null;
            }

            return {
                startSeconds: Number(node.getAttribute("start") || 0),
                text: line,
            };
        })
        .filter(Boolean);

    if (legacyEntries.length > 0) {
        return legacyEntries;
    }

    return Array.from(document.querySelectorAll("p"))
        .map((node) => {
            const segmentText = Array.from(node.querySelectorAll("s"))
                .map((segment) => segment.textContent || "")
                .join("");
            const line = normalizeTranscriptText(segmentText || node.textContent || "");
            if (!line) {
                return null;
            }

            const hasMilliseconds = node.hasAttribute("t");
            const rawStart = Number(node.getAttribute("t") || node.getAttribute("start") || 0);
            return {
                startSeconds: hasMilliseconds ? rawStart / 1000 : rawStart,
                text: line,
            };
        })
        .filter(Boolean);
}

function parseTranscriptBody(body) {
    let entries = [];

    try {
        entries = parseJSONTranscript(body);
    } catch (_) {
        entries = [];
    }

    if (entries.length > 0) {
        return entries;
    }

    return parseXMLTranscript(body);
}

function textFromRuns(value) {
    if (typeof value?.simpleText === "string") {
        return value.simpleText;
    }

    if (Array.isArray(value?.runs)) {
        return value.runs.map((run) => run?.text || "").join("");
    }

    return "";
}

function parseTranscriptTimeString(value) {
    const parts = String(value || "").split(":").map(Number);
    if (parts.length === 2 && parts.every((part) => !Number.isNaN(part))) {
        return parts[0] * 60 + parts[1];
    }

    if (parts.length === 3 && parts.every((part) => !Number.isNaN(part))) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    return 0;
}

function findTranscriptParams(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > 80) {
        return null;
    }

    if (typeof value.getTranscriptEndpoint?.params === "string") {
        return {
            params: value.getTranscriptEndpoint.params,
            source: "getTranscriptEndpoint",
        };
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const result = findTranscriptParams(item, depth + 1);
            if (result) {
                return result;
            }
        }
        return null;
    }

    for (const item of Object.values(value)) {
        const result = findTranscriptParams(item, depth + 1);
        if (result) {
            return result;
        }
    }

    return null;
}

function collectInnertubeTranscriptEntries(value, entries = [], depth = 0) {
    if (!value || typeof value !== "object" || depth > 100) {
        return entries;
    }

    const cue = value.transcriptCueRenderer;
    if (cue) {
        const line = normalizeTranscriptText(textFromRuns(cue.cue));
        if (line) {
            entries.push({
                startSeconds: Number(cue.startOffsetMs || 0) / 1000,
                text: line,
            });
        }
    }

    const segment = value.transcriptSegmentRenderer;
    if (segment) {
        const line = normalizeTranscriptText(textFromRuns(segment.snippet));
        if (line) {
            entries.push({
                startSeconds: Number(segment.startMs || 0) / 1000
                    || parseTranscriptTimeString(textFromRuns(segment.startTimeText)),
                text: line,
            });
        }
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectInnertubeTranscriptEntries(item, entries, depth + 1);
        }
        return entries;
    }

    for (const item of Object.values(value)) {
        collectInnertubeTranscriptEntries(item, entries, depth + 1);
    }

    return entries;
}

function innertubeContext() {
    const config = getYTCfg();
    if (config.INNERTUBE_CONTEXT) {
        const context = JSON.parse(JSON.stringify(config.INNERTUBE_CONTEXT));
        if (config.VISITOR_DATA && context.client && !context.client.visitorData) {
            context.client.visitorData = config.VISITOR_DATA;
        }
        return context;
    }

    return {
        client: {
            clientName: "WEB",
            clientVersion: config.INNERTUBE_CLIENT_VERSION || "2.20260424.00.00",
            visitorData: config.VISITOR_DATA || undefined,
        },
    };
}

function innertubeHeaders(context) {
    const config = getYTCfg();
    const client = context?.client || {};
    const clientName = String(config.INNERTUBE_CONTEXT_CLIENT_NAME || config.INNERTUBE_CLIENT_NAME || "1");
    const clientVersion = String(client.clientVersion || config.INNERTUBE_CLIENT_VERSION || "");

    return {
        "content-type": "application/json; charset=UTF-8",
        "x-goog-api-format-version": "2",
        "x-youtube-client-name": clientName,
        "x-youtube-client-version": clientVersion,
    };
}

async function innertubeTranscriptRequest(apiKey, body, headers) {
    const urls = [
        `https://www.youtube.com/youtubei/v1/get_transcript?key=${encodeURIComponent(apiKey)}&prettyPrint=false`,
        "https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false",
    ];

    let lastResponse = null;
    for (const url of urls) {
        const response = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers,
            body: JSON.stringify(body),
        });

        if (response.ok) {
            return response;
        }

        lastResponse = response;
    }

    return lastResponse;
}

async function describeInnertubeFailure(response) {
    const body = await response.text().catch(() => "");
    if (!body) {
        return `YouTube transcript request failed with ${response.status}.`;
    }

    try {
        const data = JSON.parse(body);
        const status = data?.error?.status || data?.error?.code || "unknown";
        const message = normalizeTranscriptText(data?.error?.message || "");
        return `YouTube transcript request failed with ${response.status} (${status}${message ? `: ${message}` : ""}).`;
    } catch (_) {
        return `YouTube transcript request failed with ${response.status} (${describeTranscriptBody(body, response.headers.get("content-type") || "")}).`;
    }
}

async function fetchInnertubeTranscript(videoKey) {
    const transcriptParams = findTranscriptParams(getInitialData(videoKey));
    if (!transcriptParams?.params) {
        throw new Error("YouTube transcript params were not found on this page.");
    }

    const apiKey = getYTCfg().INNERTUBE_API_KEY;
    if (!apiKey) {
        throw new Error("YouTube transcript page configuration was not found on this page.");
    }

    console.debug("[Apple Intelligence content:transcript]", `Using ${transcriptParams.source} transcript params (${transcriptParams.params.length} chars)`);

    const context = innertubeContext();
    const response = await innertubeTranscriptRequest(apiKey, {
        context,
        params: transcriptParams.params,
    }, innertubeHeaders(context));

    if (!response.ok) {
        throw new Error(await describeInnertubeFailure(response));
    }

    const data = await response.json();
    const entries = collectInnertubeTranscriptEntries(data)
        .sort((first, second) => first.startSeconds - second.startSeconds);
    const lines = entries
        .map((entry) => `[${formatTranscriptTime(entry.startSeconds)}] ${entry.text}`)
        .filter(Boolean);

    if (lines.length === 0) {
        throw new Error("YouTube transcript response returned no transcript lines.");
    }

    return {
        text: lines.join("\n"),
        lineCount: lines.length,
        label: "YouTube transcript",
    };
}

function describeTranscriptBody(body, contentType = "") {
    const length = body.length;
    const type = contentType || "unknown content-type";

    try {
        const data = JSON.parse(body);
        const events = Array.isArray(data?.events) ? data.events.length : 0;
        const keys = Object.keys(data || {}).slice(0, 5).join(", ") || "none";
        return `${type}, ${length} chars, JSON keys: ${keys}, events: ${events}`;
    } catch (_) {
        const document = new DOMParser().parseFromString(body, "text/xml");
        const root = document.documentElement?.nodeName || "none";
        const textNodes = document.querySelectorAll("text").length;
        const paragraphNodes = document.querySelectorAll("p").length;
        const parserErrors = document.querySelectorAll("parsererror").length;
        return `${type}, ${length} chars, XML root: ${root}, text nodes: ${textNodes}, p nodes: ${paragraphNodes}, parser errors: ${parserErrors}`;
    }
}

function transcriptURLCandidates(baseUrl) {
    const candidates = [];
    const seen = new Set();

    function add(url) {
        const value = url.toString();
        if (!seen.has(value)) {
            seen.add(value);
            candidates.push(value);
        }
    }

    const jsonURL = new URL(baseUrl);
    jsonURL.searchParams.set("fmt", "json3");
    add(jsonURL);

    const originalURL = new URL(baseUrl);
    add(originalURL);

    for (const format of ["srv3", "srv1"]) {
        const url = new URL(baseUrl);
        url.searchParams.set("fmt", format);
        add(url);
    }

    return candidates;
}

async function fetchTranscript(track) {
    let lastError = "";

    for (const url of transcriptURLCandidates(track.baseUrl)) {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) {
            const body = await response.text().catch(() => "");
            lastError = body
                ? `Transcript request failed with ${response.status} (${describeTranscriptBody(body, response.headers.get("content-type") || "")}).`
                : `Transcript request failed with ${response.status}.`;
            continue;
        }

        const body = await response.text();
        const bodyDescription = describeTranscriptBody(body, response.headers.get("content-type") || "");
        const entries = parseTranscriptBody(body);
        const lines = entries
            .map((entry) => `[${formatTranscriptTime(entry.startSeconds)}] ${entry.text}`)
            .filter(Boolean);

        if (lines.length > 0) {
            return {
                text: lines.join("\n"),
                lineCount: lines.length,
                label: trackLabel(track),
                languageCode: track?.languageCode || "",
                languageLabel: trackLanguageLabel(track),
                trackKind: track?.kind || "",
            };
        }

        lastError = `Caption track returned no transcript lines (${bodyDescription}).`;
    }

    throw new Error(lastError || "Caption track returned no transcript lines.");
}

function uniqueElements(elements) {
    return Array.from(new Set(elements.filter(Boolean)));
}

function querySelectorAllSafe(root, selector) {
    try {
        return Array.from(root.querySelectorAll(selector));
    } catch (_) {
        return [];
    }
}

function isVisibleElement(element) {
    if (!element?.isConnected) {
        return false;
    }

    const style = window.getComputedStyle?.(element);
    if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) {
        return false;
    }

    const rect = element.getBoundingClientRect?.();
    return !rect || (rect.width > 0 && rect.height > 0);
}

function visibleText(element) {
    return normalizeTranscriptText(`${element?.innerText || ""} ${element?.textContent || ""} ${element?.getAttribute?.("aria-label") || ""} ${element?.getAttribute?.("title") || ""}`);
}

function transcriptTimeMatch(value) {
    return String(value || "").match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
}

function transcriptEntry(timeText, text) {
    const match = transcriptTimeMatch(timeText);
    const line = normalizeTranscriptText(text);
    if (!match || !line) {
        return null;
    }

    return {
        startSeconds: parseTranscriptTimeString(match[0]),
        text: line,
    };
}

function transcriptFromEntries(entries, label) {
    const seen = new Set();
    const lines = entries
        .filter(Boolean)
        .sort((first, second) => first.startSeconds - second.startSeconds)
        .map((entry) => {
            const key = `${entry.startSeconds}:${entry.text}`;
            if (seen.has(key)) {
                return "";
            }
            seen.add(key);
            return `[${formatTranscriptTime(entry.startSeconds)}] ${entry.text}`;
        })
        .filter(Boolean);

    if (lines.length === 0) {
        return null;
    }

    return {
        text: lines.join("\n"),
        lineCount: lines.length,
        label,
        languageLabel: label,
    };
}

function parseNativeTranscriptSegmentNode(node) {
    const timestampNode = node.querySelector(".segment-timestamp, #segment-start-offset, yt-formatted-string.segment-timestamp");
    const textNode = node.querySelector(".segment-text, #segment-text, yt-formatted-string.segment-text");
    const timestampText = normalizeTranscriptText(timestampNode?.textContent || "");
    let transcriptText = normalizeTranscriptText(textNode?.textContent || "");

    if (!transcriptText) {
        const fullText = normalizeTranscriptText(node.textContent || "");
        const match = transcriptTimeMatch(fullText);
        if (match) {
            transcriptText = normalizeTranscriptText(fullText.replace(match[0], ""));
        }
    }

    return transcriptEntry(timestampText || node.textContent, transcriptText);
}

function parseNativeTranscriptAlignedSegments(root) {
    const textNodes = querySelectorAllSafe(root, ".segment-text, #segment-text, yt-formatted-string.segment-text");
    const timestampNodes = querySelectorAllSafe(root, ".segment-timestamp, #segment-start-offset, yt-formatted-string.segment-timestamp");

    return textNodes
        .map((textNode, index) => transcriptEntry(timestampNodes[index]?.textContent || "", textNode.textContent || ""))
        .filter(Boolean);
}

function parseNativeTranscriptAttributedStrings(root) {
    const nodes = querySelectorAllSafe(root, "span.yt-core-attributed-string, yt-formatted-string")
        .map((node) => normalizeTranscriptText(node.textContent || ""))
        .filter(Boolean);
    const entries = [];

    for (let index = 0; index < nodes.length; index += 1) {
        const current = nodes[index];
        const currentTime = transcriptTimeMatch(current);
        if (currentTime) {
            const inlineText = normalizeTranscriptText(current.replace(currentTime[0], ""));
            const nextText = normalizeTranscriptText(nodes[index + 1] || "");
            const text = inlineText || (!transcriptTimeMatch(nextText) ? nextText : "");
            const entry = transcriptEntry(currentTime[0], text);
            if (entry) {
                entries.push(entry);
                if (!inlineText && text === nextText) {
                    index += 1;
                }
            }
            continue;
        }

        const nextTime = transcriptTimeMatch(nodes[index + 1] || "");
        if (nextTime) {
            const entry = transcriptEntry(nextTime[0], current);
            if (entry) {
                entries.push(entry);
                index += 1;
            }
        }
    }

    return entries;
}

function parseNativeTranscriptTextBlock(root) {
    const lines = String(root.innerText || root.textContent || "")
        .split(/\r?\n/)
        .map(normalizeTranscriptText)
        .filter(Boolean);
    const entries = [];

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const inlineMatch = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/);
        if (inlineMatch) {
            entries.push(transcriptEntry(inlineMatch[1], inlineMatch[2]));
            continue;
        }

        if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(line)) {
            continue;
        }

        const nextLine = lines[index + 1] || "";
        if (nextLine && !transcriptTimeMatch(nextLine)) {
            entries.push(transcriptEntry(line, nextLine));
            index += 1;
        }
    }

    return entries.filter(Boolean);
}

function nativeTranscriptRoots() {
    const roots = [];
    for (const selector of NATIVE_TRANSCRIPT_PANEL_SELECTORS) {
        roots.push(...querySelectorAllSafe(document, selector));
    }

    for (const segment of querySelectorAllSafe(document, "ytd-transcript-segment-renderer, .segment-text, #segment-text, span.yt-core-attributed-string")) {
        let closestRoot = null;
        try {
            closestRoot = segment.closest(NATIVE_TRANSCRIPT_PANEL_SELECTORS.join(","));
        } catch (_) {
            closestRoot = null;
        }
        roots.push(closestRoot || segment.parentElement);
    }

    return uniqueElements(roots).filter((root) => (
        isVisibleElement(root)
        || querySelectorAllSafe(root, "ytd-transcript-segment-renderer, .segment-text, #segment-text, span.yt-core-attributed-string").length > 0
        || transcriptTimeMatch(root.textContent || "")
    ));
}

function nativeTranscriptDOMSummary() {
    const roots = nativeTranscriptRoots();
    const countInRoots = (selector) => roots
        .reduce((count, root) => count + querySelectorAllSafe(root, selector).length, 0);
    const timeMatches = roots
        .reduce((count, root) => count + ((root.textContent || "").match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g) || []).length, 0);

    return [
        `roots=${roots.length}`,
        `segments=${countInRoots("ytd-transcript-segment-renderer")}`,
        `textNodes=${countInRoots(".segment-text, #segment-text, span.yt-core-attributed-string, yt-formatted-string")}`,
        `timestampNodes=${countInRoots(".segment-timestamp, #segment-start-offset, yt-formatted-string.segment-timestamp")}`,
        `timeMatches=${timeMatches}`,
    ].join(", ");
}

function readNativeTranscriptPanel() {
    const entries = [];
    for (const root of nativeTranscriptRoots()) {
        entries.push(...querySelectorAllSafe(root, "ytd-transcript-segment-renderer")
            .map(parseNativeTranscriptSegmentNode));
        entries.push(...parseNativeTranscriptAlignedSegments(root));
        entries.push(...parseNativeTranscriptAttributedStrings(root));
        entries.push(...parseNativeTranscriptTextBlock(root));
    }

    return transcriptFromEntries(entries, "YouTube transcript panel");
}

function actionableTranscriptButton(element) {
    if (!element) {
        return null;
    }

    if (element.matches?.("button, a, [role='button']")) {
        return element;
    }

    return querySelectorAllSafe(element, "button, a, [role='button'], .yt-spec-button-shape-next, button-view-model, yt-button-view-model")
        .find(isVisibleElement)
        || element;
}

function nativeTranscriptOpenButtons() {
    const selectorCandidates = NATIVE_TRANSCRIPT_OPEN_BUTTON_SELECTORS
        .flatMap((selector) => querySelectorAllSafe(document, selector))
        .map(actionableTranscriptButton);
    const textCandidates = querySelectorAllSafe(document, "button, [role='button'], tp-yt-paper-button")
        .filter((element) => {
            const text = visibleText(element);
            return /(transcript|transkript|transkrip|prepis|přepis)/i.test(text);
        });

    return uniqueElements([...selectorCandidates, ...textCandidates]).filter(isVisibleElement);
}

function descriptionExpandButtons() {
    const selectorCandidates = DESCRIPTION_EXPAND_BUTTON_SELECTORS
        .flatMap((selector) => querySelectorAllSafe(document, selector));
    const textCandidates = querySelectorAllSafe(document, "ytd-watch-metadata button, ytd-watch-metadata [role='button'], ytd-watch-metadata tp-yt-paper-button")
        .filter((element) => {
            const text = visibleText(element);
            return /\b(show more|more|viac|zobraziť viac|zobrazit vice|mehr|más|plus)\b/i.test(text);
        });

    return uniqueElements([...selectorCandidates, ...textCandidates]).filter(isVisibleElement);
}

async function openNativeTranscriptPanel(kind) {
    let buttons = nativeTranscriptOpenButtons();
    const transcriptSection = document.querySelector("ytd-video-description-transcript-section-renderer");
    if (buttons.length === 0 && transcriptSection) {
        // Expanding a generic description just to look for a transcript has a
        // visible side effect on transcript-free videos: current YouTube builds
        // open the full Description engagement panel. Expand only when YouTube
        // has already supplied positive transcript-section evidence.
        const expanders = descriptionExpandButtons();
        if (expanders.length > 0) {
            logTranscriptDebug(kind, "transcript: expanding YouTube description");
            expanders[0].click();
            await sleep(500);
            buttons = nativeTranscriptOpenButtons();
        }
    }

    if (buttons.length === 0) {
        logTranscriptDebug(kind, "transcript: native transcript button not found");
        return false;
    }

    const button = actionableTranscriptButton(buttons[0]);
    const label = visibleText(button).slice(0, 80) || button?.tagName?.toLowerCase() || "button";
    logTranscriptDebug(kind, `transcript: opening YouTube transcript panel (${label})`);
    button?.click();
    return true;
}

async function readNativeTranscriptPanelWithWait(videoKey, kind, label) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const transcript = readNativeTranscriptPanel();
        if (transcript) {
            rememberTranscript(videoKey, transcript);
            logTranscriptDebug(kind, `transcript: ${label} (${transcript.lineCount} lines)`);
            return transcript;
        }
        await sleep(500);
    }

    return null;
}

async function tryNativeTranscriptPanel(videoKey, kind, { allowOpen = true } = {}) {
    const existingTranscript = readNativeTranscriptPanel();
    if (existingTranscript) {
        rememberTranscript(videoKey, existingTranscript);
        logTranscriptDebug(kind, `transcript: using visible YouTube transcript panel (${existingTranscript.lineCount} lines)`);
        return existingTranscript;
    }

    if (!allowOpen) {
        return null;
    }

    if (await openNativeTranscriptPanel(kind)) {
        const openedTranscript = await readNativeTranscriptPanelWithWait(videoKey, kind, "ready from YouTube transcript panel");
        if (openedTranscript) {
            return openedTranscript;
        }
        logTranscriptDebug(kind, `transcript: native transcript panel opened but no lines were readable (${nativeTranscriptDOMSummary()})`);
    }

    return null;
}

function rememberTranscript(videoKey, transcript) {
    if (!videoKey || !transcript?.text) {
        return;
    }

    transcriptCache.delete(videoKey);
    transcriptCache.set(videoKey, transcript);
    if (videoKey === (currentVideoKey || getVideoKey() || "")) {
        scheduleNativePanelRefresh();
    }
}

function applyGenerationText(kind, text, metadata = {}) {
    const generatedText = String(text || "").trim();
    if (!generatedText) {
        return false;
    }

    if (kind === "summary") {
        state.summaryText = generatedText;
        state.errors.summary = "";
        if (metadata.engineLabel) {
            rememberGenerationEngineLabel(kind, metadata.engineLabel);
        }
        if (metadata.durationMs > 0) {
            state.generationDurationsMs[kind] = Math.max(0, Number(metadata.durationMs || 0));
        }
        return true;
    }

    if (parseTimestamps(generatedText).length === 0) {
        return false;
    }

    state.timestampsText = generatedText;
    state.timestampsSource = "generated";
    state.errors.timestamps = "";
    if (metadata.engineLabel) {
        rememberGenerationEngineLabel(kind, metadata.engineLabel);
    }
    if (metadata.durationMs > 0) {
        state.generationDurationsMs[kind] = Math.max(0, Number(metadata.durationMs || 0));
    }
    return true;
}

function restoreCachedGenerationText(videoKey, kind) {
    const cachedResult = cachedGenerationResult(videoKey, kind);
    if (!cachedResult?.text || activeText(kind)) {
        return false;
    }

    return applyGenerationText(kind, cachedResult.text, cachedResult);
}

async function tryTranscriptTracks(videoKey, kind, source, tracks) {
    let lastError = "";
    for (const track of rankCaptionTracks(tracks)) {
        logTranscriptDebug(kind, `transcript: fetching ${source} captions (${trackLabel(track)})`);
        try {
            const transcript = await fetchTranscript(track);
            rememberTranscript(videoKey, transcript);
            logTranscriptDebug(kind, `transcript: ready (${transcript.lineCount} lines)`);
            if (transcript.languageCode || transcript.languageLabel) {
                logTranscriptDebug(kind, `transcript: language ${transcript.languageLabel || transcript.languageCode}${transcript.languageCode ? ` (${transcript.languageCode})` : ""}`);
            }
            return {
                transcript,
                error: "",
            };
        } catch (error) {
            lastError = error?.message || String(error);
            logTranscriptDebug(kind, `transcript: track failed (${trackLabel(track)}: ${lastError})`);
        }
    }

    return {
        transcript: null,
        error: lastError,
    };
}

async function resolveTranscript(videoKey, kind, { allowNativePanelOpen = true } = {}) {
    for (let attempt = 0; attempt < TRANSCRIPT_TRACK_WAIT_ATTEMPTS; attempt += 1) {
        const { source, tracks, error } = await getCaptionTracks(videoKey);
        if (tracks.length > 0) {
            let lastError = "";
            const pageResult = await tryTranscriptTracks(videoKey, kind, source, tracks);
            if (pageResult.transcript) {
                return pageResult.transcript;
            }
            lastError = pageResult.error;

            logTranscriptDebug(kind, "transcript: trying YouTube player captions");
            try {
                const playerTracks = await fetchInnertubePlayerTracks(videoKey);
                const playerResult = await tryTranscriptTracks(videoKey, kind, "YouTube player", playerTracks);
                if (playerResult.transcript) {
                    return playerResult.transcript;
                }
                lastError = playerResult.error || lastError;
            } catch (error) {
                lastError = error?.message || String(error);
                logTranscriptDebug(kind, `transcript: player fallback failed (${lastError})`);
            }

            logTranscriptDebug(kind, "transcript: trying YouTube transcript panel");
            try {
                const transcript = await fetchInnertubeTranscript(videoKey);
                rememberTranscript(videoKey, transcript);
                logTranscriptDebug(kind, `transcript: ready (${transcript.lineCount} lines)`);
                return transcript;
            } catch (error) {
                lastError = error?.message || String(error);
                logTranscriptDebug(kind, `transcript: panel fallback failed (${lastError})`);
            }

            const nativePanelTranscript = await tryNativeTranscriptPanel(videoKey, kind, { allowOpen: allowNativePanelOpen });
            if (nativePanelTranscript) {
                return nativePanelTranscript;
            }

            try {
                const timedTextTracks = await fetchTimedTextTracks(videoKey);
                const timedTextResult = await tryTranscriptTracks(videoKey, kind, "timed text", timedTextTracks);
                if (timedTextResult.transcript) {
                    return timedTextResult.transcript;
                }
                lastError = timedTextResult.error || lastError;
            } catch (error) {
                lastError = error?.message || String(error);
            }

            throw new Error(lastError || "Caption tracks returned no transcript lines.");
        }

        if (attempt === 0) {
            logTranscriptDebug(kind, "transcript: waiting for YouTube captions");
            if (error) {
                logTranscriptDebug(kind, `transcript: timed-text fallback unavailable (${error})`);
            }
        }
        await sleep(750);
    }

    logTranscriptDebug(kind, "transcript: trying YouTube player captions");
    try {
        const playerTracks = await fetchInnertubePlayerTracks(videoKey);
        const playerResult = await tryTranscriptTracks(videoKey, kind, "YouTube player", playerTracks);
        if (playerResult.transcript) {
            return playerResult.transcript;
        }
        if (playerResult.error) {
            logTranscriptDebug(kind, `transcript: player fallback failed (${playerResult.error})`);
        }
    } catch (error) {
        logTranscriptDebug(kind, `transcript: player fallback failed (${error?.message || String(error)})`);
    }

    logTranscriptDebug(kind, "transcript: trying YouTube transcript panel");
    try {
        const transcript = await fetchInnertubeTranscript(videoKey);
        rememberTranscript(videoKey, transcript);
        logTranscriptDebug(kind, `transcript: ready (${transcript.lineCount} lines)`);
        return transcript;
    } catch (error) {
        logTranscriptDebug(kind, `transcript: panel fallback failed (${error?.message || String(error)})`);
    }

    const nativePanelTranscript = await tryNativeTranscriptPanel(videoKey, kind, { allowOpen: allowNativePanelOpen });
    if (nativePanelTranscript) {
        return nativePanelTranscript;
    }

    logTranscriptDebug(kind, "transcript: unavailable");
    return null;
}

function needsTranscriptForTimestamps() {
    return state.timestampsSource !== "youtubeChapters"
        && canGenerateTimestamps()
        && !state.timestampsText;
}

function needsTranscriptForSummary() {
    return canGenerateSummary() && !state.summaryText;
}

function preferredTranscriptDebugKind() {
    if (needsTranscriptForSummary()) {
        return "summary";
    }

    if (needsTranscriptForTimestamps()) {
        return "timestamps";
    }

    return "";
}

function shouldPrefetchTranscriptForGeneration() {
    return needsTranscriptForSummary() || needsTranscriptForTimestamps();
}

function watchVideoKey() {
    return getVideoKey() || currentVideoKey || "";
}

function prefetchTranscript(videoKey = watchVideoKey(), {
    allowNativePanelOpen = false,
    force = false,
    kind = "",
} = {}) {
    if (!videoKey || document.hidden || transcriptCache.has(videoKey)) {
        return null;
    }

    if (!force && !shouldPrefetchTranscriptForGeneration()) {
        return null;
    }

    const existingRequest = transcriptRequestCache.get(videoKey);
    if (
        existingRequest
        && (!allowNativePanelOpen || existingRequest.allowNativePanelOpen)
    ) {
        // Reconciliation and status refresh can request the same passive
        // prefetch many times while YouTube is still exposing captions. The
        // first prefetch already owns completion refresh/error handling, so do
        // not register duplicate consumers or duplicate diagnostic messages.
        return existingRequest.promise;
    }

    const request = transcriptOrchestrator.get(videoKey, kind || preferredTranscriptDebugKind(), { allowNativePanelOpen });
    request
        .then((transcript) => {
            if (currentVideoKey === videoKey) {
                if (transcript?.text) {
                    syncNativeHeaderCopyButton();
                }
                scheduleNativePanelRefresh();
            }
        })
        .catch((error) => {
            console.debug("[Apple Intelligence content:transcript] Background transcript fetch failed", error);
        });

    return request;
}

function prefetchTranscriptForCopy() {
    return prefetchTranscript(watchVideoKey(), {
        allowNativePanelOpen: true,
        force: true,
    });
}

function unavailableMessage(kind) {
    return isTimestampTab(kind)
        ? "Timestamps could not be generated. If the video is still live, wait for it to finish and then try again."
        : "Summary could not be generated.";
}

function getSidebarTarget() {
    if (getLiveChatBlock()) {
        return document.querySelector("ytd-watch-flexy #secondary")
            || document.querySelector("ytd-watch-flexy #secondary-inner");
    }

    return document.querySelector("ytd-watch-flexy #secondary-inner")
        || document.querySelector("ytd-watch-flexy #secondary");
}

function getLiveChatBlock() {
    return document.querySelector("ytd-watch-flexy #chat")
        || document.querySelector("ytd-watch-flexy #chat-container")
        || document.querySelector("ytd-watch-flexy ytd-live-chat-frame");
}

function getPanelHosts() {
    return SIDEBAR_HOST_IDS.flatMap((hostID) => Array.from(document.querySelectorAll(`#${hostID}`)));
}

function dedupePanelHosts(preferredHost = panelHost) {
    const hosts = getPanelHosts();
    const keeper = preferredHost && hosts.includes(preferredHost)
        ? preferredHost
        : hosts[0] ?? null;

    for (const host of hosts) {
        if (host !== keeper) {
            host.remove();
        }
    }

    return keeper;
}

function clearVideoDiscoveryTimeouts() {
    for (const timeoutID of videoDiscoveryTimeouts) {
        window.clearTimeout(timeoutID);
    }
    videoDiscoveryTimeouts = [];
}

function clearNavigationReconcileTimeouts() {
    for (const timeoutID of navigationReconcileTimeouts) {
        window.clearTimeout(timeoutID);
    }
    navigationReconcileTimeouts = [];
}

function scheduleNavigationReconciliation(expectedURL = window.location.href) {
    clearNavigationReconcileTimeouts();
    for (const delay of NAVIGATION_RECONCILE_DELAYS_MS) {
        const timeoutID = window.setTimeout(() => {
            navigationReconcileTimeouts = navigationReconcileTimeouts.filter((id) => id !== timeoutID);
            if (window.location.href === expectedURL && isWatchPage()) {
                void ensurePanel();
            }
        }, delay);
        navigationReconcileTimeouts.push(timeoutID);
    }
}

function beginVideoDiscovery(videoKey) {
    clearVideoDiscoveryTimeouts();
    touchVideoSession(videoKey);
    nativePanelDiscoveryDeadline = Date.now() + NATIVE_PANEL_DISCOVERY_GRACE_MS;
    prefetchTranscript(videoKey, {
        allowNativePanelOpen: false,
        force: true,
    });
    const detection = nativeChapterDetection(videoKey);
    if (detection?.status === "pending") {
        detection.deadline = Date.now() + NATIVE_DISCOVERY_GRACE_MS;
    }

    const panelTimeoutID = window.setTimeout(() => {
        videoDiscoveryTimeouts = videoDiscoveryTimeouts.filter((id) => id !== panelTimeoutID);
        scheduleNativePanelRefresh();
    }, NATIVE_PANEL_DISCOVERY_GRACE_MS);
    videoDiscoveryTimeouts.push(panelTimeoutID);

    const chapterTimeoutID = window.setTimeout(() => {
        videoDiscoveryTimeouts = videoDiscoveryTimeouts.filter((id) => id !== chapterTimeoutID);
        nativeChapterDetectionStatus(videoKey);
        scheduleNativePanelRefresh();
    }, NATIVE_DISCOVERY_GRACE_MS);
    videoDiscoveryTimeouts.push(chapterTimeoutID);
}

function nativePanelDiscoveryPending() {
    return Boolean(currentVideoKey) && Date.now() < nativePanelDiscoveryDeadline;
}

function getPanelMount() {
    const nativeMount = nativePanel.getMount();
    if (nativeMount) {
        // Placement and chapter-source discovery are independent. Mount the
        // unified surface as soon as YouTube's shell exists; Chapters can keep
        // resolving without blocking Summary or the surrounding panel.
        if (nativePanel.open(nativeMount)) {
            return {
                type: "native",
                target: nativeMount.content,
                nativeMount,
            };
        }

        return null;
    }

    if (state.nativePanelDismissed) {
        return null;
    }

    if (panelHost?.dataset.ytsPlacement === "native" && currentVideoKey && currentVideoKey === getVideoKey()) {
        return null;
    }

    // Engagement panels can be absent for the duration of a pre-roll ad and
    // then appear all at once. Hold the fallback during that bounded discovery
    // window so the page does not flash a standalone sidebar and later move it.
    if (nativePanelDiscoveryPending()) {
        return null;
    }

    // The standalone surface exists only to present transcript-backed
    // generation. If YouTube has no native In this video shell, wait for the
    // one shared transcript detector and mount only after it succeeds. A
    // terminal miss leaves the page untouched instead of showing an error-only
    // extension sidebar.
    const videoKey = watchVideoKey();
    if (transcriptOrchestrator.status(videoKey) === "unknown") {
        // Initial discovery can be skipped while Safari keeps a background tab
        // hidden. Start the same passive detector when fallback placement is
        // first evaluated in the foreground; do not create a second probe.
        prefetchTranscript(videoKey, {
            allowNativePanelOpen: false,
            force: true,
        });
    }
    if (!transcriptOrchestrator.hasAvailableTranscript(videoKey)) {
        return null;
    }

    const sidebarTarget = getSidebarTarget();
    if (!sidebarTarget) {
        return null;
    }

    return {
        type: "sidebar",
        target: sidebarTarget,
        nativeMount: null,
    };
}

function isPanelBeforeElement(element) {
    if (!panelHost || !element) {
        return false;
    }

    return Boolean(panelHost.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function isPanelPlaced(mount) {
    if (!panelHost || !mount?.target) {
        return false;
    }

    if (mount.type === "native") {
        return mount.target.contains(panelHost);
    }

    const liveChat = getLiveChatBlock();
    if (liveChat?.parentElement) {
        return liveChat.parentElement.contains(panelHost)
            && isPanelBeforeElement(liveChat);
    }

    return mount.target.contains(panelHost);
}

function placePanelHost(mount) {
    if (!panelHost || !mount?.target) {
        return;
    }

    panelHost.dataset.ytsPlacement = mount.type;
    if (mount.type === "native") {
        mount.target.append(panelHost);
        nativePanel.syncTabs(mount.nativeMount);
        return;
    }

    const liveChat = getLiveChatBlock();
    if (liveChat?.parentElement) {
        liveChat.parentElement.insertBefore(panelHost, liveChat);
        return;
    }

    mount.target.prepend(panelHost);
}

function removePanel({ preserveNativeControls = false } = {}) {
    detachActiveChapterTracker();
    nativePanel.clearTabSwitch();
    nativePanel.clearResync();
    panelHost?.remove();
    for (const host of getPanelHosts()) {
        host.remove();
    }
    if (!preserveNativeControls) {
        nativePanel.cleanupTabs();
        nativePanel.cleanupHeaderActions();
    }
    nativePanel.syncContentVisibility(null);
    panelHost = null;
}

function removeStandalonePanels() {
    if (panelHost && panelHost.dataset.ytsPlacement !== "native") {
        removePanel({ preserveNativeControls: true });
    }
    for (const host of getPanelHosts()) {
        if (host.dataset.ytsPlacement !== "native") {
            host.remove();
        }
    }
}

function resetPanelState() {
    nativePanel.clearTranscriptCopyRefresh();
    nativePanel.clearTabSwitch();
    nativePanel.clearResync();
    state.activeTab = defaultActiveTab();
    state.nativeExtensionTab = "";
    state.nativeYouTubeTab = "";
    state.nativePanelDismissed = false;
    state.userSelectedTab = false;
    syncGeneratedChapterOverrideState();
    state.timestampsText = "";
    state.timestampsSource = "";
    state.summaryText = "";
    state.errors = {
        timestamps: "",
        summary: "",
    };
    state.debug = {
        timestamps: "",
        summary: "",
    };
    state.isLoading = {
        timestamps: false,
        summary: false,
    };
    // Invalidate old async work without recycling IDs. A stale request from a
    // previous video must never match a new video's first request and clear or
    // overwrite its loading state when it eventually settles.
    state.generationIDs = invalidateGenerationIDs(state.generationIDs);
    state.generationDurationsMs = {
        timestamps: 0,
        summary: 0,
    };
    state.generationEngineLabels = {
        timestamps: "",
        summary: "",
    };
    state.copyFeedback = {
        timestamps: false,
        summary: false,
        transcript: false,
    };
    state.copyErrors = {
        timestamps: "",
        summary: "",
        transcript: "",
    };
    state.autogenerationAttempted = {
        timestamps: false,
        summary: false,
    };
}

function cleanupNonWatchPage() {
    stopNativePanelObserver();
    clearVideoDiscoveryTimeouts();
    clearNavigationReconcileTimeouts();
    nativePanelDiscoveryDeadline = 0;
    navigationDataCache = {
        videoKey: "",
        response: null,
    };
    currentVideoKey = null;
    resetPanelState();
    removePanel();

    for (const delay of [0, 150, 600]) {
        window.setTimeout(() => {
            if (!isWatchPage()) {
                removePanel();
            }
        }, delay);
    }
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function isTimestampTab(kind) {
    return kind === "timestamps";
}

function buttonLabel(kind) {
    if (
        state.isLoading[kind]
        || (kind === "timestamps" && isTimestampChapterDiscoveryPending())
    ) {
        return kind === "timestamps" ? "Timestamps..." : "Summary...";
    }

    return kind === "timestamps" ? "Timestamps" : "Summary";
}

function activeText(kind) {
    return kind === "timestamps" ? state.timestampsText : state.summaryText;
}

function activeError(kind) {
    return kind === "timestamps" ? state.errors.timestamps : state.errors.summary;
}

function copiedAttribution(kind) {
    if (kind === "transcript") {
        return "";
    }

    if (isTimestampTab(kind) && state.timestampsSource === "youtubeChapters") {
        return "Chapters provided by YouTube.";
    }

    return isTimestampTab(kind)
        ? "Timestamps created with Timestamps & Summaries for YT, a free Safari extension."
        : "Summary created with Timestamps & Summaries for YT, a free Safari extension.";
}

function copyText(kind) {
    if (kind === "transcript") {
        return "";
    }

    const text = activeText(kind).trim();
    if (!text) {
        return "";
    }

    return `${text}\n\n${copiedAttribution(kind)}`;
}

function hasCopyText(kind) {
    if (kind === "transcript") {
        return transcriptCopyText().length > 0;
    }

    return copyText(kind).length > 0;
}

function copyButtonLabel(kind) {
    if (state.copyErrors[kind]) {
        return "Copy failed. Try again";
    }

    if (state.copyFeedback[kind]) {
        if (kind === "transcript") {
            return "Copied transcript";
        }

        if (!isTimestampTab(kind)) {
            return "Copied summary";
        }

        return state.timestampsSource === "youtubeChapters" ? "Copied chapters" : "Copied timestamps";
    }

    if (kind === "transcript") {
        return "Copy transcript";
    }

    if (!isTimestampTab(kind)) {
        return "Copy summary";
    }

    return state.timestampsSource === "youtubeChapters" ? "Copy chapters" : "Copy timestamps";
}

function copyIcon(copied = false) {
    if (copied) {
        return `
            <svg class="copy-confirmation-icon" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
                <path d="m9.55 17.6-4.7-4.7 1.4-1.4 3.3 3.3 8.2-8.2 1.4 1.4-9.6 9.6Z"></path>
            </svg>
        `;
    }

    return `
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
            <path d="M8 7.5A2.5 2.5 0 0 1 10.5 5H17a2.5 2.5 0 0 1 2.5 2.5V14a2.5 2.5 0 0 1-2.5 2.5h-6.5A2.5 2.5 0 0 1 8 14V7.5Zm2.5-.5A.5.5 0 0 0 10 7.5V14a.5.5 0 0 0 .5.5H17a.5.5 0 0 0 .5-.5V7.5A.5.5 0 0 0 17 7h-6.5Z"></path>
            <path d="M4.5 10A2.5 2.5 0 0 1 7 7.5v2A.5.5 0 0 0 6.5 10v6.5a.5.5 0 0 0 .5.5h6.5a.5.5 0 0 0 .5-.5h2A2.5 2.5 0 0 1 13.5 19H7a2.5 2.5 0 0 1-2.5-2.5V10Z"></path>
        </svg>
    `;
}

function cachedTranscriptCopyText() {
    const cachedTranscript = transcriptCache.get(watchVideoKey());
    return cachedTranscript?.text?.trim() || "";
}

function readTranscriptCopyText() {
    const transcript = readNativeTranscriptPanel();
    if (!transcript?.text?.trim()) {
        return "";
    }

    rememberTranscript(watchVideoKey(), transcript);
    return transcript.text.trim();
}

function transcriptCopyText() {
    const cachedText = cachedTranscriptCopyText();
    if (cachedText || transcriptRequestCache.has(watchVideoKey())) {
        return cachedText;
    }

    return readTranscriptCopyText();
}

function copyTextForKind(kind) {
    if (kind === "transcript") {
        return transcriptCopyText();
    }

    return copyText(kind);
}

function resultCaption(kind) {
    if (isTimestampTab(kind) && state.timestampsSource === "youtubeChapters") {
        return "Chapters provided by YouTube.";
    }

    const durationMs = state.generationDurationsMs[kind];
    const durationSuffix = SHOW_GENERATION_TIMING_IN_RESULT_CAPTIONS && durationMs > 0
        ? ` in ${formatGenerationDuration(durationMs)}`
        : "";
    const engineLabel = state.generationEngineLabels[kind] || currentResultEngineLabel(kind);

    return isTimestampTab(kind)
        ? `Chapters generated with ${engineLabel}${durationSuffix}.`
        : `Generated with ${engineLabel}${durationSuffix}.`;
}

function chapterSourceSwitch(kind) {
    if (!isTimestampTab(kind)) {
        return null;
    }

    if (state.timestampsSource === "youtubeChapters" && canGenerateTimestamps()) {
        const hasCachedGeneratedChapters = Boolean(
            cachedGenerationResult(watchVideoKey(), "timestamps")?.text
        );
        return {
            source: "generated",
            label: hasCachedGeneratedChapters
                ? "View generated chapters"
                : "Generate chapters from transcript",
            title: hasCachedGeneratedChapters
                ? "View the cached generated chapters for this video"
                : "Generate alternative chapters from this video's transcript",
        };
    }

    if (state.timestampsSource === "generated" && hasNativeYouTubeChapters()) {
        return {
            source: "native",
            label: "View YouTube chapters",
            title: "View the chapters provided by YouTube for this video",
        };
    }

    return null;
}

function renderResultCaption(kind) {
    const sourceSwitch = chapterSourceSwitch(kind);
    const sourceActionHTML = sourceSwitch
        ? ` <button class="caption-link" type="button" data-chapter-source-switch="${escapeHTML(sourceSwitch.source)}" title="${escapeHTML(sourceSwitch.title)}">${escapeHTML(sourceSwitch.label)}</button>.`
        : "";
    return `<div class="caption">${escapeHTML(resultCaption(kind))}${sourceActionHTML}</div>`;
}

function writeToClipboardWithSelection(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.setAttribute("aria-hidden", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    textarea.style.opacity = "0";
    (document.body || document.documentElement).append(textarea);

    let didCopy = false;
    try {
        textarea.focus({ preventScroll: true });
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        didCopy = document.execCommand("copy");
    } catch (error) {
        console.debug("[Apple Intelligence content:copy] Selection copy failed", error);
    } finally {
        textarea.remove();
    }

    return didCopy;
}

async function writeToClipboard(text) {
    // Run Safari's selection-based path before the first await so it retains the
    // transient user activation from the click. The manifest's clipboardWrite
    // permission authorizes both this path and the async Clipboard API fallback.
    if (writeToClipboardWithSelection(text)) {
        return;
    }

    let pageClipboardError = null;
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (error) {
            pageClipboardError = error;
            console.debug("[Apple Intelligence content:copy] Page Clipboard API failed", error);
        }
    }

    const extensionResponse = await sendMessageWithTimeout({
        type: "ai:copyText",
        text,
    }, 3000).catch((error) => ({
        ok: false,
        error: error?.message || String(error),
    }));
    if (extensionResponse?.ok) {
        return;
    }

    throw new Error(extensionResponse?.error || pageClipboardError?.message || "Clipboard copy failed.");
}

async function copyResult(kind) {
    const text = copyTextForKind(kind);
    if (!text) {
        if (kind === "transcript") {
            nativePanel.scheduleTranscriptCopyRefresh();
        }
        return;
    }

    try {
        await writeToClipboard(text);
        state.copyErrors = {
            ...state.copyErrors,
            [kind]: "",
        };
        state.copyFeedback = {
            ...state.copyFeedback,
            [kind]: true,
        };
        render();
        nativePanel.syncTabs();

        if (copyFeedbackTimeout) {
            clearTimeout(copyFeedbackTimeout);
        }
        copyFeedbackTimeout = setTimeout(() => {
            state.copyFeedback = {
                ...state.copyFeedback,
                [kind]: false,
            };
            render();
            nativePanel.syncTabs();
        }, 1400);
    } catch (error) {
        console.debug("[Apple Intelligence content:copy] Clipboard copy failed", error);
        state.copyErrors = {
            ...state.copyErrors,
            [kind]: "Couldn’t access the clipboard. Try again after reloading the extension.",
        };
        render();
        nativePanel.syncTabs();
    }
}

async function copyActiveResult() {
    await copyResult(state.activeTab);
}

async function copyHeaderResult() {
    const kind = nativePanel.headerCopyKind();
    if (!kind) {
        return;
    }

    await copyResult(kind);
}

function renderConnectionState(message, error = state.statusError) {
    return `
        <div class="surface state-surface">
            <div class="state-copy">${escapeHTML(message)}</div>
            <button class="soft-button" data-open-app>Open Companion App</button>
            ${error ? `<div class="error-copy">${escapeHTML(error)}</div>` : ""}
        </div>
    `;
}

function renderProviderConnectionState() {
    return `
            <div class="surface state-surface">
            <div class="state-copy">Connect ${escapeHTML(providerLabel())} in the companion app to generate timestamps.</div>
            <button class="soft-button" data-open-app>Open Companion App</button>
            ${state.providerError || state.statusError
                ? `<div class="error-copy">${escapeHTML(state.providerError || state.statusError)}</div>`
                : ""}
        </div>
    `;
}

function renderSummaryUnavailableState() {
    if (state.appleIntelligenceAvailable) {
        return renderConnectionState(`Connect ${providerLabel()} in the companion app to generate summaries with the selected model.`);
    }

    return renderConnectionState(`Apple Intelligence is not available on this Mac. Connect ${providerLabel()} in the companion app to generate summaries.`);
}

function renderLoadingState(kind) {
    const debug = debugSummary(kind);
    return `
        <div class="surface state-surface">
            <div class="state-copy">${isTimestampTab(kind) ? "Generating timestamps..." : "Generating summary..."}</div>
            ${debug ? `<pre class="debug-copy">${escapeHTML(debug)}</pre>` : ""}
        </div>
    `;
}

function renderEmptyState(kind) {
    return `
        <div class="surface state-surface">
            <div class="state-copy">${
                isTimestampTab(kind)
                    ? "Timestamps will appear here automatically."
                    : "Summary will appear here automatically."
            }</div>
        </div>
    `;
}

function renderTimestampChapterDiscoveryState() {
    return `
        <div class="surface state-surface">
            <div class="state-copy">Checking for YouTube chapters...</div>
        </div>
    `;
}

function renderErrorState(kind, message) {
    if (message === unavailableMessage(kind)) {
        return `
            <div class="surface state-surface">
                <div class="state-copy">${escapeHTML(message)}</div>
            </div>
        `;
    }

    const debug = debugSummary(kind);
    return `
        <div class="surface state-surface">
            <div class="error-copy">${escapeHTML(message)}</div>
            ${debug ? `<pre class="debug-copy">${escapeHTML(debug)}</pre>` : ""}
            <div class="caption">${
                kind === "timestamps"
                    ? "Select Timestamps again to retry."
                    : "Select Summary again to retry."
            }</div>
        </div>
    `;
}

function chapterLinks() {
    return Array.from(panelHost?.shadowRoot?.querySelectorAll?.("[data-chapter='true']") || []);
}

function syncActiveChapterHighlight() {
    const links = chapterLinks();
    if (links.length === 0) {
        return;
    }

    const video = activeChapterVideoElement || document.querySelector("video");
    const currentSeconds = Number(video?.currentTime);
    let activeLink = null;

    if (Number.isFinite(currentSeconds)) {
        for (const link of links) {
            const seconds = Number(link.getAttribute("data-seconds") || "");
            if (!Number.isFinite(seconds)) {
                continue;
            }

            if (seconds <= currentSeconds + 0.25) {
                activeLink = link;
                continue;
            }

            break;
        }
    }

    for (const link of links) {
        const isActive = link === activeLink;
        link.dataset.active = isActive ? "true" : "false";
        if (isActive) {
            link.setAttribute("aria-current", "true");
        } else {
            link.removeAttribute("aria-current");
        }
    }
}

function scheduleActiveChapterSync() {
    if (activeChapterSyncFrame !== null) {
        return;
    }

    activeChapterSyncFrame = requestAnimationFrame(() => {
        activeChapterSyncFrame = null;
        syncActiveChapterHighlight();
    });
}

function detachActiveChapterTracker() {
    if (activeChapterSyncFrame !== null) {
        cancelAnimationFrame(activeChapterSyncFrame);
        activeChapterSyncFrame = null;
    }

    if (!activeChapterVideoElement) {
        return;
    }

    activeChapterVideoElement.removeEventListener("timeupdate", scheduleActiveChapterSync);
    activeChapterVideoElement.removeEventListener("seeking", scheduleActiveChapterSync);
    activeChapterVideoElement.removeEventListener("seeked", scheduleActiveChapterSync);
    activeChapterVideoElement.removeEventListener("loadedmetadata", scheduleActiveChapterSync);
    activeChapterVideoElement.removeEventListener("play", scheduleActiveChapterSync);
    activeChapterVideoElement = null;
}

function syncActiveChapterTracker() {
    const video = document.querySelector("video");
    if (video === activeChapterVideoElement) {
        scheduleActiveChapterSync();
        return;
    }

    detachActiveChapterTracker();
    activeChapterVideoElement = video;
    if (!activeChapterVideoElement) {
        return;
    }

    activeChapterVideoElement.addEventListener("timeupdate", scheduleActiveChapterSync);
    activeChapterVideoElement.addEventListener("seeking", scheduleActiveChapterSync);
    activeChapterVideoElement.addEventListener("seeked", scheduleActiveChapterSync);
    activeChapterVideoElement.addEventListener("loadedmetadata", scheduleActiveChapterSync);
    activeChapterVideoElement.addEventListener("play", scheduleActiveChapterSync);
    scheduleActiveChapterSync();
}

function renderTimestampsResult(kind = "timestamps") {
    const text = activeText(kind);
    if (state.isLoading[kind] && !text) {
        return renderLoadingState(kind);
    }

    if (activeError(kind) && !text) {
        return renderErrorState(kind, activeError(kind));
    }

    if (!text && isTimestampChapterDiscoveryPending()) {
        return renderTimestampChapterDiscoveryState();
    }

    if (!text) {
        return renderEmptyState(kind);
    }

    const parsed = parseTimestamps(text);
    if (parsed.length === 0) {
        return `
            <div class="surface result-surface chapter-result-surface">
                <div class="summary-text">${escapeHTML(text)}</div>
                ${renderResultCaption(kind)}
            </div>
        `;
    }

    const tracksActiveChapter = kind === "timestamps";
    return `
        <div class="surface result-surface chapter-result-surface">
            <div class="timestamp-list">
                ${parsed.map((item) => `
                    <a class="timestamp-link" href="${escapeHTML(buildTimestampHref(item.seconds))}" data-seconds="${item.seconds}"${tracksActiveChapter ? " data-chapter=\"true\"" : ""}>
                        <span class="timestamp-time">${escapeHTML(item.time)}</span>
                        <span class="timestamp-label">${escapeHTML(item.label)}</span>
                    </a>
                `).join("")}
            </div>
            ${renderResultCaption(kind)}
        </div>
    `;
}

function renderSummaryResult(kind = "summary") {
    if (state.isLoading[kind] && !activeText(kind)) {
        return renderLoadingState(kind);
    }

    if (activeError(kind) && !activeText(kind)) {
        return renderErrorState(kind, activeError(kind));
    }

    if (!activeText(kind)) {
        return renderEmptyState(kind);
    }

    return `
        <div class="surface result-surface">
            <div class="summary-rich">${renderFormattedSummaryHTML(activeText(kind))}</div>
            <div class="caption">${escapeHTML(resultCaption(kind))}</div>
        </div>
    `;
}

function resultScrollSurface(root) {
    return root.querySelector(".native-body")
        || root.querySelector(".body > .surface");
}

function renderActiveContent() {
    if (state.activeTab === "timestamps" && !canGenerateTimestamps() && !state.timestampsText) {
        return renderProviderConnectionState();
    }

    if (state.activeTab === "summary" && !canGenerateSummary()) {
        return renderSummaryUnavailableState();
    }

    if (state.activeTab === "summary" && state.settings.summaryEngine === "appleIntelligence" && !state.appleIntelligenceAvailable) {
        return renderConnectionState("Apple Intelligence is not available on this Mac.");
    }

    if (isTimestampTab(state.activeTab)) {
        return renderTimestampsResult(state.activeTab);
    }

    return renderSummaryResult(state.activeTab);
}

function captureRenderScrollState(root) {
    const surface = resultScrollSurface(root);
    if (!surface) {
        return null;
    }

    return {
        activeTab: state.activeTab,
        scrollTop: surface.scrollTop,
        scrollLeft: surface.scrollLeft,
    };
}

function restoreRenderScrollState(root, scrollState) {
    if (!scrollState || scrollState.activeTab !== state.activeTab) {
        return;
    }

    const surface = resultScrollSurface(root);
    if (!surface) {
        return;
    }

    surface.scrollTop = scrollState.scrollTop;
    surface.scrollLeft = scrollState.scrollLeft;
}

function attachPanelControlListeners(root) {
    if (!root || wiredPanelRoots.has(root)) {
        return;
    }

    wiredPanelRoots.add(root);
    root.addEventListener("click", handlePanelControlClick, true);
}

function render() {
    if (!panelHost) {
        return;
    }

    const root = panelHost.shadowRoot;
    if (!root) {
        return;
    }
    attachPanelControlListeners(root);

    const nativePanelMode = panelHost.dataset.ytsPlacement === "native";
    if (nativePanelMode && state.nativeExtensionTab && !nativePanel.extensionTabKinds().includes(state.nativeExtensionTab)) {
        state.nativeExtensionTab = "";
    }

    panelHost.hidden = nativePanelMode && !state.nativeExtensionTab;
    if (panelHost.hidden) {
        nativePanel.syncTabs();
        return;
    }

    const scrollState = captureRenderScrollState(root);

    root.innerHTML = `
        <style>
            :host {
                all: initial;
            }

            :host([data-yts-placement="native"]) {
                display: block;
                min-height: 0;
            }

            .wrap {
                --bg: #ffffff;
                --surface: #f6f6f7;
                --surface-strong: #efeff1;
                --border: rgba(15, 23, 42, 0.09);
                --text: var(--yt-spec-text-primary, #0f0f0f);
                --muted: var(--yt-spec-text-secondary, #606060);
                --accent: #d93025;
                --shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
                --tab-background: var(--yt-spec-badge-chip-background, #f2f2f2);
                --tab-background-hover: var(--yt-spec-button-chip-background-hover, #e7e7e7);
                --tab-selected-background: var(--yt-spec-text-primary, #0f0f0f);
                --tab-selected-text: var(--yt-spec-text-primary-inverse, #ffffff);
                margin: 0 0 16px;
                color: var(--text);
                font-family: "Roboto", "Arial", sans-serif;
                font-size: 1.4rem;
                font-weight: 400;
                letter-spacing: normal;
                line-height: 2rem;
                -webkit-font-smoothing: antialiased;
            }

            @media (prefers-color-scheme: dark) {
                .wrap {
                    --bg: #191a1c;
                    --surface: #202226;
                    --surface-strong: #2a2d31;
                    --border: rgba(255, 255, 255, 0.08);
                    --text: var(--yt-spec-text-primary, #f1f1f1);
                    --muted: var(--yt-spec-text-secondary, #aaa);
                    --accent: #ff5a4f;
                    --shadow: 0 12px 28px rgba(0, 0, 0, 0.22);
                    --tab-background: var(--yt-spec-badge-chip-background, #2f3033);
                    --tab-background-hover: var(--yt-spec-button-chip-background-hover, #3a3b3f);
                    --tab-selected-background: var(--yt-spec-static-brand-white, #f1f1f1);
                    --tab-selected-text: #0f0f0f;
                }
            }

            .panel {
                display: grid;
                grid-template-rows: auto minmax(0, 1fr);
                width: min(100%, 392px);
                height: 520px;
                border: 1px solid var(--border);
                border-radius: 18px;
                background: var(--bg);
                box-shadow: var(--shadow);
                overflow: hidden;
            }

            .tabs {
                display: flex;
                flex-direction: column;
                gap: 12px;
                min-width: 0;
                flex: 1 1 auto;
            }

            .tab-row {
                display: flex;
                gap: 12px;
                overflow-x: auto;
                scrollbar-width: none;
            }

            .tab-row::-webkit-scrollbar {
                display: none;
            }

            .toolbar {
                display: flex;
                align-items: flex-start;
                gap: 10px;
                padding: 16px 16px 10px;
            }

            .tab {
                appearance: none;
                border: 0;
                border-radius: 10px;
                background: var(--tab-background);
                color: var(--text);
                padding: 0 18px;
                min-height: 34px;
                flex: 0 0 auto;
                font: inherit;
                font-size: 1.4rem;
                font-weight: 500;
                line-height: 34px;
                white-space: nowrap;
                cursor: pointer;
                transition: background 120ms ease, color 120ms ease;
            }

            .copy-button {
                appearance: none;
                border: 0;
                border-radius: 999px;
                background: transparent;
                color: var(--muted);
                width: 34px;
                height: 34px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex: 0 0 auto;
                cursor: pointer;
                opacity: 0.58;
                transition: background 120ms ease, color 120ms ease, opacity 120ms ease;
            }

            .copy-button svg {
                display: block;
                fill: currentColor;
            }

            .copy-button:hover:not(:disabled),
            .copy-button[data-copied="true"] {
                background: var(--surface-strong);
                color: var(--text);
                opacity: 0.9;
            }

            .copy-button[data-copied="true"] {
                color: #2e9b4b;
                opacity: 1;
            }

            .copy-button[data-copied="true"] svg {
                animation: copy-confirmation 320ms ease-out;
            }

            @keyframes copy-confirmation {
                0% { opacity: 0; transform: scale(0.55); }
                65% { opacity: 1; transform: scale(1.18); }
                100% { opacity: 1; transform: scale(1); }
            }

            .copy-button:disabled {
                cursor: default;
                opacity: 0.22;
            }

            .tab:hover {
                background: var(--tab-background-hover);
            }

            .tab.active {
                background: var(--tab-selected-background);
                color: var(--tab-selected-text);
            }

            .body {
                min-height: 0;
                padding: 4px 18px 18px;
            }

            .surface {
                display: grid;
                gap: 10px;
                height: 100%;
                padding: 0;
                border: 0;
                background: transparent;
                overflow: auto;
            }

            .result-surface {
                align-content: start;
            }

            .chapter-result-surface {
                gap: 10px;
            }

            .state-surface {
                align-content: start;
                justify-items: start;
                padding: 8px 0;
            }

            .state-copy,
            .error-copy,
            .caption,
            .summary-text,
            .debug-copy {
                white-space: pre-wrap;
            }

            .state-copy {
                color: var(--text);
            }

            .error-copy {
                color: var(--text);
            }

            .caption {
                color: var(--muted);
                font-size: 1.2rem;
                line-height: 1.8rem;
            }

            .chapter-result-surface > .caption {
                text-align: left;
            }

            .caption-link {
                appearance: none;
                border: 0;
                background: transparent;
                color: inherit;
                cursor: pointer;
                font: inherit;
                font-weight: inherit;
                margin: 0;
                padding: 0;
                text-decoration: underline;
                text-decoration-thickness: 1px;
                text-underline-offset: 2px;
            }

            .caption-link:hover {
                color: var(--text);
            }

            .caption-link:focus-visible {
                border-radius: 2px;
                outline: 2px solid currentColor;
                outline-offset: 2px;
            }

            .copy-error {
                color: var(--muted);
                font-size: 1.2rem;
                line-height: 1.8rem;
                padding: 0 16px 8px;
            }

            .debug-copy {
                margin: 0;
                color: var(--muted);
                font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            }

            .soft-button,
            .timestamp-link {
                appearance: none;
                border: 0;
                background: transparent;
                font: inherit;
            }

            .soft-button {
                cursor: pointer;
                color: var(--muted);
                padding: 0;
                font-weight: 600;
            }

            .soft-button:hover {
                color: var(--text);
            }

            .timestamp-list {
                display: grid;
                gap: 0;
            }

            .timestamp-link {
                display: flex;
                gap: 8px;
                align-items: flex-start;
                width: 100%;
                color: var(--text);
                text-align: left;
                text-decoration: none;
                cursor: pointer;
                font-size: 1.4rem;
                font-weight: 400;
                letter-spacing: normal;
                line-height: 2rem;
            }

            .timestamp-link[data-active="true"] {
                font-weight: 700;
            }

            .timestamp-link[data-active="true"] .timestamp-label {
                font-weight: 700;
            }

            .timestamp-time {
                color: var(--accent);
                font-weight: 700;
                font-variant-numeric: tabular-nums;
                flex: 0 0 auto;
            }

            .timestamp-label {
                color: var(--text);
            }

            .summary-rich {
                display: grid;
                gap: 6px;
                font-size: 1.4rem;
                font-weight: 400;
                letter-spacing: normal;
                line-height: 2rem;
            }

            .summary-rich p,
            .summary-rich ul {
                margin: 0;
            }

            .summary-rich strong,
            .summary-section-title {
                font-weight: 700;
            }

            .summary-section-title {
                margin-top: 4px;
            }

            .summary-rich > .summary-section-title:first-child {
                margin-top: 0;
            }

            .summary-rich ul {
                padding-left: 18px;
            }

            .summary-rich li > ul {
                margin-top: 2px;
                padding-left: 16px;
            }

            .summary-rich li + li {
                margin-top: 2px;
            }

            .native-wrap {
                height: 100%;
                margin: 0;
                min-height: 0;
            }

            .native-panel {
                color: var(--text);
                display: flex;
                flex-direction: column;
                font-family: "Roboto", "Arial", sans-serif;
                font-size: 1.4rem;
                font-weight: 400;
                letter-spacing: normal;
                line-height: 2rem;
                min-height: 0;
                padding: 0 16px 16px;
                -webkit-font-smoothing: antialiased;
            }

            .native-body {
                --yts-native-body-fallback-height: min(620px, max(420px, calc(100vh - 320px)));
                box-sizing: border-box;
                flex: 1 1 auto;
                height: var(--yts-native-body-height, var(--yts-native-body-fallback-height));
                min-height: min(260px, var(--yts-native-body-height, 260px));
                max-height: var(--yts-native-body-max-height, var(--yts-native-body-height, var(--yts-native-body-fallback-height)));
                overflow: auto;
                padding-bottom: 18px;
                scrollbar-width: thin;
            }

            .native-wrap .surface {
                height: auto;
                max-height: none;
                overflow: visible;
                padding-bottom: 2px;
            }

            .native-wrap .state-surface {
                padding: 4px 0 0;
            }

            .native-wrap .timestamp-link {
                padding: 0;
            }

        </style>
        ${nativePanelMode ? `
        <div class="wrap native-wrap">
            <div class="native-panel">
                <div class="native-body">
                    ${renderActiveContent()}
                </div>
            </div>
        </div>
        ` : `
        <div class="wrap">
            <div class="panel">
                <div class="toolbar">
                    <div class="tabs">
                        <div class="tab-row">
                            <button
                                class="tab ${state.activeTab === "timestamps" ? "active" : ""}"
                                data-tab="timestamps"
                                aria-busy="${state.isLoading.timestamps ? "true" : "false"}"
                            >
                                ${escapeHTML(buttonLabel("timestamps"))}
                            </button>
                            <button
                                class="tab ${state.activeTab === "summary" ? "active" : ""}"
                                data-tab="summary"
                                aria-busy="${state.isLoading.summary ? "true" : "false"}"
                            >
                                ${escapeHTML(buttonLabel("summary"))}
                            </button>
                        </div>
                    </div>
                    <button
                        class="copy-button"
                        data-copy-active
                        data-copied="${state.copyFeedback[state.activeTab] ? "true" : "false"}"
                        aria-label="${escapeHTML(copyButtonLabel(state.activeTab))}"
                        title="${escapeHTML(copyButtonLabel(state.activeTab))}"
                        ${hasCopyText(state.activeTab) ? "" : "disabled"}
                    >
                        ${copyIcon(Boolean(state.copyFeedback[state.activeTab]))}
                    </button>
                </div>
                ${state.copyErrors[state.activeTab]
                    ? `<div class="copy-error" role="status">${escapeHTML(state.copyErrors[state.activeTab])}</div>`
                    : ""}
                <div class="body">
                    ${renderActiveContent()}
                </div>
            </div>
        </div>
        `}
    `;

    if (nativePanelMode) {
        nativePanel.syncTabs();
        requestAnimationFrame(() => nativePanel.syncBodyViewport());
    }

    restoreRenderScrollState(root, scrollState);
    syncActiveChapterTracker();
}

async function performStatusRefresh() {
    const previousChapterPreference = normalizedChapterPreference(state.settings.chapterPreference);
    const response = await sendMessageWithTimeout({ type: "ai:getStatus" }, 20000).catch((error) => {
        console.debug("[Apple Intelligence content:status] Status refresh failed", error);
        return {
            ok: false,
            error: error?.message || "The extension could not refresh provider status.",
        };
    });

    const statusResult = contentState.reduceStatusState(state, response);
    if (!statusResult.applied) {
        state.statusError = statusResult.error;
        render();
        return false;
    }

    Object.assign(state, statusResult.value);
    state.settings.chapterPreference = normalizedChapterPreference(state.settings.chapterPreference);
    const nextChapterPreference = state.settings.chapterPreference;
    const chapterPreferenceChanged = nextChapterPreference !== previousChapterPreference;
    syncGeneratedChapterOverrideState();
    const statusVideoKey = currentVideoKey || getVideoKey() || "";
    if (chapterPreferenceChanged && state.nativeChaptersOverridden && state.timestampsSource === "youtubeChapters") {
        resetTimestampResultForChapterSourceChange(statusVideoKey);
        state.nativeExtensionTab = "timestamps";
        state.nativeYouTubeTab = "";
    } else if (
        chapterPreferenceChanged
        && !state.nativeChaptersOverridden
        && state.timestampsSource === "generated"
        && hasNativeYouTubeChapters(statusVideoKey)
    ) {
        resetTimestampResultForChapterSourceChange(statusVideoKey);
        state.userSelectedTab = false;
        applyNativeChaptersIfAvailable(statusVideoKey);
        state.userSelectedTab = true;
    }
    if (!state.userSelectedTab) {
        state.activeTab = defaultActiveTab();
        if (panelHost?.dataset.ytsPlacement === "native" || nativePanel.getMount()) {
            nativePanel.selectDefaultExtensionTab();
        }
    }
    nativePanel.syncTabs();
    render();
    prefetchTranscript();
    return true;
}

const statusRefreshCoordinator = contentState.createSerialRefreshCoordinator(performStatusRefresh);

async function refreshStatus() {
    return await statusRefreshCoordinator.request();
}

function refreshStatusInBackground() {
    void (async () => {
        await refreshStatus();
        await maybeAutogenerateAnalysis();
    })().catch((error) => {
        console.debug("[Apple Intelligence content:status] Background status refresh failed", error);
    });
}

async function openCompanionApp() {
    // Use the actual user click gesture to open the registered companion app
    // URL scheme. Safari can reject native-extension attempts to launch the app
    // even though a user-initiated page link is allowed.
    const link = document.createElement("a");
    link.href = COMPANION_APP_URL;
    link.rel = "noreferrer";
    link.style.display = "none";
    document.documentElement.append(link);
    link.click();
    link.remove();

    await sleep(1200);
    await refreshStatus();
}

async function handleTabSelection(kind) {
    state.activeTab = kind;
    state.userSelectedTab = true;
    render();

    if (kind === "timestamps") {
        await maybeGenerateTimestamps();
    } else {
        await maybeGenerateSummary();
    }
}

function resetTimestampResultForChapterSourceChange(videoKey) {
    clearPendingGeneration(videoKey, "timestamps");
    generationRequestKeys.delete(`${videoKey}:timestamps`);
    state.autogenerationAttempted.timestamps = false;
    state.generationIDs.timestamps += 1;
    state.activeTab = "timestamps";
    state.userSelectedTab = true;
    state.timestampsText = "";
    state.timestampsSource = "";
    state.errors.timestamps = "";
    state.debug.timestamps = "";
    state.isLoading.timestamps = false;
    state.generationDurationsMs.timestamps = 0;
    state.generationEngineLabels.timestamps = "";
}

async function switchVideoChapterSource(source = "generated") {
    if (!isWatchPage()) {
        return false;
    }

    const videoKey = getVideoKey();
    if (!videoKey) {
        return false;
    }

    const nextSource = normalizedChapterSourceOverride(source);
    if (nextSource === "generated" && !canGenerateTimestamps()) {
        return false;
    }

    if (nextSource === "native" && !hasNativeYouTubeChapters(videoKey)) {
        return false;
    }

    if (nextSource) {
        chapterSourceOverrideByVideoKey.set(videoKey, nextSource);
    } else {
        chapterSourceOverrideByVideoKey.delete(videoKey);
    }

    syncGeneratedChapterOverrideState(videoKey);
    resetTimestampResultForChapterSourceChange(videoKey);
    state.nativePanelDismissed = false;

    if (state.nativeChaptersOverridden) {
        state.nativeExtensionTab = "timestamps";
        state.nativeYouTubeTab = "";
    } else {
        state.userSelectedTab = false;
        state.nativeExtensionTab = "";
        state.nativeYouTubeTab = "chapters";
        applyNativeChaptersIfAvailable(videoKey);
    }

    await ensurePanel();
    state.userSelectedTab = true;
    nativePanel.syncTabs();
    render();
    if (state.nativeChaptersOverridden) {
        void maybeGenerateTimestamps();
    }

    return true;
}

async function maybeGenerateTimestamps() {
    if (shouldWaitForNativeChapterDetection()) {
        return;
    }

    if (applyNativeChaptersIfAvailable()) {
        render();
        return;
    }

    if (!canGenerateTimestamps() || state.timestampsText) {
        return;
    }

    await requestGeneration("timestamps");
}

async function maybeGenerateSummary() {
    if (!canGenerateSummary() || state.summaryText) {
        return;
    }

    await requestGeneration("summary");
}

async function maybeAutogenerateAnalysis() {
    if (
        !isWatchPage()
        || document.hidden
        || (state.timestampsText && state.summaryText)
    ) {
        return;
    }

    const videoKey = watchVideoKey();
    const nativeMountAvailable = Boolean(nativePanel.getMount());
    if (!nativeMountAvailable && !transcriptOrchestrator.hasAvailableTranscript(videoKey)) {
        // Passive discovery owns fallback eligibility. Do not escalate to
        // generation or create transcript errors on a page where the extension
        // has no usable surface.
        return;
    }

    applyNativeChaptersIfAvailable();
    prefetchTranscript();

    const kinds = automaticGenerationKinds({
        canGenerateTimestamps: canGenerateTimestamps(),
        canGenerateSummary: canGenerateSummary(),
        timestampsText: state.timestampsText,
        summaryText: state.summaryText,
        timestampsBlocked: shouldWaitForNativeChapterDetection(),
        attempted: state.autogenerationAttempted,
    });
    if (kinds.length === 0) {
        return;
    }

    const requests = kinds.map((kind) => {
        state.autogenerationAttempted[kind] = true;
        return requestGeneration(kind);
    });
    if (requests.length > 0) {
        await Promise.all(requests);
    }
}

function autogenerateAnalysisInBackground() {
    const result = maybeAutogenerateAnalysis();
    if (result && typeof result.catch === "function") {
        result.catch((error) => {
            console.debug("[Apple Intelligence content:generation] Automatic analysis failed", error);
        });
    }
}

async function waitForPendingGenerationJob(videoKey, kind, generationID) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < PENDING_GENERATION_START_GRACE_MS) {
        if (!isCurrentGeneration(videoKey, kind, generationID)) {
            return null;
        }

        if (kind === "timestamps" && applyNativeChaptersIfAvailable(videoKey)) {
            render();
            return null;
        }

        if (restoreCachedGenerationText(videoKey, kind)) {
            render();
            return null;
        }

        const pending = readPendingGeneration(videoKey, kind);
        if (!pending) {
            return null;
        }

        if (pending.jobId) {
            return pending;
        }

        await sleep(500);
    }

    return null;
}

async function pollGenerationJob(kind, videoKey, generationID, jobID, generationTimeoutMs) {
    return await generationJobPoller.poll({
        jobID,
        timeoutMs: generationTimeoutMs,
        isCurrent: () => isCurrentGeneration(videoKey, kind, generationID),
        onMessages: (messages) => {
            if (mergeDebugLines(kind, messages)) {
                render();
            }
        },
        onWait: (elapsedSeconds) => {
            logDebug(kind, `waiting: ${elapsedSeconds}s`);
            render();
        },
        timeoutError: kind === "timestamps"
            ? `Timed out waiting for ${modelLabel()} timestamps.`
            : `Timed out waiting for ${summaryEngineLabel()} summary.`,
    });
}

async function requestGeneration(kind) {
    if (!canStartGeneration(kind) || state.isLoading[kind] || activeText(kind)) {
        return;
    }

    const videoKey = currentVideoKey || getVideoKey() || "";
    if (kind === "timestamps" && shouldWaitForNativeChapterDetection(videoKey)) {
        return;
    }
    if (kind === "timestamps" && applyNativeChaptersIfAvailable(videoKey)) {
        render();
        return;
    }

    if (restoreCachedGenerationText(videoKey, kind)) {
        render();
        return;
    }

    const requestKey = `${videoKey}:${kind}`;
    if (generationRequestDeduplicator.isActive(requestKey)) {
        return;
    }
    await generationRequestDeduplicator.run(requestKey, () => generate(kind));
}

async function generate(kind) {
    if (!canStartGeneration(kind) || state.isLoading[kind]) {
        return;
    }

    const videoKey = getVideoKey();
    if (!videoKey) {
        return;
    }

    if (kind === "timestamps" && shouldWaitForNativeChapterDetection(videoKey)) {
        return;
    }
    if (kind === "timestamps" && applyNativeChaptersIfAvailable(videoKey)) {
        render();
        return;
    }

    if (restoreCachedGenerationText(videoKey, kind)) {
        render();
        return;
    }

    state.errors[kind] = "";
    state.debug[kind] = "";
    state.isLoading[kind] = true;
    state.generationDurationsMs[kind] = 0;
    state.generationEngineLabels[kind] = "";
    state.generationIDs[kind] += 1;
    const generationID = state.generationIDs[kind];
    let generationStartedAt = Date.now();
    logDebug(kind, `started: ${new Date().toLocaleTimeString()}`);
    logDebug(kind, "video: supported YouTube video detected");
    render();

    const transcript = await transcriptOrchestrator.get(videoKey, kind).catch((error) => {
        logDebug(kind, `transcript: failed (${error?.message || String(error)})`);
        return null;
    });
    if (!isCurrentGeneration(videoKey, kind, generationID)) {
        return;
    }

    if (!transcript?.text) {
        state.isLoading[kind] = false;
        state.errors[kind] = "This video does not have an available transcript.";
        render();
        return;
    }

    const usesSelectedProvider = state.generationMode === "selectedProvider" || state.generationMode === "codexChatGPT";
    const requestKind = generationKindForTab(kind, usesSelectedProvider);
    const requestTranscript = transcriptForGeneration(kind, transcript?.text || "");
    const transcriptMetadata = {
        languageCode: transcript?.languageCode || "",
        languageLabel: transcript?.languageLabel || "",
        trackKind: transcript?.trackKind || "",
    };
    const generationTimeoutMs = generationTimeoutForTranscript(requestTranscript);

    logDebug(kind, generationStepDescription(kind, usesSelectedProvider));
    logDebug(kind, `timeout budget: ${Math.round(generationTimeoutMs / 1000)}s`);
    render();

    let jobID = "";
    let pendingGeneration = readPendingGeneration(videoKey, kind);

    if (pendingGeneration?.jobId) {
        jobID = pendingGeneration.jobId;
        generationStartedAt = pendingGeneration.createdAt || generationStartedAt;
        logDebug(kind, `requestId: ${jobID}`);
        logDebug(kind, "step: reusing already running generation job");
    } else if (pendingGeneration) {
        logDebug(kind, "step: waiting for already starting generation job");
        pendingGeneration = await waitForPendingGenerationJob(videoKey, kind, generationID);
        if (!isCurrentGeneration(videoKey, kind, generationID)) {
            return;
        }

        if (activeText(kind)) {
            state.isLoading[kind] = false;
            render();
            return;
        }

        if (pendingGeneration?.jobId) {
            jobID = pendingGeneration.jobId;
            generationStartedAt = pendingGeneration.createdAt || generationStartedAt;
            logDebug(kind, `requestId: ${jobID}`);
            logDebug(kind, "step: reusing already running generation job");
        }
    }

    if (!jobID) {
        rememberPendingGenerationStart(videoKey, kind, generationTimeoutMs);

        const startResponse = await sendMessageWithTimeout({
            type: "ai:startGenerate",
            kind: requestKind,
            transcript: requestTranscript,
            transcriptMetadata,
            timeoutMs: generationTimeoutMs,
        }, 20000).catch((error) => {
            logDebug(kind, "step: start request failed", error);
            return {
                ok: false,
                error: error?.message || "The extension could not start the background job.",
                debug: {
                    layer: "content",
                    step: "start-failed",
                    detail: error?.stack || error?.message || String(error),
                },
            };
        });

        if (!isCurrentGeneration(videoKey, kind, generationID)) {
            return;
        }

        if (!startResponse?.ok || !startResponse?.jobId) {
            clearPendingGeneration(videoKey, kind);
            const debugParts = [];
            if (startResponse?.debug?.layer) {
                debugParts.push(`layer: ${startResponse.debug.layer}`);
            }
            if (startResponse?.debug?.step) {
                debugParts.push(`step: ${startResponse.debug.step}`);
            }
            if (startResponse?.debug?.detail) {
                debugParts.push(`detail: ${startResponse.debug.detail}`);
            }
            if (typeof startResponse !== "undefined") {
                try {
                    debugParts.push(`raw: ${JSON.stringify(startResponse)}`);
                } catch (_) {
                    debugParts.push(`raw: ${String(startResponse)}`);
                }
            }
            if (debugParts.length > 0) {
                logDebug(kind, debugParts.join("\n"));
            }
            state.isLoading[kind] = false;
            state.errors[kind] = startResponse?.error || "The extension could not start the generation job.";
            render();
            await refreshStatus();
            return;
        }

        jobID = startResponse.jobId;
        rememberPendingGenerationJob(videoKey, kind, jobID, generationTimeoutMs);
        logDebug(kind, `requestId: ${jobID}`);
    }

    logDebug(kind, generationWaitDescription(kind, usesSelectedProvider));
    render();

    const response = await pollGenerationJob(kind, videoKey, generationID, jobID, generationTimeoutMs);
    if (response?.stale) {
        return;
    }

    if (!isCurrentGeneration(videoKey, kind, generationID)) {
        return;
    }

    state.isLoading[kind] = false;

    if (!response?.ok) {
        clearPendingGeneration(videoKey, kind, jobID);
        const debugParts = [];
        if (response?.debug?.layer) {
            debugParts.push(`layer: ${response.debug.layer}`);
        }
        if (response?.debug?.action) {
            debugParts.push(`action: ${response.debug.action}`);
        }
        if (response?.debug?.step) {
            debugParts.push(`step: ${response.debug.step}`);
        }
        if (response?.debug?.durationMs) {
            debugParts.push(`duration: ${response.debug.durationMs}ms`);
        }
        if (response?.debug?.detail) {
            debugParts.push(`detail: ${response.debug.detail}`);
        }
        if (response?.debug?.native?.detail) {
            debugParts.push(`native: ${response.debug.native.detail}`);
        }
        if (debugParts.length > 0) {
            logDebug(kind, debugParts.join("\n"));
        }
        state.errors[kind] = response?.error || "The extension did not receive a usable generation response.";
        render();
        await refreshStatus();
        return;
    }

    logDebug(kind, "step: generation response received");
    const engineLabel = responseEngineLabel(kind, response);
    const cachedResult = cachedGenerationResult(videoKey, kind);
    if (cachedResult?.text) {
        applyGenerationText(kind, cachedResult.text, cachedResult);
        if (!cachedResult.durationMs) {
            rememberGenerationDuration(kind, generationStartedAt);
        }
        clearPendingGeneration(videoKey, kind, jobID);
        render();
        return;
    }

    if (activeText(kind)) {
        if (!state.generationEngineLabels[kind]) {
            rememberGenerationEngineLabel(kind, engineLabel);
        }
        rememberGenerationDuration(kind, generationStartedAt);
        clearPendingGeneration(videoKey, kind, jobID);
        render();
        return;
    }

    if (!applyGenerationText(kind, response.text, { engineLabel })) {
        clearPendingGeneration(videoKey, kind, jobID);
        state.errors[kind] = unavailableMessage(kind);
        render();
        return;
    }

    rememberGenerationDuration(kind, generationStartedAt);
    rememberGeneratedText(videoKey, kind, activeText(kind), {
        engineLabel: state.generationEngineLabels[kind] || engineLabel,
        durationMs: state.generationDurationsMs[kind],
    });
    clearPendingGeneration(videoKey, kind, jobID);
    render();
    return;
}

function parseTimestamps(text) {
    return parseTimestampLines(text);
}

function buildTimestampHref(seconds) {
    const url = new URL(window.location.href);
    url.searchParams.set("t", `${Math.max(0, Math.floor(seconds))}s`);
    return url.toString();
}

function updateVideoURL(seconds) {
    const url = new URL(window.location.href);
    url.searchParams.set("t", `${Math.max(0, Math.floor(seconds))}s`);
    window.history.replaceState(window.history.state, "", url);
}

function jumpToTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const moviePlayer = document.querySelector("#movie_player");
    const video = document.querySelector("video");
    scheduleActiveChapterSync();

    const applyNativeSeek = () => {
        if (!video) {
            return;
        }

        const seekVideo = () => {
            try {
                video.currentTime = safeSeconds;
                scheduleActiveChapterSync();
            } catch (_) {
                // Ignore transient media seek errors and fall back to the URL jump below if needed.
            }
        };

        if (video.readyState >= 1) {
            seekVideo();
        } else {
            video.addEventListener("loadedmetadata", seekVideo, { once: true });
        }
    };

    if (moviePlayer && typeof moviePlayer.seekTo === "function") {
        moviePlayer.seekTo(safeSeconds, true);
        applyNativeSeek();
        if (typeof moviePlayer.playVideo === "function") {
            moviePlayer.playVideo();
        }
        if (video) {
            window.setTimeout(() => {
                if (Math.abs(video.currentTime - safeSeconds) > 1) {
                    applyNativeSeek();
                }
                video.play().catch(() => {});
            }, 80);
        }
        updateVideoURL(safeSeconds);
        return;
    }

    if (video) {
        applyNativeSeek();
        updateVideoURL(safeSeconds);
        window.setTimeout(() => {
            if (Math.abs(video.currentTime - safeSeconds) > 1) {
                applyNativeSeek();
            }
            video.play().catch(() => {});
        }, 80);
        return;
    }

    window.location.assign(buildTimestampHref(safeSeconds));
}

function buildPanel() {
    nativePanel.syncTabs();

    const mount = getPanelMount();
    if (!mount) {
        return;
    }

    panelHost = dedupePanelHosts(panelHost);
    if (panelHost) {
        if (!isPanelPlaced(mount)) {
            placePanelHost(mount);
        }
        render();
        return;
    }

    panelHost = document.createElement("div");
    panelHost.id = SIDEBAR_HOST_ID;
    panelHost.attachShadow({ mode: "open" });
    placePanelHost(mount);
    render();
}

async function reconcilePanel() {
    if (!isWatchPage()) {
        cleanupNonWatchPage();
        return;
    }

    const nextVideoKey = getVideoKey();
    let needsRender = false;
    if (currentVideoKey !== nextVideoKey) {
        currentVideoKey = nextVideoKey;
        beginVideoDiscovery(nextVideoKey);
        initialPlayerResponseCache = {
            videoKey: "",
            response: null,
        };
        initialDataCache = {
            videoKey: "",
            response: null,
        };
        resetPanelState();
        removePanel({ preserveNativeControls: true });
        needsRender = true;
    }

    syncActiveChapterTracker();
    if (applyNativeChaptersIfAvailable(nextVideoKey)) {
        needsRender = true;
    }
    nativePanel.syncTabs();

    const mount = getPanelMount();
    if (!mount) {
        if (!transcriptOrchestrator.hasAvailableTranscript(nextVideoKey)) {
            removeStandalonePanels();
        }
        autogenerateAnalysisInBackground();
        return;
    }

    panelHost = dedupePanelHosts(panelHost);

    if (!panelHost || !panelHost.isConnected) {
        panelHost = null;
        buildPanel();
        autogenerateAnalysisInBackground();
        return;
    }

    if (!isPanelPlaced(mount)) {
        placePanelHost(mount);
        needsRender = true;
    } else if (mount.type === "native") {
        nativePanel.syncTabs(mount.nativeMount);
    }

    if (needsRender) {
        render();
    }

    autogenerateAnalysisInBackground();
}

async function ensurePanel() {
    if (panelReconciliationInProgress) {
        panelReconciliationQueued = true;
        return;
    }

    panelReconciliationInProgress = true;
    try {
        await reconcilePanel();
    } finally {
        panelReconciliationInProgress = false;
        if (panelReconciliationQueued) {
            panelReconciliationQueued = false;
            scheduleNativePanelRefresh();
        }
    }
}

function nativePanelMutationNode(node) {
    if (
        !node
        || node === panelHost
        || panelHost?.contains(node)
        || globalThis.YouTubeTimestampsPageControls.isExtensionOwnedNativeControlNode(node)
    ) {
        return false;
    }

    const isElement = node.nodeType === Node.ELEMENT_NODE;
    if (!isElement) {
        return false;
    }

    return node.matches?.("ytd-engagement-panel-section-list-renderer")
        || Boolean(node.closest?.("ytd-engagement-panel-section-list-renderer"))
        || Boolean(node.querySelector?.("ytd-engagement-panel-section-list-renderer"));
}

function nativePanelMutationAffectsMount(record) {
    if (globalThis.YouTubeTimestampsPageControls.isExtensionOwnedNativeControlNode(record.target)) {
        return false;
    }

    if (nativePanelMutationNode(record.target)) {
        return true;
    }

    return Array.from(record.addedNodes || []).some(nativePanelMutationNode)
        || Array.from(record.removedNodes || []).some(nativePanelMutationNode);
}

function scheduleNativePanelRefresh() {
    if (
        nativePanelRefreshFrame !== null
        || !isWatchPage()
        || navigationTransition.shouldHoldUI()
    ) {
        return;
    }

    nativePanelRefreshFrame = requestAnimationFrame(() => {
        nativePanelRefreshFrame = null;
        void ensurePanel();
    });
}

function startNativePanelObserver() {
    if (nativePanelObserver || typeof MutationObserver !== "function") {
        return;
    }

    nativePanelObserver = new MutationObserver((records) => {
        if (navigationTransition.shouldHoldUI()) {
            return;
        }
        if (records.some(nativePanelMutationAffectsMount)) {
            // YouTube's Transcript/Timeline chips can appear before the rest
            // of the new video shell. Inject our sibling chips immediately;
            // placement/render reconciliation can follow on the next frame.
            nativePanel.syncTabs();
            scheduleNativePanelRefresh();
        }
    });
    nativePanelObserver.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["hidden", "visibility"],
    });
}

function stopNativePanelObserver() {
    nativePanelObserver?.disconnect();
    nativePanelObserver = null;
    if (nativePanelRefreshFrame !== null) {
        cancelAnimationFrame(nativePanelRefreshFrame);
        nativePanelRefreshFrame = null;
    }
}

async function handleForegroundRefresh() {
    if (isWatchPage()) {
        startNativePanelObserver();
        await ensurePanel();
        refreshStatusInBackground();
        return;
    }

    if (panelHost || currentVideoKey !== null) {
        await ensurePanel();
    }
}

function rememberNavigationData(event) {
    const response = getNavigationResponse(event);
    const activeVideoKey = getVideoKey();
    if (!response || !activeVideoKey || !isWatchPage()) {
        return false;
    }

    const responseVideoKey = getNavigationResponseVideoKey(response);
    if (responseVideoKey && responseVideoKey !== activeVideoKey) {
        return false;
    }

    navigationDataCache = {
        videoKey: activeVideoKey,
        response,
    };
    return true;
}

async function handleNavigationChange(event) {
    navigationTransition.complete();
    rememberNavigationData(event);
    lastObservedURL = window.location.href;

    const destinationVideoKey = isWatchPage() ? getVideoKey() : "";
    const watchToWatchNavigation = Boolean(
        currentVideoKey
        && destinationVideoKey
        && currentVideoKey !== destinationVideoKey
    );

    if (isWatchPage()) {
        startNativePanelObserver();
        // Restore extension-owned chrome immediately if YouTube has already
        // replaced the tab row, but let the new shell settle before resetting
        // and rebuilding the result host for a different video.
        nativePanel.syncTabs();
        scheduleNavigationReconciliation(lastObservedURL);
    }
    if (!watchToWatchNavigation) {
        await ensurePanel();
    }

    if (isWatchPage()) {
        refreshStatusInBackground();
    }
}

function handleNavigationStart(event) {
    const nextURL = getNavigationURL(event);
    navigationTransition.begin();
    clearNavigationReconcileTimeouts();

    if (nextURL && isShortsURL(nextURL)) {
        window.location.assign(new URL(nextURL, window.location.origin).toString());
    }

    // Navigation start is intentionally non-destructive. YouTube fires it
    // while the outgoing page is still visible, and its URL can be empty in
    // Safari. The finish event owns cleanup/reset so tabs do not disappear or
    // rebuild before the destination surface is committed.
}

function handlePageDataUpdated(event) {
    if (!rememberNavigationData(event) || !isWatchPage()) {
        return;
    }

    scheduleNativePanelRefresh();
}

function checkForNavigationURLChange() {
    if (window.location.href === lastObservedURL) {
        return;
    }

    // YouTube often mutates the URL before publishing yt-navigate-finish.
    // Keep that fallback from racing the normal lifecycle; the bounded grace
    // still recovers if Safari misses the finish event altogether.
    if (navigationTransition.shouldHoldUI()) {
        return;
    }

    void handleNavigationChange();
}

async function init() {
    if (state.ready) {
        return;
    }

    state.ready = true;
    lastObservedURL = window.location.href;

    if (isWatchPage()) {
        startNativePanelObserver();
    }
    window.addEventListener("focus", handleForegroundRefresh);
    window.addEventListener("resize", () => nativePanel.syncBodyViewport());
    window.addEventListener("popstate", handleNavigationChange);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            handleForegroundRefresh();
        }
    });
    document.addEventListener("yt-navigate-start", handleNavigationStart);
    document.addEventListener("yt-navigate-finish", handleNavigationChange);
    document.addEventListener("yt-page-data-updated", handlePageDataUpdated);
    window.setInterval(checkForNavigationURLChange, NAVIGATION_URL_CHECK_INTERVAL_MS);

    await ensurePanel();
    if (isWatchPage()) {
        refreshStatusInBackground();
    }
}

init();
})();
