// Safari ignores this identifier and routes native messages to the containing app,
// but using the actual app bundle ID keeps the intent clear when reading the code.
const NATIVE_APP_ID = "Matuko.YouTube-Timestamps-and-Summaries";
const MIN_NATIVE_TIMEOUT_MS = 6 * 60 * 1000;
const MAX_NATIVE_TIMEOUT_MS = 20 * 60 * 1000;
const JOB_RETENTION_MS = 30 * 60 * 1000;
const JOB_MESSAGE_LIMIT = 80;
const CODEX_DEFAULT_MODEL = "gpt-5.5";
const ENABLE_APPLE_SUMMARY_SELECTED_MODEL_FALLBACK = false;
const ENABLE_APPLE_SUMMARY_TRANSCRIPT_REDACTION = true;
const APPLE_SUMMARY_CHUNK_CHARACTER_LIMIT = 10000;
const APPLE_SUMMARY_UNSUPPORTED_LANGUAGE_CHUNK_CHARACTER_LIMIT = 6000;
const APPLE_SUMMARY_PARALLEL_REQUESTS = 3;
const APPLE_SUPPORTED_LANGUAGE_CODES = new Set([
    "da", "de", "en", "es", "fr", "it", "ja", "ko", "nl", "no", "pt", "sv", "tr", "vi", "zh",
]);
const APPLE_SUMMARY_REDACTION_PATTERNS = [
    /\b(?:fuck(?:er|ing)?|fucking|fucked|shit(?:ty)?|bullshit|bitch(?:es)?|asshole|dick|pussy|cunt)\b/gi,
    /\b(?:nigg(?:a|er)s?|fag(?:got)?s?|retard(?:ed)?|whore(?:s)?|slut(?:s)?)\b/gi,
];
const jobs = new Map();
let nextJobID = 0;

function debugLog(message, extra) {
    void extra;
    console.debug(`[Generation background] ${message}`);
}

async function withTimeout(promise, timeoutMs, timeoutMessage) {
    let timeoutID = null;

    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timeoutID = setTimeout(() => {
                    reject(new Error(timeoutMessage));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutID !== null) {
            clearTimeout(timeoutID);
        }
    }
}

function boundedTimeout(timeoutMs) {
    const requestedTimeoutMs = Number(timeoutMs);

    if (!Number.isFinite(requestedTimeoutMs)) {
        return MIN_NATIVE_TIMEOUT_MS;
    }

    return Math.min(MAX_NATIVE_TIMEOUT_MS, Math.max(MIN_NATIVE_TIMEOUT_MS, requestedTimeoutMs));
}

function now() {
    return Date.now();
}

async function sendNative(action, payload = {}, timeoutMs = MIN_NATIVE_TIMEOUT_MS) {
    const startedAt = Date.now();
    const nativeTimeoutMs = boundedTimeout(timeoutMs);
    debugLog(`Sending native message: ${action}`, payload);

    try {
        const response = await withTimeout(browser.runtime.sendNativeMessage(NATIVE_APP_ID, {
            action,
            ...payload,
        }), nativeTimeoutMs, `Timed out waiting for the native app after ${Math.round(nativeTimeoutMs / 1000)} seconds.`);

        if (!response || typeof response !== "object") {
            debugLog(`Native message returned no usable payload for ${action}`);
            return {
                ok: false,
                error: "The native app returned no data.",
                debug: {
                    layer: "background",
                    action,
                    durationMs: Date.now() - startedAt,
                },
            };
        }

        debugLog(`Native message completed: ${action} (${Date.now() - startedAt}ms)`, response);
        return response;
    } catch (error) {
        debugLog(`Native message failed: ${action} (${Date.now() - startedAt}ms)`, error);
        return {
            ok: false,
            error: error?.message || "The extension could not reach the native companion app.",
            debug: {
                layer: "background",
                action,
                durationMs: Date.now() - startedAt,
                detail: error?.stack || error?.message || String(error),
            },
        };
    }
}

function createJobID() {
    nextJobID += 1;
    return `job-${Date.now()}-${nextJobID}`;
}

function pruneJobs() {
    const now = Date.now();
    for (const [jobID, job] of jobs.entries()) {
        const referenceTime = job.finishedAt || job.startedAt;
        if (now - referenceTime > JOB_RETENTION_MS) {
            jobs.delete(jobID);
        }
    }
}

function appendJobMessage(job, message) {
    const line = `${new Date().toLocaleTimeString()} ${message}`;
    job.messages = [...(job.messages || []), line].slice(-JOB_MESSAGE_LIMIT);
}

function redactAppleSummaryTranscript(transcriptText) {
    if (!ENABLE_APPLE_SUMMARY_TRANSCRIPT_REDACTION) {
        return {
            text: transcriptText,
            count: 0,
        };
    }

    let redactionCount = 0;
    let redactedText = String(transcriptText || "");
    for (const pattern of APPLE_SUMMARY_REDACTION_PATTERNS) {
        redactedText = redactedText.replace(pattern, () => {
            redactionCount += 1;
            return "[redacted]";
        });
    }

    return {
        text: redactedText,
        count: redactionCount,
    };
}

function normalizedLanguageCode(languageCode) {
    return String(languageCode || "").trim().toLowerCase().split("-")[0];
}

function appleSummaryChunkLimit(metadata = {}) {
    const languageCode = normalizedLanguageCode(metadata.languageCode);
    if (languageCode && !APPLE_SUPPORTED_LANGUAGE_CODES.has(languageCode)) {
        return APPLE_SUMMARY_UNSUPPORTED_LANGUAGE_CHUNK_CHARACTER_LIMIT;
    }

    return APPLE_SUMMARY_CHUNK_CHARACTER_LIMIT;
}

function generationLabel(kind) {
    if (kind === "codexTimestamps") {
        return "timestamps";
    }

    if (kind === "codexSummary") {
        return "summary";
    }

    if (kind === "summaryFull") {
        return "summary";
    }

    return kind;
}

function jobResponse(job) {
    return {
        ok: true,
        jobId: job.id,
        status: job.status,
        text: job.text || "",
        error: job.error || "",
        debug: {
            layer: "background",
            kind: job.kind,
            durationMs: Date.now() - job.startedAt,
            messages: (job.messages || []).join("\n"),
            native: job.nativeDebug || null,
        },
    };
}

async function statusPayload() {
    return await sendNative("getStatus");
}

async function generateCodexTimestamps(job, transcriptText, nativeTimeoutMs, metadata = {}) {
    const status = await statusPayload();
    const settings = status?.settings || {};
    const model = settings.modelID || CODEX_DEFAULT_MODEL;
    const modelLabel = settings.modelLabel || model;

    if (metadata.languageCode || metadata.languageLabel) {
        appendJobMessage(job, `caption language: ${metadata.languageLabel || metadata.languageCode}${metadata.languageCode ? ` (${metadata.languageCode})` : ""}`);
    }
    appendJobMessage(job, `asking ${modelLabel} to create timestamps`);
    const response = await sendNative("generateCodexTimestamps", {
        transcript: transcriptText,
        model,
        languageCode: metadata.languageCode || "",
        languageLabel: metadata.languageLabel || "",
    }, nativeTimeoutMs);

    if (response?.ok) {
        appendJobMessage(job, `${modelLabel} returned timestamps (${(response.text || "").length} chars)`);
    } else {
        appendJobMessage(job, `${modelLabel} timestamps failed: ${response?.error || "unknown error"}`);
    }

    return response;
}

async function generateConfiguredSummary(job, transcriptText, nativeTimeoutMs, metadata = {}) {
    const status = await statusPayload();
    const settings = status?.settings || {};
    const model = settings.modelID || CODEX_DEFAULT_MODEL;
    const modelLabel = settings.modelLabel || model;
    const summaryEngine = settings.summaryEngine || "selectedModel";
    const summaryEngineLabel = settings.summaryEngineLabel || (summaryEngine === "selectedModel" ? modelLabel : "Apple Intelligence");

    if (summaryEngine === "selectedModel") {
        if (metadata.languageCode || metadata.languageLabel) {
            appendJobMessage(job, `caption language: ${metadata.languageLabel || metadata.languageCode}${metadata.languageCode ? ` (${metadata.languageCode})` : ""}`);
        }
        appendJobMessage(job, `asking ${summaryEngineLabel} to create summary`);
        const response = await sendNative("generateCodexSummary", {
            transcript: transcriptText,
            model,
            languageCode: metadata.languageCode || "",
            languageLabel: metadata.languageLabel || "",
        }, nativeTimeoutMs);

        if (response?.ok) {
            appendJobMessage(job, `${summaryEngineLabel} returned summary (${(response.text || "").length} chars)`);
        } else {
            appendJobMessage(job, `${summaryEngineLabel} summary failed: ${response?.error || "unknown error"}`);
        }

        return response;
    }

    const redactedTranscript = redactAppleSummaryTranscript(transcriptText);
    if (redactedTranscript.count > 0) {
        appendJobMessage(job, `redacted ${redactedTranscript.count} explicit transcript term${redactedTranscript.count === 1 ? "" : "s"} for Apple Intelligence`);
    }

    const appleTranscriptText = redactedTranscript.text;
    const chunkLimit = appleSummaryChunkLimit(metadata);
    const estimatedChunks = Math.max(1, Math.ceil(appleTranscriptText.length / chunkLimit));
    const estimatedWaves = Math.max(1, Math.ceil(estimatedChunks / APPLE_SUMMARY_PARALLEL_REQUESTS));
    if (metadata.languageCode || metadata.languageLabel) {
        appendJobMessage(job, `caption language: ${metadata.languageLabel || metadata.languageCode}${metadata.languageCode ? ` (${metadata.languageCode})` : ""}`);
    }
    appendJobMessage(job, estimatedChunks > 1
        ? `asking Apple Intelligence to create summary (~${estimatedChunks} chunks, ${estimatedWaves} waves)`
        : "asking Apple Intelligence to create summary");
    const appleResponse = await sendNative("generateContent", {
        kind: "summaryFull",
        transcript: appleTranscriptText,
        languageCode: metadata.languageCode || "",
        languageLabel: metadata.languageLabel || "",
    }, nativeTimeoutMs);

    if (appleResponse?.ok) {
        appendJobMessage(job, `Apple Intelligence returned summary (${(appleResponse.text || "").length} chars)`);
        return appleResponse;
    }

    appendJobMessage(job, `Apple Intelligence summary failed: ${appleResponse?.error || "unknown error"}`);

    // Keep this disabled while testing Apple Intelligence. When enabled later,
    // guardrail/network failures can fall back to the selected model without
    // changing the sidebar request architecture.
    if (!ENABLE_APPLE_SUMMARY_SELECTED_MODEL_FALLBACK) {
        return appleResponse;
    }

    appendJobMessage(job, `falling back to ${modelLabel} for summary`);
    const fallbackResponse = await sendNative("generateCodexSummary", {
        transcript: transcriptText,
        model,
        languageCode: metadata.languageCode || "",
        languageLabel: metadata.languageLabel || "",
    }, nativeTimeoutMs);

    if (fallbackResponse?.ok) {
        appendJobMessage(job, `${modelLabel} fallback returned summary (${(fallbackResponse.text || "").length} chars)`);
    } else {
        appendJobMessage(job, `${modelLabel} fallback failed: ${fallbackResponse?.error || "unknown error"}`);
    }

    return fallbackResponse;
}

function startGenerateJob(kind, transcript = "", timeoutMs = MIN_NATIVE_TIMEOUT_MS, metadata = {}) {
    pruneJobs();
    const transcriptText = typeof transcript === "string" ? transcript.trim() : "";
    const nativeTimeoutMs = boundedTimeout(timeoutMs);
    const label = generationLabel(kind);

    const job = {
        id: createJobID(),
        kind,
        status: "running",
        startedAt: Date.now(),
        finishedAt: 0,
        text: "",
        error: "",
        messages: [],
        nativeDebug: null,
    };
    appendJobMessage(job, `${label} request started`);
    appendJobMessage(job, transcriptText ? `input: transcript (${transcriptText.length} chars)` : "input: transcript unavailable");
    appendJobMessage(job, `timeout budget: ${Math.round(nativeTimeoutMs / 1000)}s`);
    jobs.set(job.id, job);

    void (async () => {
        let response;
        if (kind === "codexTimestamps") {
            response = await generateCodexTimestamps(job, transcriptText, nativeTimeoutMs, metadata);
        } else if (kind === "codexSummary") {
            response = await generateConfiguredSummary(job, transcriptText, nativeTimeoutMs, metadata);
        } else {
            appendJobMessage(job, "asking the app to use Apple Intelligence");
            response = await sendNative("generateContent", {
                kind,
                transcript: transcriptText,
                languageCode: metadata.languageCode || "",
                languageLabel: metadata.languageLabel || "",
            }, nativeTimeoutMs);
        }
        job.nativeDebug = response?.debug || null;

        if (response?.ok) {
            job.status = "completed";
            job.text = response.text || "";
            appendJobMessage(job, `${label} completed with ${job.text.length} chars`);
        } else {
            job.status = "failed";
            job.error = response?.error || "The native app returned no usable response.";
            appendJobMessage(job, `failed: ${job.error}`);
        }

        job.finishedAt = Date.now();
    })().catch((error) => {
        job.status = "failed";
        job.error = error?.message || "The background job crashed before completion.";
        appendJobMessage(job, `background exception: ${job.error}`);
        job.finishedAt = Date.now();
    });

    return {
        ok: true,
        jobId: job.id,
        debug: {
            layer: "background",
            kind,
            step: "started",
            messages: job.messages.join("\n"),
        },
    };
}

function getGenerateJob(jobID) {
    pruneJobs();
    const job = jobs.get(jobID);
    if (!job) {
        return {
            ok: false,
            error: "The generation job expired or could not be found.",
            debug: {
                layer: "background",
                jobId: jobID,
            },
        };
    }

    return jobResponse(job);
}

browser.runtime.onMessage.addListener(async (message) => {
    if (!message?.type) {
        return null;
    }

    debugLog(`Received extension message: ${message.type}`, message);

    switch (message.type) {
    case "ai:getStatus":
        return await statusPayload();

    case "ai:openApp":
        return await sendNative("openContainerApp");

    case "ai:startGenerate":
        return startGenerateJob(message.kind, message.transcript, message.timeoutMs, message.transcriptMetadata || {});

    case "ai:getGenerateJob":
        return getGenerateJob(message.jobId);

    default:
        return null;
    }
});
