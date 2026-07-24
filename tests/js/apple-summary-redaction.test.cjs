const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const backgroundPath = path.resolve(
    __dirname,
    "../../YouTube Timestamps and Summaries Extension/Resources/background.js",
);

function loadBackgroundSandbox() {
    const sandbox = {
        browser: {
            runtime: {
                onMessage: {
                    addListener() {},
                },
                async sendNativeMessage() {
                    return {};
                },
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
