(() => {
const {
    extractVideoKey,
    getNavigationURL,
    isShortsURL,
    isWatchURL,
    parseTimestamps: parseTimestampLines,
} = globalThis.YouTubeTimestampsHelpers;

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
const DEBUG_LINE_LIMIT = 80;
const MIN_GENERATION_TIMEOUT_MS = 6 * 60 * 1000;
const MAX_GENERATION_TIMEOUT_MS = 20 * 60 * 1000;
const GENERATION_TIMEOUT_FREE_CHARACTERS = 30000;
const GENERATION_TIMEOUT_CHARACTER_BLOCK = 10000;
const GENERATION_TIMEOUT_EXTRA_MS_PER_BLOCK = 45 * 1000;
const PENDING_GENERATION_START_GRACE_MS = 30000;
const TRANSCRIPT_CACHE_LIMIT = 5;
const TRANSCRIPT_TRACK_WAIT_ATTEMPTS = 16;
const SHOW_GENERATION_TIMING_IN_TABS = true;
const transcriptCache = new Map();
const timedTextTrackCache = new Map();
const innertubePlayerTrackCache = new Map();
const generationRequestKeys = new Set();
const generationResultCache = new Map();
let initialPlayerResponseCache = {
    videoKey: "",
    response: null,
};
let initialDataCache = {
    videoKey: "",
    response: null,
};
let ytcfgCache = null;
let state = {
    ready: false,
    isConfigured: false,
    generationMode: "selectedProvider",
    engine: "",
    appleIntelligenceAvailable: false,
    codexConnected: false,
    codexLoginError: "",
    settings: {
        providerID: "openaiCodex",
        modelID: "gpt-5.5",
        summaryEngine: "selectedModel",
    },
    activeTab: "timestamps",
    timestampsText: "",
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
    copyFeedback: {
        timestamps: false,
        summary: false,
    },
    didAutogenerateAnalysis: false,
};

let copyFeedbackTimeout = null;

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

function generationTimeoutForTranscript(transcriptText) {
    const characterCount = typeof transcriptText === "string" ? transcriptText.length : 0;
    const extraCharacters = Math.max(0, characterCount - GENERATION_TIMEOUT_FREE_CHARACTERS);
    const extraBlocks = Math.ceil(extraCharacters / GENERATION_TIMEOUT_CHARACTER_BLOCK);
    const timeoutMs = MIN_GENERATION_TIMEOUT_MS + (extraBlocks * GENERATION_TIMEOUT_EXTRA_MS_PER_BLOCK);

    return Math.min(MAX_GENERATION_TIMEOUT_MS, Math.max(MIN_GENERATION_TIMEOUT_MS, timeoutMs));
}

function modelLabel() {
    return state.settings.modelLabel || state.settings.modelID || "selected model";
}

function summaryEngineLabel() {
    return state.settings.summaryEngineLabel
        || (state.settings.summaryEngine === "selectedModel" ? modelLabel() : "Apple Intelligence");
}

function generationKindForTab(kind, usesSelectedProvider) {
    if (!usesSelectedProvider) {
        return kind === "summary" ? "summaryFull" : "timestamps";
    }

    return kind === "summary" ? "codexSummary" : "codexTimestamps";
}

function generationResultCacheKey(videoKey, kind) {
    const providerID = state.settings.providerID || "provider";
    const modelID = state.settings.modelID || "model";
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

function pendingGenerationCacheKey(videoKey, kind) {
    return `${generationResultCacheKey(videoKey, kind)}:pending`;
}

function cachedGenerationText(videoKey, kind) {
    const key = generationResultCacheKey(videoKey, kind);
    const inMemory = generationResultCache.get(key);
    if (inMemory) {
        return inMemory;
    }

    try {
        const stored = window.sessionStorage?.getItem(key) || "";
        if (stored) {
            generationResultCache.set(key, stored);
        }
        return stored;
    } catch (_) {
        return "";
    }
}

function rememberGeneratedText(videoKey, kind, text) {
    const generatedText = String(text || "").trim();
    if (!videoKey || !generatedText) {
        return;
    }

    const key = generationResultCacheKey(videoKey, kind);
    generationResultCache.set(key, generatedText);

    try {
        window.sessionStorage?.setItem(key, generatedText);
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
    return `${seconds} s`;
}

function rememberGenerationDuration(kind, startedAt) {
    if (!SHOW_GENERATION_TIMING_IN_TABS || !startedAt) {
        return;
    }

    state.generationDurationsMs[kind] = Math.max(0, Date.now() - startedAt);
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

function stripTranscriptTimestamps(transcriptText) {
    return String(transcriptText || "")
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/, "").trim())
        .filter(Boolean)
        .join("\n");
}

function transcriptForGeneration(kind, transcriptText) {
    if (kind !== "summary") {
        return transcriptText || "";
    }

    return stripTranscriptTimestamps(transcriptText);
}

function isCurrentGeneration(videoKey, kind, generationID) {
    return currentVideoKey === videoKey && state.generationIDs[kind] === generationID;
}

function stopLoadingForStaleGeneration(videoKey, kind, generationID) {
    if (state.generationIDs[kind] !== generationID) {
        return;
    }

    state.isLoading[kind] = false;
    if (currentVideoKey === videoKey) {
        render();
    }
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

    const response = parseScriptAssignmentObject("ytInitialData");
    const responseVideoKey = extractVideoKey({
        currentUrl: window.location.href,
        canonicalHref: document.querySelector("link[rel='canonical']")?.href || "",
        ogUrl: document.querySelector("meta[property='og:url']")?.content || "",
        pathname: window.location.pathname,
    });
    initialDataCache = {
        videoKey,
        response: !responseVideoKey || responseVideoKey === videoKey ? response : null,
    };

    return initialDataCache.response;
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

function selectCaptionTrack(tracks) {
    return rankCaptionTracks(tracks)[0] || null;
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
            lastError = `Transcript request failed with ${response.status}.`;
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

function rememberTranscript(videoKey, transcript) {
    if (!videoKey || !transcript?.text) {
        return;
    }

    transcriptCache.delete(videoKey);
    transcriptCache.set(videoKey, transcript);

    while (transcriptCache.size > TRANSCRIPT_CACHE_LIMIT) {
        const oldestKey = transcriptCache.keys().next().value;
        transcriptCache.delete(oldestKey);
    }
}

function applyGenerationText(kind, text) {
    const generatedText = String(text || "").trim();
    if (!generatedText) {
        return false;
    }

    if (kind === "summary") {
        state.summaryText = generatedText;
        state.errors.summary = "";
        return true;
    }

    if (parseTimestamps(generatedText).length === 0) {
        return false;
    }

    state.timestampsText = generatedText;
    state.errors.timestamps = "";
    return true;
}

function restoreCachedGenerationText(videoKey, kind) {
    const cachedText = cachedGenerationText(videoKey, kind);
    if (!cachedText || activeText(kind)) {
        return false;
    }

    return applyGenerationText(kind, cachedText);
}

async function tryTranscriptTracks(videoKey, kind, source, tracks) {
    let lastError = "";
    for (const track of rankCaptionTracks(tracks)) {
        logDebug(kind, `transcript: fetching ${source} captions (${trackLabel(track)})`);
        try {
            const transcript = await fetchTranscript(track);
            rememberTranscript(videoKey, transcript);
            logDebug(kind, `transcript: ready (${transcript.lineCount} lines)`);
            if (transcript.languageCode || transcript.languageLabel) {
                logDebug(kind, `transcript: language ${transcript.languageLabel || transcript.languageCode}${transcript.languageCode ? ` (${transcript.languageCode})` : ""}`);
            }
            return {
                transcript,
                error: "",
            };
        } catch (error) {
            lastError = error?.message || String(error);
            logDebug(kind, `transcript: track failed (${trackLabel(track)})`);
        }
    }

    return {
        transcript: null,
        error: lastError,
    };
}

async function getTranscript(videoKey, kind) {
    if (transcriptCache.has(videoKey)) {
        const cachedTranscript = transcriptCache.get(videoKey);
        logDebug(kind, `transcript: using cached captions (${cachedTranscript.lineCount} lines)`);
        if (cachedTranscript.languageCode || cachedTranscript.languageLabel) {
            logDebug(kind, `transcript: language ${cachedTranscript.languageLabel || cachedTranscript.languageCode}${cachedTranscript.languageCode ? ` (${cachedTranscript.languageCode})` : ""}`);
        }
        return cachedTranscript;
    }

    for (let attempt = 0; attempt < TRANSCRIPT_TRACK_WAIT_ATTEMPTS; attempt += 1) {
        const { source, tracks, error } = await getCaptionTracks(videoKey);
        if (tracks.length > 0) {
            let lastError = "";
            const pageResult = await tryTranscriptTracks(videoKey, kind, source, tracks);
            if (pageResult.transcript) {
                return pageResult.transcript;
            }
            lastError = pageResult.error;

            logDebug(kind, "transcript: trying YouTube player captions");
            try {
                const playerTracks = await fetchInnertubePlayerTracks(videoKey);
                const playerResult = await tryTranscriptTracks(videoKey, kind, "YouTube player", playerTracks);
                if (playerResult.transcript) {
                    return playerResult.transcript;
                }
                lastError = playerResult.error || lastError;
            } catch (error) {
                lastError = error?.message || String(error);
                logDebug(kind, `transcript: player fallback failed (${lastError})`);
            }

            logDebug(kind, "transcript: trying YouTube transcript panel");
            try {
                const transcript = await fetchInnertubeTranscript(videoKey);
                rememberTranscript(videoKey, transcript);
                logDebug(kind, `transcript: ready (${transcript.lineCount} lines)`);
                return transcript;
            } catch (error) {
                lastError = error?.message || String(error);
                logDebug(kind, `transcript: panel fallback failed (${lastError})`);
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
            logDebug(kind, "transcript: waiting for YouTube captions");
            if (error) {
                logDebug(kind, `transcript: timed-text fallback unavailable (${error})`);
            }
        }
        await sleep(750);
    }

    logDebug(kind, "transcript: trying YouTube player captions");
    try {
        const playerTracks = await fetchInnertubePlayerTracks(videoKey);
        const playerResult = await tryTranscriptTracks(videoKey, kind, "YouTube player", playerTracks);
        if (playerResult.transcript) {
            return playerResult.transcript;
        }
        if (playerResult.error) {
            logDebug(kind, `transcript: player fallback failed (${playerResult.error})`);
        }
    } catch (error) {
        logDebug(kind, `transcript: player fallback failed (${error?.message || String(error)})`);
    }

    logDebug(kind, "transcript: trying YouTube transcript panel");
    try {
        const transcript = await fetchInnertubeTranscript(videoKey);
        rememberTranscript(videoKey, transcript);
        logDebug(kind, `transcript: ready (${transcript.lineCount} lines)`);
        return transcript;
    } catch (error) {
        logDebug(kind, `transcript: panel fallback failed (${error?.message || String(error)})`);
    }

    logDebug(kind, "transcript: unavailable");
    return null;
}

function unavailableMessage(kind) {
    return kind === "timestamps"
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

function isPanelBeforeElement(element) {
    if (!panelHost || !element) {
        return false;
    }

    return Boolean(panelHost.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function isPanelPlaced(target) {
    if (!panelHost) {
        return false;
    }

    const liveChat = getLiveChatBlock();
    if (liveChat?.parentElement) {
        return liveChat.parentElement.contains(panelHost)
            && isPanelBeforeElement(liveChat);
    }

    return target.contains(panelHost);
}

function placePanelHost(target) {
    if (!panelHost) {
        return;
    }

    const liveChat = getLiveChatBlock();
    if (liveChat?.parentElement) {
        liveChat.parentElement.insertBefore(panelHost, liveChat);
        return;
    }

    target.prepend(panelHost);
}

function removePanel() {
    panelHost?.remove();
    for (const host of getPanelHosts()) {
        host.remove();
    }
    panelHost = null;
}

function resetPanelState() {
    state.activeTab = "timestamps";
    state.timestampsText = "";
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
    state.generationIDs = {
        timestamps: 0,
        summary: 0,
    };
    state.generationDurationsMs = {
        timestamps: 0,
        summary: 0,
    };
    state.copyFeedback = {
        timestamps: false,
        summary: false,
    };
    state.didAutogenerateAnalysis = false;
}

function cleanupNonWatchPage() {
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

function buttonLabel(kind) {
    if (state.isLoading[kind]) {
        return kind === "timestamps" ? "Timestamps..." : "Summary...";
    }

    const baseLabel = kind === "timestamps" ? "Timestamps" : "Summary";
    const durationMs = state.generationDurationsMs[kind];
    if (SHOW_GENERATION_TIMING_IN_TABS && durationMs > 0) {
        return `${baseLabel} (${formatGenerationDuration(durationMs)})`;
    }

    return baseLabel;
}

function activeText(kind) {
    return kind === "timestamps" ? state.timestampsText : state.summaryText;
}

function activeError(kind) {
    return kind === "timestamps" ? state.errors.timestamps : state.errors.summary;
}

function copiedAttribution(kind) {
    return kind === "timestamps"
        ? "Timestamps created with Timestamps & Summaries for YT, a free Safari extension."
        : "Summary created with Timestamps & Summaries for YT, a free Safari extension.";
}

function copyText(kind) {
    const text = activeText(kind).trim();
    if (!text) {
        return "";
    }

    return `${copiedAttribution(kind)}\n\n${text}`;
}

function hasCopyText(kind) {
    return copyText(kind).length > 0;
}

function copyButtonLabel(kind) {
    if (state.copyFeedback[kind]) {
        return kind === "timestamps" ? "Copied timestamps" : "Copied summary";
    }

    return kind === "timestamps" ? "Copy timestamps" : "Copy summary";
}

function copyIcon() {
    return `
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
            <path d="M8 7.5A2.5 2.5 0 0 1 10.5 5H17a2.5 2.5 0 0 1 2.5 2.5V14a2.5 2.5 0 0 1-2.5 2.5h-6.5A2.5 2.5 0 0 1 8 14V7.5Zm2.5-.5A.5.5 0 0 0 10 7.5V14a.5.5 0 0 0 .5.5H17a.5.5 0 0 0 .5-.5V7.5A.5.5 0 0 0 17 7h-6.5Z"></path>
            <path d="M4.5 10A2.5 2.5 0 0 1 7 7.5v2A.5.5 0 0 0 6.5 10v6.5a.5.5 0 0 0 .5.5h6.5a.5.5 0 0 0 .5-.5h2A2.5 2.5 0 0 1 13.5 19H7a2.5 2.5 0 0 1-2.5-2.5V10Z"></path>
        </svg>
    `;
}

async function writeToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (error) {
            console.debug("[Apple Intelligence content:copy] Clipboard API failed, trying fallback", error);
        }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    document.documentElement.append(textarea);
    textarea.select();
    const didCopy = document.execCommand("copy");
    textarea.remove();

    if (!didCopy) {
        throw new Error("Clipboard copy failed.");
    }
}

async function copyActiveResult() {
    const kind = state.activeTab;
    const text = copyText(kind);
    if (!text) {
        return;
    }

    try {
        await writeToClipboard(text);
        state.copyFeedback = {
            ...state.copyFeedback,
            [kind]: true,
        };
        render();

        if (copyFeedbackTimeout) {
            clearTimeout(copyFeedbackTimeout);
        }
        copyFeedbackTimeout = setTimeout(() => {
            state.copyFeedback = {
                ...state.copyFeedback,
                [kind]: false,
            };
            render();
        }, 1400);
    } catch (error) {
        console.debug("[Apple Intelligence content:copy] Clipboard copy failed", error);
    }
}

function renderConnectionState(message) {
    return `
        <div class="surface state-surface">
            <div class="state-copy">${escapeHTML(message)}</div>
            <button class="soft-button" data-open-app>Open Companion App</button>
        </div>
    `;
}

function renderCodexConnectionState() {
    return `
        <div class="surface state-surface">
            <div class="state-copy">Connect ChatGPT in the companion app to generate timestamps.</div>
            <button class="soft-button" data-open-app>Open Companion App</button>
            ${state.codexLoginError ? `<div class="error-copy">${escapeHTML(state.codexLoginError)}</div>` : ""}
        </div>
    `;
}

function renderLoadingState(kind) {
    const debug = debugSummary(kind);
    return `
        <div class="surface state-surface">
            <div class="state-copy">${kind === "timestamps" ? "Generating timestamps..." : "Generating summary..."}</div>
            ${debug ? `<pre class="debug-copy">${escapeHTML(debug)}</pre>` : ""}
        </div>
    `;
}

function renderEmptyState(kind) {
    return `
        <div class="surface state-surface">
            <div class="state-copy">${
                kind === "timestamps"
                    ? "Timestamps will appear here automatically."
                    : "Summary will appear here automatically."
            }</div>
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

function renderTimestampsResult() {
    if (state.isLoading.timestamps && !state.timestampsText) {
        return renderLoadingState("timestamps");
    }

    if (state.errors.timestamps && !state.timestampsText) {
        return renderErrorState("timestamps", state.errors.timestamps);
    }

    if (!state.timestampsText) {
        return renderEmptyState("timestamps");
    }

    const parsed = parseTimestamps(state.timestampsText);
    if (parsed.length === 0) {
        return `
            <div class="surface result-surface">
                <div class="summary-text">${escapeHTML(state.timestampsText)}</div>
            </div>
        `;
    }

    return `
        <div class="surface result-surface">
            <div class="timestamp-list">
                ${parsed.map((item) => `
                    <a class="timestamp-link" href="${escapeHTML(buildTimestampHref(item.seconds))}" data-seconds="${item.seconds}">
                        <span class="timestamp-time">${escapeHTML(item.time)}</span>
                        <span class="timestamp-label">${escapeHTML(item.label)}</span>
                    </a>
                `).join("")}
            </div>
        </div>
    `;
}

function renderSummaryResult() {
    if (state.isLoading.summary && !state.summaryText) {
        return renderLoadingState("summary");
    }

    if (state.errors.summary && !state.summaryText) {
        return renderErrorState("summary", state.errors.summary);
    }

    if (!state.summaryText) {
        return renderEmptyState("summary");
    }

    return `
        <div class="surface result-surface">
            <div class="summary-rich">${renderSummaryHTML(state.summaryText)}</div>
        </div>
    `;
}

function renderSummaryHTML(text) {
    const lines = String(text ?? "").split(/\r?\n/);
    const blocks = [];
    let paragraph = [];
    let bullets = [];

    function flushParagraph() {
        if (paragraph.length === 0) {
            return;
        }

        blocks.push(`<p>${renderInlineSummary(paragraph.join(" "))}</p>`);
        paragraph = [];
    }

    function flushBullets() {
        if (bullets.length === 0) {
            return;
        }

        blocks.push(`<ul>${bullets.map((item) => `<li>${renderInlineSummary(item)}</li>`).join("")}</ul>`);
        bullets = [];
    }

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            flushParagraph();
            flushBullets();
            continue;
        }

        if (/^(?:part|section)\s+\d+(?:\s+of\s+\d+)?[:.]?$/i.test(line)) {
            flushParagraph();
            flushBullets();
            continue;
        }

        const bulletMatch = line.match(/^[-*]\s+(.+)$/);
        if (bulletMatch) {
            flushParagraph();
            bullets.push(bulletMatch[1]);
            continue;
        }

        flushBullets();
        paragraph.push(line);
    }

    flushParagraph();
    flushBullets();

    if (blocks.length === 0) {
        return `<p>${renderInlineSummary(text)}</p>`;
    }

    return blocks.join("");
}

function renderInlineSummary(value) {
    let text = String(value ?? "").trim();
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
    text = text.replace(/^\s{0,3}#{1,6}\s+/g, "");
    text = text.replace(/\*\*(.+?)\*\*/g, "$1");
    text = text.replace(/\*(.+?)\*/g, "$1");
    text = text.replace(/`(.+?)`/g, "$1");
    text = text.replace(/~~(.+?)~~/g, "$1");
    text = text.replace(/\s+/g, " ");
    return escapeHTML(text);
}

function renderActiveContent() {
    if (!state.codexConnected) {
        return renderCodexConnectionState();
    }

    if (state.settings.summaryEngine === "appleIntelligence" && !state.appleIntelligenceAvailable) {
        return renderConnectionState("Apple Intelligence is not available on this Mac.");
    }

    return state.activeTab === "timestamps" ? renderTimestampsResult() : renderSummaryResult();
}

function captureRenderScrollState(root) {
    const surface = root.querySelector(".body > .surface");
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

    const surface = root.querySelector(".body > .surface");
    if (!surface) {
        return;
    }

    surface.scrollTop = scrollState.scrollTop;
    surface.scrollLeft = scrollState.scrollLeft;
}

function render() {
    if (!panelHost) {
        return;
    }

    const root = panelHost.shadowRoot;
    if (!root) {
        return;
    }

    const scrollState = captureRenderScrollState(root);

    root.innerHTML = `
        <style>
            :host {
                all: initial;
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
                }

                .tab {
                    background: #2f3033;
                    color: #f1f1f1;
                }

                .tab:hover {
                    background: #3a3b3f;
                }

                .tab.active {
                    background: #f1f1f1;
                    color: #0f0f0f;
                }

                .tab.active[aria-busy="true"] {
                    background: #d9d9d9;
                    color: #0f0f0f;
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
                gap: 12px;
                overflow-x: auto;
                scrollbar-width: none;
                min-width: 0;
                flex: 1 1 auto;
            }

            .tabs::-webkit-scrollbar {
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
                background: #f2f2f2;
                color: #0f0f0f;
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

            .copy-button:disabled {
                cursor: default;
                opacity: 0.22;
            }

            .tab:hover {
                background: #e7e7e7;
            }

            .tab.active {
                background: #0f0f0f;
                color: #ffffff;
            }

            .tab[aria-busy="true"] {
                background: #e7e7e7;
                color: #0f0f0f;
            }

            .tab.active[aria-busy="true"] {
                color: #ffffff;
                background: #0f0f0f;
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

            .summary-rich ul {
                padding-left: 18px;
            }

            .summary-rich li + li {
                margin-top: 2px;
            }

        </style>
        <div class="wrap">
            <div class="panel">
                <div class="toolbar">
                    <div class="tabs">
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
                    <button
                        class="copy-button"
                        data-copy-active
                        data-copied="${state.copyFeedback[state.activeTab] ? "true" : "false"}"
                        aria-label="${escapeHTML(copyButtonLabel(state.activeTab))}"
                        title="${escapeHTML(copyButtonLabel(state.activeTab))}"
                        ${hasCopyText(state.activeTab) ? "" : "disabled"}
                    >
                        ${copyIcon()}
                    </button>
                </div>
                <div class="body">
                    ${renderActiveContent()}
                </div>
            </div>
        </div>
    `;

    for (const button of root.querySelectorAll("[data-tab]")) {
        button.addEventListener("click", () => {
            handleTabSelection(button.getAttribute("data-tab") || "timestamps");
        });
    }

    for (const button of root.querySelectorAll("[data-open-app]")) {
        button.addEventListener("click", openCompanionApp);
    }

    for (const button of root.querySelectorAll("[data-copy-active]")) {
        button.addEventListener("click", copyActiveResult);
    }

    for (const link of root.querySelectorAll("[data-seconds]")) {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            jumpToTime(Number(link.getAttribute("data-seconds") || 0));
        });
    }

    restoreRenderScrollState(root, scrollState);
}

async function refreshStatus() {
    const response = await sendMessageWithTimeout({ type: "ai:getStatus" }, 20000).catch((error) => {
        console.debug("[Apple Intelligence content:status] Status refresh failed", error);
        return null;
    });
    state.generationMode = response?.generationMode || state.generationMode;
    state.appleIntelligenceAvailable = Boolean(response?.appleIntelligence?.isConfigured ?? response?.isConfigured);
    state.codexConnected = Boolean(response?.codex?.connected);
    state.settings = {
        ...state.settings,
        ...(response?.settings || {}),
    };
    state.isConfigured = Boolean(response?.isConfigured);
    state.engine = response?.engine || state.engine;
    if (state.codexConnected) {
        state.codexLoginError = "";
    } else if (response?.codex?.error) {
        state.codexLoginError = response.codex.error;
    }
    render();
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
    render();

    if (kind === "timestamps") {
        await maybeGenerateTimestamps();
    } else {
        await maybeGenerateSummary();
    }
}

async function maybeGenerateTimestamps() {
    if (!state.isConfigured || state.timestampsText) {
        return;
    }

    await requestGeneration("timestamps");
}

async function maybeGenerateSummary() {
    if (!state.isConfigured || state.summaryText) {
        return;
    }

    await requestGeneration("summary");
}

async function maybeAutogenerateAnalysis() {
    if (
        !isWatchPage()
        || !panelHost
        || !panelHost.isConnected
        || document.hidden
        || !state.isConfigured
        || state.didAutogenerateAnalysis
        || (state.timestampsText && state.summaryText)
    ) {
        return;
    }

    state.didAutogenerateAnalysis = true;
    await Promise.all([
        requestGeneration("timestamps"),
        requestGeneration("summary"),
    ]);
}

async function waitForPendingGenerationJob(videoKey, kind, generationID) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < PENDING_GENERATION_START_GRACE_MS) {
        if (!isCurrentGeneration(videoKey, kind, generationID)) {
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
    const deadline = Date.now() + generationTimeoutMs;
    const startedAt = Date.now();
    let lastWaitNoticeAt = startedAt;
    let response = null;

    while (Date.now() < deadline) {
        const pollResponse = await sendMessageWithTimeout({
            type: "ai:getGenerateJob",
            jobId: jobID,
        }, 20000).catch((error) => ({
            ok: false,
            error: error?.message || "Polling the background job failed.",
            debug: {
                layer: "content",
                step: "poll-failed",
                detail: error?.stack || error?.message || String(error),
            },
        }));

        if (!isCurrentGeneration(videoKey, kind, generationID)) {
            return {
                stale: true,
            };
        }

        if (pollResponse?.debug?.messages) {
            if (mergeDebugLines(kind, pollResponse.debug.messages)) {
                render();
            }
        }

        if (!pollResponse?.ok) {
            response = pollResponse;
            break;
        }

        if (pollResponse.status === "completed") {
            response = {
                ok: true,
                text: pollResponse.text,
                debug: pollResponse.debug,
            };
            break;
        }

        if (pollResponse.status === "failed") {
            response = {
                ok: false,
                error: pollResponse.error,
                debug: pollResponse.debug,
            };
            break;
        }

        if (Date.now() - lastWaitNoticeAt >= 5000) {
            lastWaitNoticeAt = Date.now();
            logDebug(kind, `waiting: ${Math.round((Date.now() - startedAt) / 1000)}s`);
            render();
        }

        await sleep(1000);
    }

    return response || {
        ok: false,
        error: kind === "summary"
            ? `Timed out waiting for ${summaryEngineLabel()} summary.`
            : `Timed out waiting for ${modelLabel()} timestamps.`,
        debug: {
            layer: "content",
            step: "poll-timeout",
            detail: `jobId=${jobID}`,
        },
    };
}

async function requestGeneration(kind) {
    if (!state.isConfigured || state.isLoading[kind] || activeText(kind)) {
        return;
    }

    const videoKey = currentVideoKey || getVideoKey() || "";
    if (restoreCachedGenerationText(videoKey, kind)) {
        render();
        return;
    }

    const requestKey = `${videoKey}:${kind}`;
    if (generationRequestKeys.has(requestKey)) {
        return;
    }

    generationRequestKeys.add(requestKey);
    try {
        await generate(kind);
    } finally {
        generationRequestKeys.delete(requestKey);
    }
}

async function generate(kind) {
    if (!state.isConfigured || state.isLoading[kind]) {
        return;
    }

    const videoKey = getVideoKey();
    if (!videoKey) {
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
    state.generationIDs[kind] += 1;
    const generationID = state.generationIDs[kind];
    let generationStartedAt = Date.now();
    logDebug(kind, `started: ${new Date().toLocaleTimeString()}`);
    logDebug(kind, "video: supported YouTube video detected");
    render();

    const transcript = await getTranscript(videoKey, kind).catch((error) => {
        logDebug(kind, `transcript: failed (${error?.message || String(error)})`);
        return null;
    });
    if (!isCurrentGeneration(videoKey, kind, generationID)) {
        stopLoadingForStaleGeneration(videoKey, kind, generationID);
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
            stopLoadingForStaleGeneration(videoKey, kind, generationID);
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
            stopLoadingForStaleGeneration(videoKey, kind, generationID);
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
        stopLoadingForStaleGeneration(videoKey, kind, generationID);
        return;
    }

    if (!isCurrentGeneration(videoKey, kind, generationID)) {
        stopLoadingForStaleGeneration(videoKey, kind, generationID);
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
    const cachedText = cachedGenerationText(videoKey, kind);
    if (cachedText) {
        applyGenerationText(kind, cachedText);
        rememberGenerationDuration(kind, generationStartedAt);
        clearPendingGeneration(videoKey, kind, jobID);
        render();
        return;
    }

    if (activeText(kind)) {
        rememberGenerationDuration(kind, generationStartedAt);
        clearPendingGeneration(videoKey, kind, jobID);
        render();
        return;
    }

    if (!applyGenerationText(kind, response.text)) {
        clearPendingGeneration(videoKey, kind, jobID);
        state.errors[kind] = unavailableMessage(kind);
        render();
        return;
    }

    rememberGeneratedText(videoKey, kind, activeText(kind));
    rememberGenerationDuration(kind, generationStartedAt);
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

    const applyNativeSeek = () => {
        if (!video) {
            return;
        }

        const seekVideo = () => {
            try {
                video.currentTime = safeSeconds;
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

async function buildPanel() {
    const target = getSidebarTarget();
    if (!target) {
        return;
    }

    panelHost = dedupePanelHosts(panelHost);
    if (panelHost) {
        if (!isPanelPlaced(target)) {
            placePanelHost(target);
        }
        render();
        return;
    }

    panelHost = document.createElement("div");
    panelHost.id = SIDEBAR_HOST_ID;
    panelHost.attachShadow({ mode: "open" });
    placePanelHost(target);
    render();
}

async function ensurePanel() {
    if (!isWatchPage()) {
        cleanupNonWatchPage();
        return;
    }

    const target = getSidebarTarget();
    if (!target) {
        return;
    }

    panelHost = dedupePanelHosts(panelHost);

    const nextVideoKey = getVideoKey();
    let needsRender = false;
    if (currentVideoKey !== nextVideoKey) {
        currentVideoKey = nextVideoKey;
        resetPanelState();
        needsRender = true;
    }

    if (!panelHost || !panelHost.isConnected) {
        panelHost = null;
        await buildPanel();
        await maybeAutogenerateAnalysis();
        return;
    }

    if (!isPanelPlaced(target)) {
        placePanelHost(target);
        needsRender = true;
    }

    if (needsRender) {
        render();
    }

    await maybeAutogenerateAnalysis();
}

async function handleForegroundRefresh() {
    if (isWatchPage()) {
        await ensurePanel();
        refreshStatusInBackground();
        return;
    }

    if (panelHost || currentVideoKey !== null) {
        await ensurePanel();
    }
}

async function handleNavigationChange() {
    lastObservedURL = window.location.href;

    await ensurePanel();

    if (isWatchPage()) {
        refreshStatusInBackground();
    }
}

function handleNavigationStart(event) {
    const nextURL = getNavigationURL(event);
    if (nextURL && isShortsURL(nextURL)) {
        cleanupNonWatchPage();
        window.location.assign(new URL(nextURL, window.location.origin).toString());
        return;
    }

    if (nextURL) {
        lastObservedURL = new URL(nextURL, window.location.origin).toString();
    } else {
        lastObservedURL = window.location.href;
    }

    if (!nextURL || !isWatchURL(nextURL)) {
        cleanupNonWatchPage();
    }
}

async function heartbeat() {
    const currentURL = window.location.href;
    const urlChanged = currentURL !== lastObservedURL;
    if (urlChanged) {
        lastObservedURL = currentURL;
    }

    if (urlChanged && isWatchPage()) {
        await refreshStatus();
        await ensurePanel();
        return;
    }

    if (isWatchPage() || panelHost || currentVideoKey !== null) {
        await ensurePanel();
    }
}

async function init() {
    if (state.ready) {
        return;
    }

    state.ready = true;
    lastObservedURL = window.location.href;

    window.addEventListener("focus", handleForegroundRefresh);
    window.addEventListener("popstate", handleNavigationChange);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            handleForegroundRefresh();
        }
    });
    document.addEventListener("yt-navigate-start", handleNavigationStart);
    document.addEventListener("yt-navigate-finish", handleNavigationChange);

    setInterval(heartbeat, 1000);

    await ensurePanel();
    if (isWatchPage()) {
        refreshStatusInBackground();
    }
}

init();
})();
