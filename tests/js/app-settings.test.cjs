const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const scriptSource = fs.readFileSync(
    path.join(root, "YouTube Timestamps and Summaries/Resources/Script.js"),
    "utf8"
);

function element() {
    return {
        dataset: {},
        disabled: false,
        hidden: false,
        innerHTML: "",
        textContent: "",
        value: "",
        addEventListener() {},
    };
}

function render(state) {
    const elements = new Map();
    const document = {
        getElementById(id) {
            if (!elements.has(id)) {
                elements.set(id, element());
            }
            return elements.get(id);
        },
    };
    const window = {};
    const context = vm.createContext({
        Boolean,
        document,
        webkit: {
            messageHandlers: {
                controller: { postMessage() {} },
            },
        },
        window,
    });

    vm.runInContext(scriptSource, context);
    window.renderAppState({
        providerOptions: [
            { id: "openaiCodex", label: "ChatGPT / Codex" },
            { id: "xaiOAuth", label: "Grok (SuperGrok)" },
        ],
        modelOptions: [],
        chapterPreferenceOptions: [],
        summaryOptions: [],
        settings: {
            providerID: "openaiCodex",
            modelID: "gpt-5.6-terra",
            chapterPreference: "preferNative",
            summaryModelID: "appleIntelligence",
        },
        ...state,
    });

    return elements;
}

test("provider picker disables disconnected options without a connection hint", () => {
    const elements = render({
        codex: { connected: false },
        grok: { connected: true },
    });
    const provider = elements.get("provider-select");

    assert.match(provider.innerHTML, /value="openaiCodex" disabled/);
    assert.match(provider.innerHTML, /value="xaiOAuth">/);
    assert.equal(provider.disabled, false);
    assert.equal(provider.dataset.selectedUnavailable, "true");
    assert.equal(elements.has("generation-setup-hint"), false);
    assert.equal(elements.get("model-select").disabled, true);
});

test("provider picker is disabled when no provider is connected", () => {
    const elements = render({
        codex: { connected: false },
        grok: { connected: false },
    });

    assert.equal(elements.get("provider-select").disabled, true);
});

test("disconnected provider labels stay concise when status includes an error", () => {
    const elements = render({
        codex: { connected: false, error: "ChatGPT request failed." },
        grok: { connected: false, error: "Open the app and sign in." },
    });

    assert.equal(elements.get("codex-status").textContent, "ChatGPT is not connected.");
    assert.equal(elements.get("grok-status").textContent, "Grok is not connected.");
});

test("connected selected provider keeps its model settings available", () => {
    const elements = render({
        codex: { connected: true },
        grok: { connected: false },
    });
    const provider = elements.get("provider-select");

    assert.match(provider.innerHTML, /value="openaiCodex">/);
    assert.match(provider.innerHTML, /value="xaiOAuth" disabled/);
    assert.equal(provider.dataset.selectedUnavailable, "false");
    assert.equal(elements.get("model-select").disabled, false);
});

test("missing ChatGPT model selection falls back to GPT-5.6 Terra", () => {
    const elements = render({
        codex: { connected: true },
        grok: { connected: false },
        modelOptions: [
            { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
            { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
        ],
        settings: {
            providerID: "openaiCodex",
            chapterPreference: "preferNative",
            summaryModelID: "appleIntelligence",
        },
    });

    assert.equal(elements.get("model-select").value, "gpt-5.6-terra");
});
