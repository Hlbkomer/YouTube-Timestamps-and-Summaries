// Safari ignores this identifier and routes native messages to the containing app,
// but using the actual app bundle ID keeps the intent clear when reading the code.
const NATIVE_APP_ID = "Matuko.YouTube-Timestamps-and-Summaries";
const MIN_NATIVE_TIMEOUT_MS = 6 * 60 * 1000;
const MAX_NATIVE_TIMEOUT_MS = 20 * 60 * 1000;
const JOB_RETENTION_MS = 30 * 60 * 1000;
const JOB_MESSAGE_LIMIT = 80;
const DEFAULT_SELECTED_MODEL = "gpt-5.6-terra";
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

async function copyTextToClipboard(text) {
    const value = typeof text === "string" ? text : "";
    if (!value) {
        return { ok: false, error: "There is no text to copy." };
    }

    try {
        if (!globalThis.navigator?.clipboard?.writeText) {
            throw new Error("The extension clipboard API is unavailable.");
        }

        await globalThis.navigator.clipboard.writeText(value);
        return { ok: true };
    } catch (error) {
        debugLog("Extension clipboard write failed", error);
        return {
            ok: false,
            error: error?.message || "Safari denied clipboard access.",
        };
    }
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

function appendNativeGenerationDiagnostics(job, debug = {}) {
    if (typeof debug.reasoningEffort === "string" && debug.reasoningEffort) {
        appendJobMessage(job, `reasoning effort: ${debug.reasoningEffort}`);
    }

    const timeToFirstOutputMs = Number(debug.timeToFirstOutputMs);
    if (Number.isFinite(timeToFirstOutputMs) && timeToFirstOutputMs >= 0) {
        const label = timeToFirstOutputMs >= 1000
            ? `${(timeToFirstOutputMs / 1000).toFixed(1)}s`
            : `${Math.round(timeToFirstOutputMs)}ms`;
        appendJobMessage(job, `time to first output: ${label}`);
    }

    const diagnosticInteger = (value) => {
        if (value === null || typeof value === "undefined" || value === "") {
            return null;
        }
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
    };
    const inputTokens = diagnosticInteger(debug.inputTokens);
    const cachedInputTokens = diagnosticInteger(debug.cachedInputTokens);
    const outputTokens = diagnosticInteger(debug.outputTokens);
    const reasoningTokens = diagnosticInteger(debug.reasoningTokens);
    const totalTokens = diagnosticInteger(debug.totalTokens);
    const tokenParts = [];
    if (inputTokens !== null) {
        tokenParts.push(`${inputTokens} input${cachedInputTokens !== null ? ` (${cachedInputTokens} cached)` : ""}`);
    }
    if (outputTokens !== null) {
        tokenParts.push(`${outputTokens} output${reasoningTokens !== null ? ` (${reasoningTokens} reasoning)` : ""}`);
    }
    if (totalTokens !== null) {
        tokenParts.push(`${totalTokens} total`);
    }
    if (tokenParts.length > 0) {
        appendJobMessage(job, `tokens: ${tokenParts.join(", ")}`);
    }

    if (typeof debug.serviceTier === "string" && debug.serviceTier) {
        appendJobMessage(job, `service tier: ${debug.serviceTier}`);
    }
}

function generationLabel(kind) {
    if (kind === "selectedProviderTimestamps") {
        return "timestamps";
    }

    if (kind === "selectedProviderSummary") {
        return "summary";
    }

    if (kind === "summaryFull") {
        return "summary";
    }

    return kind;
}

function transcriptInputMessage(transcriptText, metadata = {}) {
    if (!transcriptText) {
        return "input: unavailable";
    }

    const languageLabel = String(metadata.languageLabel || "").trim();
    const languageCode = String(metadata.languageCode || "").trim();
    const language = languageLabel && languageCode
        ? `${languageLabel} (${languageCode})`
        : (languageLabel || languageCode);
    const languageSuffix = language ? `, ${language}` : "";
    return `input: ${transcriptText.length} chars${languageSuffix}`;
}

function jobResponse(job) {
    return {
        ok: true,
        jobId: job.id,
        status: job.status,
        text: job.text || "",
        error: job.error || "",
        engineLabel: job.engineLabel || "",
        debug: {
            layer: "background",
            kind: job.kind,
            durationMs: Date.now() - job.startedAt,
            engineLabel: job.engineLabel || "",
            messages: (job.messages || []).join("\n"),
            native: job.nativeDebug || null,
        },
    };
}

async function statusPayload() {
    return await sendNative("getStatus");
}

async function generationSettingsPayload() {
    return await sendNative("getGenerationSettings");
}

function selectedProviderAction(providerID, kind) {
    if (providerID === "xaiOAuth") {
        return kind === "timestamps"
            ? "generateGrokTimestamps"
            : "generateGrokSummary";
    }

    return kind === "timestamps"
        ? "generateCodexTimestamps"
        : "generateCodexSummary";
}

async function generateSelectedProviderTimestamps(job, transcriptText, nativeTimeoutMs, metadata = {}) {
    const status = await generationSettingsPayload();
    const settings = status?.settings || {};
    const providerID = settings.providerID || "openaiCodex";
    const model = settings.modelID || DEFAULT_SELECTED_MODEL;
    const modelLabel = settings.modelLabel || model;
    job.engineLabel = modelLabel;

    return await sendNative(selectedProviderAction(providerID, "timestamps"), {
        transcript: transcriptText,
        model,
        languageCode: metadata.languageCode || "",
        languageLabel: metadata.languageLabel || "",
    }, nativeTimeoutMs);
}

async function generateConfiguredSummary(job, transcriptText, nativeTimeoutMs, metadata = {}) {
    const status = await generationSettingsPayload();
    const settings = status?.settings || {};
    const providerID = settings.providerID || "openaiCodex";
    const timestampModel = settings.modelID || DEFAULT_SELECTED_MODEL;
    const summaryModel = settings.summaryModelID || timestampModel;
    const summaryModelLabel = settings.summaryModelLabel || settings.summaryEngineLabel || summaryModel;
    const summaryEngine = settings.summaryEngine || "selectedModel";
    const summaryEngineLabel = summaryEngine === "selectedModel"
        ? summaryModelLabel
        : (summaryModelLabel || "Apple Intelligence");
    job.engineLabel = summaryEngineLabel;

    if (summaryEngine === "selectedModel") {
        return await sendNative(selectedProviderAction(providerID, "summary"), {
            transcript: transcriptText,
            model: summaryModel,
            languageCode: metadata.languageCode || "",
            languageLabel: metadata.languageLabel || "",
        }, nativeTimeoutMs);
    }

    return await sendNative("generateContent", {
        kind: "summaryFull",
        transcript: transcriptText,
        languageCode: metadata.languageCode || "",
        languageLabel: metadata.languageLabel || "",
    }, nativeTimeoutMs);
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
        engineLabel: "",
    };
    appendJobMessage(job, transcriptInputMessage(transcriptText, metadata));
    jobs.set(job.id, job);

    void (async () => {
        let response;
        if (kind === "selectedProviderTimestamps") {
            response = await generateSelectedProviderTimestamps(job, transcriptText, nativeTimeoutMs, metadata);
        } else if (kind === "selectedProviderSummary") {
            response = await generateConfiguredSummary(job, transcriptText, nativeTimeoutMs, metadata);
        } else {
            response = {
                ok: false,
                error: `Unsupported generation job: ${kind}`,
            };
        }
        job.nativeDebug = response?.debug || null;

        if (response?.ok) {
            job.status = "completed";
            job.text = response.text || "";
            if (response.debug?.betaModel) {
                appendJobMessage(job, `engine: ${response.debug.betaModel}`);
            }
            if (response.debug?.chunkStrategy) {
                appendJobMessage(job, `chunk strategy: ${response.debug.chunkStrategy}`);
            }
            if (response.debug?.summaryStrategy) {
                appendJobMessage(job, `summary strategy: ${response.debug.summaryStrategy}`);
            }
            if (response.debug?.summaryPath) {
                appendJobMessage(job, `summary path: ${response.debug.summaryPath}`);
            }
            if (response.debug?.modelCalls !== undefined) {
                appendJobMessage(job, `model calls: ${response.debug.modelCalls}`);
            }
            if (response.debug?.stageCalls) {
                appendJobMessage(job, `stage calls: ${response.debug.stageCalls}`);
            }
            if (response.debug?.quotaStatus) {
                appendJobMessage(job, `quota: ${response.debug.quotaStatus}`);
            }
            const nativeRedactions = diagnosticInteger(
                response.debug?.nativeTranscriptRedactions
            );
            if (nativeRedactions > 0) {
                appendJobMessage(
                    job,
                    `redacted ${nativeRedactions} explicit transcript term${nativeRedactions === 1 ? "" : "s"} for Apple Intelligence`
                );
            }
            appendNativeGenerationDiagnostics(job, response.debug);
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

    case "ai:copyText":
        return await copyTextToClipboard(message.text);

    case "ai:startGenerate":
        return startGenerateJob(message.kind, message.transcript, message.timeoutMs, message.transcriptMetadata || {});

    case "ai:getGenerateJob":
        return getGenerateJob(message.jobId);

    default:
        return null;
    }
});
