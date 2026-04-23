(() => {
const {
    buildCanonicalVideoURL,
    extractVideoKey,
    getNavigationURL,
    isShortsURL,
    isWatchURL,
    looksLikeInputRequest,
    parseTimestamps: parseTimestampLines,
} = globalThis.GeminiYouTubeHelpers;

const supportedPath = window.location.pathname === "/watch"
    || window.location.pathname.startsWith("/live/");

if (!supportedPath) {
    for (const host of document.querySelectorAll("#gemini-youtube-sidebar-root")) {
        host.remove();
    }
    return;
}

let panelHost = null;
let currentVideoKey = null;
let lastObservedURL = window.location.href;
const DEBUG_LINE_LIMIT = 80;
const GENERATION_TIMEOUT_MS = 360000;
let state = {
    ready: false,
    isConfigured: false,
    isSignedIn: false,
    model: "",
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
    activeGenerationKind: "",
    queuedKind: "",
    queuedVideoKey: "",
    generationIDs: {
        timestamps: 0,
        summary: 0,
    },
    didAutogenerateTimestamps: false,
};

function logDebug(kind, message, extra) {
    const prefix = `[Gemini content:${kind}]`;
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

    if (state.model) {
        lines.push(`model: ${state.model}`);
    }

    if (state.debug[kind]) {
        lines.push(state.debug[kind]);
    }

    return lines.join("\n");
}

function isQueued(kind) {
    return state.queuedKind === kind && state.queuedVideoKey === currentVideoKey;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMessageWithTimeout(message, timeoutMs = GENERATION_TIMEOUT_MS) {
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

function getVideoURL() {
    const videoId = getVideoKey();
    if (!videoId) {
        return "";
    }

    return buildCanonicalVideoURL(videoId);
}

function unavailableMessage(kind) {
    return kind === "timestamps"
        ? "Timestamps could not be generated. If the video is still live, wait for it to finish and then try again."
        : "Summary could not be generated. If the video is still live, wait for it to finish and then try again.";
}

function getSidebarTarget() {
    return document.querySelector("ytd-watch-flexy #secondary-inner")
        || document.querySelector("ytd-watch-flexy #secondary");
}

function removePanel() {
    panelHost?.remove();
    for (const host of document.querySelectorAll("#gemini-youtube-sidebar-root")) {
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
    state.activeGenerationKind = "";
    state.queuedKind = "";
    state.queuedVideoKey = "";
    state.generationIDs = {
        timestamps: 0,
        summary: 0,
    };
    state.didAutogenerateTimestamps = false;
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

    if (isQueued(kind)) {
        return kind === "timestamps" ? "Timestamps queued" : "Summary queued";
    }

    return kind === "timestamps" ? "Timestamps" : "Summary";
}

function activeText(kind) {
    return kind === "timestamps" ? state.timestampsText : state.summaryText;
}

function activeError(kind) {
    return kind === "timestamps" ? state.errors.timestamps : state.errors.summary;
}

function renderConnectionState(message) {
    return `
        <div class="surface state-surface">
            <div class="state-copy">${escapeHTML(message)}</div>
            <button class="soft-button" data-open-app>Open Companion App</button>
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

function renderQueuedState(kind) {
    const runningKind = state.activeGenerationKind || "request";
    const runningLabel = runningKind === "timestamps" ? "timestamps" : "summary";
    const debug = debugSummary(kind);
    return `
        <div class="surface state-surface">
            <div class="state-copy">${kind === "timestamps" ? "Timestamps are queued." : "Summary is queued."}</div>
            <div class="caption">Waiting for ${runningLabel} to finish first.</div>
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
                    : "Open Summary to generate a recap for this video."
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

    if (isQueued("timestamps") && !state.timestampsText) {
        return renderQueuedState("timestamps");
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

    if (isQueued("summary") && !state.summaryText) {
        return renderQueuedState("summary");
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
    if (!state.isConfigured) {
        return renderConnectionState("Finish Gemini setup in the companion app.");
    }

    if (!state.isSignedIn) {
        return renderConnectionState("Sign in with Google in the companion app.");
    }

    return state.activeTab === "timestamps" ? renderTimestampsResult() : renderSummaryResult();
}

function render() {
    if (!panelHost) {
        return;
    }

    const root = panelHost.shadowRoot;
    if (!root) {
        return;
    }

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
                --text: #111318;
                --muted: #69707c;
                --accent: #d93025;
                --shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
                margin: 0 0 16px;
                color: var(--text);
                font: 14px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
            }

            @media (prefers-color-scheme: dark) {
                .wrap {
                    --bg: #191a1c;
                    --surface: #202226;
                    --surface-strong: #2a2d31;
                    --border: rgba(255, 255, 255, 0.08);
                    --text: #f5f5f6;
                    --muted: #a7afb9;
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
                padding: 16px 16px 10px;
                overflow-x: auto;
                scrollbar-width: none;
            }

            .tabs::-webkit-scrollbar {
                display: none;
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
                font-size: 14px;
                font-weight: 600;
                line-height: 34px;
                white-space: nowrap;
                cursor: pointer;
                transition: background 120ms ease, color 120ms ease;
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
                font-size: 12px;
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
                gap: 6px;
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
                line-height: 1.25;
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
                gap: 10px;
            }

            .summary-rich p,
            .summary-rich ul {
                margin: 0;
            }

            .summary-rich ul {
                padding-left: 18px;
            }

            .summary-rich li + li {
                margin-top: 6px;
            }

        </style>
        <div class="wrap">
            <div class="panel">
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

    for (const link of root.querySelectorAll("[data-seconds]")) {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            jumpToTime(Number(link.getAttribute("data-seconds") || 0));
        });
    }
}

async function refreshStatus() {
    const response = await sendMessageWithTimeout({ type: "gemini:getStatus" }, 20000).catch((error) => {
        console.debug("[Gemini content:status] Status refresh failed", error);
        return null;
    });
    state.isConfigured = Boolean(response?.isConfigured);
    state.isSignedIn = Boolean(response?.isSignedIn);
    state.model = response?.model || state.model;
    render();
}

async function openCompanionApp() {
    const response = await sendMessageWithTimeout({ type: "gemini:openApp" }, 20000).catch((error) => ({
        ok: false,
        error: error?.message || "The companion app could not be opened.",
    }));
    if (response?.ok) {
        await refreshStatus();
        return;
    }

    window.alert(response?.error || "The companion app could not be opened.");
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
    if (!state.isConfigured || !state.isSignedIn || state.timestampsText) {
        return;
    }

    await requestGeneration("timestamps");
}

async function maybeGenerateSummary() {
    if (!state.isConfigured || !state.isSignedIn || state.summaryText) {
        return;
    }

    await requestGeneration("summary");
}

async function maybeAutogenerateTimestamps() {
    if (
        !isWatchPage()
        || !state.isConfigured
        || !state.isSignedIn
        || state.didAutogenerateTimestamps
        || state.timestampsText
    ) {
        return;
    }

    state.didAutogenerateTimestamps = true;
    await requestGeneration("timestamps");
}

async function requestGeneration(kind) {
    if (!state.isConfigured || !state.isSignedIn || state.isLoading[kind] || activeText(kind)) {
        return;
    }

    if (state.activeGenerationKind && state.activeGenerationKind !== kind) {
        state.queuedKind = kind;
        state.queuedVideoKey = currentVideoKey || getVideoKey() || "";
        logDebug(kind, `step: waiting for ${state.activeGenerationKind} to finish`);
        render();
        return;
    }

    if (isQueued(kind)) {
        state.queuedKind = "";
        state.queuedVideoKey = "";
    }

    await generate(kind);
}

async function maybeRunQueuedGeneration() {
    if (!state.queuedKind || state.activeGenerationKind) {
        return;
    }

    if (state.queuedVideoKey !== currentVideoKey) {
        state.queuedKind = "";
        state.queuedVideoKey = "";
        return;
    }

    const nextKind = state.queuedKind;
    state.queuedKind = "";
    state.queuedVideoKey = "";
    await requestGeneration(nextKind);
}

async function generate(kind) {
    if (!state.isConfigured || !state.isSignedIn || state.isLoading[kind]) {
        return;
    }

    const videoURL = getVideoURL();
    const videoKey = getVideoKey();
    if (!videoURL || !videoKey) {
        return;
    }

    state.errors[kind] = "";
    state.debug[kind] = "";
    state.isLoading[kind] = true;
    state.activeGenerationKind = kind;
    state.generationIDs[kind] += 1;
    const generationID = state.generationIDs[kind];
    logDebug(kind, `started: ${new Date().toLocaleTimeString()}`);
    logDebug(kind, `videoKey: ${videoKey}`);
    logDebug(kind, `videoURL: ${videoURL}`);
    logDebug(kind, "step: asking the extension to start the request");
    render();

    const startResponse = await sendMessageWithTimeout({
        type: "gemini:startGenerate",
        videoURL,
        kind,
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

    if (currentVideoKey !== videoKey || state.generationIDs[kind] !== generationID) {
        return;
    }

    if (!startResponse?.ok || !startResponse?.jobId) {
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
        if (state.activeGenerationKind === kind) {
            state.activeGenerationKind = "";
        }
        state.errors[kind] = startResponse?.error || "The extension could not start the Gemini job.";
        render();
        await maybeRunQueuedGeneration();
        await refreshStatus();
        return;
    }

    const jobID = startResponse.jobId;
    logDebug(kind, `requestId: ${jobID}`);
    logDebug(kind, "step: waiting for Gemini to reply");
    render();

    const deadline = Date.now() + GENERATION_TIMEOUT_MS;
    const startedAt = Date.now();
    let lastWaitNoticeAt = startedAt;
    let response = null;

    while (Date.now() < deadline) {
        const pollResponse = await sendMessageWithTimeout({
            type: "gemini:getGenerateJob",
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

        if (currentVideoKey !== videoKey || state.generationIDs[kind] !== generationID) {
            return;
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
            logDebug(kind, `waiting for Gemini: ${Math.round((Date.now() - startedAt) / 1000)}s`);
            render();
        }

        await sleep(1000);
    }

    if (!response) {
        response = {
            ok: false,
            error: "Timed out waiting for the Gemini background job to finish.",
            debug: {
                layer: "content",
                step: "poll-timeout",
                detail: `jobId=${jobID}`,
            },
        };
    }

    if (currentVideoKey !== videoKey || state.generationIDs[kind] !== generationID) {
        return;
    }

    state.isLoading[kind] = false;
    if (state.activeGenerationKind === kind) {
        state.activeGenerationKind = "";
    }

    if (!response?.ok) {
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
        state.errors[kind] = response?.error || "The extension did not receive a usable response from Gemini.";
        render();
        await maybeRunQueuedGeneration();
        await refreshStatus();
        return;
    }

    logDebug(kind, "step: Gemini response received");
    if (kind === "timestamps") {
        const timestampText = String(response.text ?? "").trim();
        if (parseTimestamps(timestampText).length === 0) {
            state.timestampsText = "";
            state.errors[kind] = unavailableMessage(kind);
            render();
            await maybeRunQueuedGeneration();
            return;
        }
        state.timestampsText = timestampText;
    } else {
        const summaryText = String(response.text ?? "").trim();
        if (looksLikeInputRequest(summaryText)) {
            state.summaryText = "";
            state.errors[kind] = unavailableMessage(kind);
            render();
            await maybeRunQueuedGeneration();
            return;
        }
        state.summaryText = summaryText;
    }

    state.errors[kind] = "";
    render();
    await maybeRunQueuedGeneration();
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
    if (!target || panelHost) {
        return;
    }

    panelHost = document.createElement("div");
    panelHost.id = "gemini-youtube-sidebar-root";
    panelHost.attachShadow({ mode: "open" });
    target.prepend(panelHost);
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
        await maybeAutogenerateTimestamps();
        return;
    }

    if (!target.contains(panelHost)) {
        target.prepend(panelHost);
        needsRender = true;
    }

    if (needsRender) {
        render();
    }

    await maybeAutogenerateTimestamps();
}

async function handleForegroundRefresh() {
    if (isWatchPage()) {
        await refreshStatus();
        await ensurePanel();
        return;
    }

    if (panelHost || currentVideoKey !== null) {
        await ensurePanel();
    }
}

async function handleNavigationChange() {
    lastObservedURL = window.location.href;

    if (isWatchPage()) {
        await refreshStatus();
    }

    await ensurePanel();
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
    if (isWatchPage()) {
        await refreshStatus();
    }
    await ensurePanel();

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
}

init();
})();
