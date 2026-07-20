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

test("Apple summary redaction catches YouTube-censored captions", () => {
    const { redactAppleSummaryTranscript } = loadBackgroundSandbox();
    const transcript = [
        "I think [ __ ] like this is inflammatory.",
        "Fuck these guys.",
    ].join("\n");

    const redacted = redactAppleSummaryTranscript(transcript);

    assert.equal(redacted.count, 2);
    assert.equal(redacted.text.includes("[ __ ]"), false);
    assert.equal(/fuck/i.test(redacted.text), false);
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
