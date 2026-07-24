const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Exercise the real background job lifecycle as well as its diagnostic helpers.
const backgroundPath = path.resolve(
    __dirname,
    "../../YouTube Timestamps and Summaries Extension/Resources/background.js",
);

function loadBackgroundSandbox(sendNativeMessage = async () => ({})) {
    const sandbox = {
        browser: {
            runtime: {
                onMessage: {
                    addListener() {},
                },
                sendNativeMessage,
            },
        },
        console: {
            debug() {},
        },
        setTimeout,
        clearTimeout,
    };

    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(backgroundPath, "utf8"), sandbox);
    return sandbox;
}

async function waitForBackgroundJob(sandbox, jobID) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        const response = sandbox.getGenerateJob(jobID);
        if (response.status !== "running") {
            return response;
        }
    }
    assert.fail(`Background job ${jobID} did not finish`);
}

test("Apple summary redaction has one native source of truth", () => {
    const backgroundSource = fs.readFileSync(backgroundPath, "utf8");

    assert.doesNotMatch(backgroundSource, /APPLE_SUMMARY_REDACTION_PATTERNS/);
    assert.doesNotMatch(backgroundSource, /function redactAppleSummaryTranscript/);
    assert.match(backgroundSource, /nativeTranscriptRedactions/);
});

test("native generation diagnostics expose xAI latency and token usage", () => {
    const { appendNativeGenerationDiagnostics } = loadBackgroundSandbox();
    const job = { messages: [] };

    appendNativeGenerationDiagnostics(job, {
        reasoningEffort: "low",
        timeToFirstOutputMs: 12_345,
        inputTokens: 40_030,
        cachedInputTokens: 0,
        outputTokens: 420,
        reasoningTokens: 120,
        totalTokens: 40_450,
        serviceTier: "default",
    });

    const messages = job.messages.join("\n");
    assert.match(messages, /reasoning effort: low/);
    assert.match(messages, /time to first output: 12\.3s/);
    assert.match(messages, /tokens: 40030 input \(0 cached\), 420 output \(120 reasoning\), 40450 total/);
    assert.match(messages, /service tier: default/);
});

test("successful native generation jobs reach completion for every production route", async () => {
    const cases = [
        {
            name: "ChatGPT Chapters",
            kind: "selectedProviderTimestamps",
            settings: {
                providerID: "openaiCodex",
                modelID: "gpt-5.6-terra",
                modelLabel: "GPT-5.6 Terra",
            },
            expectedAction: "generateCodexTimestamps",
            debug: {},
        },
        {
            name: "ChatGPT Summary",
            kind: "selectedProviderSummary",
            settings: {
                providerID: "openaiCodex",
                modelID: "gpt-5.6-terra",
                modelLabel: "GPT-5.6 Terra",
                summaryModelID: "gpt-5.6-terra",
                summaryModelLabel: "GPT-5.6 Terra",
                summaryEngine: "selectedModel",
            },
            expectedAction: "generateCodexSummary",
            debug: {},
        },
        {
            name: "Grok Chapters",
            kind: "selectedProviderTimestamps",
            settings: {
                providerID: "xaiOAuth",
                modelID: "grok-4.5",
                modelLabel: "Grok 4.5",
            },
            expectedAction: "generateGrokTimestamps",
            debug: {
                reasoningEffort: "low",
                inputTokens: 1_000,
                outputTokens: 100,
            },
        },
        {
            name: "Grok Summary",
            kind: "selectedProviderSummary",
            settings: {
                providerID: "xaiOAuth",
                modelID: "grok-4.5",
                modelLabel: "Grok 4.5",
                summaryModelID: "grok-4.5",
                summaryModelLabel: "Grok 4.5",
                summaryEngine: "selectedModel",
            },
            expectedAction: "generateGrokSummary",
            debug: {
                reasoningEffort: "low",
                inputTokens: 2_000,
                outputTokens: 200,
            },
        },
        {
            name: "Apple Summary",
            kind: "selectedProviderSummary",
            settings: {
                providerID: "xaiOAuth",
                modelID: "grok-4.5",
                modelLabel: "Grok 4.5",
                summaryModelID: "appleIntelligence",
                summaryModelLabel: "Apple Intelligence",
                summaryEngine: "appleIntelligence",
            },
            expectedAction: "generateContent",
            debug: {
                nativeTranscriptRedactions: 2,
                summaryStrategy: "adaptiveGrounded",
            },
        },
    ];

    for (const testCase of cases) {
        const actions = [];
        const sandbox = loadBackgroundSandbox(async (_appID, message) => {
            actions.push(message.action);
            if (message.action === "getGenerationSettings") {
                return { ok: true, settings: testCase.settings };
            }
            return {
                ok: true,
                text: `${testCase.name} result`,
                debug: testCase.debug,
            };
        });

        const started = sandbox.startGenerateJob(
            testCase.kind,
            "A complete transcript",
            6 * 60 * 1000,
            { languageCode: "en", languageLabel: "English" }
        );
        const completed = await waitForBackgroundJob(sandbox, started.jobId);

        assert.equal(completed.status, "completed", testCase.name);
        assert.equal(completed.error, "", testCase.name);
        assert.equal(completed.text, `${testCase.name} result`, testCase.name);
        assert.deepEqual(actions, ["getGenerationSettings", testCase.expectedAction]);
        assert.doesNotMatch(completed.debug.messages, /background exception/);
    }
});

test("transcript input combines length and language in one log line", () => {
    const { transcriptInputMessage } = loadBackgroundSandbox();

    assert.equal(
        transcriptInputMessage("x".repeat(61_222), {
            languageCode: "en",
            languageLabel: "English",
        }),
        "input: 61222 chars, English (en)"
    );
    assert.equal(
        transcriptInputMessage("hello", {}),
        "input: 5 chars"
    );
    assert.equal(
        transcriptInputMessage("", {
            languageCode: "en",
            languageLabel: "English",
        }),
        "input: unavailable"
    );
});
