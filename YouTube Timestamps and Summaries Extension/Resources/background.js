// Safari ignores this identifier and routes native messages to the containing app,
// but using the actual app bundle ID keeps the intent clear when reading the code.
const NATIVE_APP_ID = "Matuko.YouTube-Timestamps-and-Summaries";
const NATIVE_TIMEOUT_MS = 360000;
const JOB_RETENTION_MS = 10 * 60 * 1000;
const JOB_MESSAGE_LIMIT = 80;
const jobs = new Map();
let nextJobID = 0;

function debugLog(message, extra) {
    void extra;
    console.debug(`[Gemini background] ${message}`);
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

async function sendNative(action, payload = {}) {
    const startedAt = Date.now();
    debugLog(`Sending native message: ${action}`, payload);

    try {
        const response = await withTimeout(browser.runtime.sendNativeMessage(NATIVE_APP_ID, {
            action,
            ...payload,
        }), NATIVE_TIMEOUT_MS, `Timed out waiting for the native app after ${Math.round(NATIVE_TIMEOUT_MS / 1000)} seconds.`);

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

function startGenerateJob(videoURL, kind) {
    pruneJobs();

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
    appendJobMessage(job, `created for ${kind}`);
    jobs.set(job.id, job);

    void (async () => {
        appendJobMessage(job, "sending native request");
        const response = await sendNative("generateContent", { videoURL, kind });
        job.nativeDebug = response?.debug || null;

        if (response?.ok) {
            job.status = "completed";
            job.text = response.text || "";
            appendJobMessage(job, `completed with ${job.text.length} chars`);
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
            step: "queued",
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
                jobId,
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
    case "gemini:getStatus":
        return await sendNative("getStatus");

    case "gemini:openApp":
        return await sendNative("openContainerApp");

    case "gemini:startGenerate":
        return startGenerateJob(message.videoURL, message.kind);

    case "gemini:getGenerateJob":
        return getGenerateJob(message.jobId);

    case "gemini:generate":
        return await sendNative("generateContent", {
            videoURL: message.videoURL,
            kind: message.kind,
        });

    default:
        return null;
    }
});
