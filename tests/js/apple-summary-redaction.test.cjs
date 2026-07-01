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
