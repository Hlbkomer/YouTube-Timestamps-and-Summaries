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
const grokGenerationSource = fs.readFileSync(
    path.join(
        root,
        "YouTube Timestamps and Summaries Extension/GrokGenerationService.swift"
    ),
    "utf8"
);
const backgroundSource = fs.readFileSync(
    path.join(
        root,
        "YouTube Timestamps and Summaries Extension/Resources/background.js"
    ),
    "utf8"
);
const contentSource = fs.readFileSync(
    path.join(
        root,
        "YouTube Timestamps and Summaries Extension/Resources/content.js"
    ),
    "utf8"
);

function escapedHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;");
}

function element(tagName = "div") {
    let rawInnerHTML = "";
    const node = {
        tagName: tagName.toUpperCase(),
        children: [],
        dataset: {},
        disabled: false,
        hidden: false,
        textContent: "",
        value: "",
        addEventListener() {},
        append(...children) {
            this.children.push(...children);
            rawInnerHTML = "";
        },
        replaceChildren(...children) {
            this.children = [...children];
            rawInnerHTML = "";
        },
    };
    Object.defineProperty(node, "innerHTML", {
        get() {
            if (node.children.length > 0) {
                return node.children.map((child) => (
                    `<option value="${escapedHTML(child.value)}"${child.disabled ? " disabled" : ""}>`
                    + `${escapedHTML(child.textContent)}</option>`
                )).join("");
            }
            return rawInnerHTML;
        },
        set(value) {
            rawInnerHTML = String(value);
            node.children = [];
        },
    });
    return node;
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
        createElement(tagName) {
            return element(tagName);
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

test("Apple Intelligence uses one quality-backed Summary model choice", () => {
    const elements = render({
        summaryOptions: [
            { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
            { id: "appleIntelligence", label: "Apple Intelligence" },
        ],
        settings: {
            providerID: "openaiCodex",
            modelID: "gpt-5.6-terra",
            chapterPreference: "preferNative",
            summaryModelID: "appleIntelligence",
        },
    });

    assert.equal(elements.get("summary-select").value, "appleIntelligence");
    assert.match(
        elements.get("summary-select").innerHTML,
        /GPT-5\.6 Terra.*Apple Intelligence/
    );
    assert.doesNotMatch(elements.get("summary-select").innerHTML, /Fast Mode|Quality Mode/);
    assert.equal(elements.has("apple-summary-strategy-field"), false);
});

test("Grok 4.5 reasoning is enforced at the final request boundary", () => {
    assert.equal(
        (grokGenerationSource.match(/https:\/\/api\.x\.ai\/v1\/responses/g) || []).length,
        1
    );
    assert.match(
        grokGenerationSource,
        /let reasoning = try Self\.reasoningRequestValue\(forProviderModel: model\)/
    );
    assert.match(grokGenerationSource, /body\["reasoning"\] = reasoning/);
    assert.match(
        grokGenerationSource,
        /!GenerationSettings\.isGrok45ModelID\(model\)[\s\S]{0,100}reasoning == \["effort": "low"\]/
    );
    assert.doesNotMatch(
        grokGenerationSource,
        /requestText\([\s\S]{0,500}reasoningEffort:/
    );
});

test("generation logs omit redundant asking and waiting lifecycle messages", () => {
    assert.doesNotMatch(backgroundSource, /estimatedChunks|estimatedWaves|waves/);
    assert.doesNotMatch(backgroundSource, /asking \$\{.*\} to create/);
    assert.doesNotMatch(backgroundSource, /timeout budget:/);
    assert.doesNotMatch(backgroundSource, /request started/);
    assert.doesNotMatch(backgroundSource, /returned (?:summary|timestamps)/);
    assert.doesNotMatch(backgroundSource, /(?:summary|timestamps) failed:/);
    assert.doesNotMatch(backgroundSource, /caption language:/);

    assert.doesNotMatch(contentSource, /step:/);
    assert.doesNotMatch(backgroundSource, /["']step["']\s*:/);
    assert.doesNotMatch(contentSource, /generationStepDescription|generationWaitDescription/);
    assert.doesNotMatch(contentSource, /transcript: language /);
    assert.match(backgroundSource, /transcriptInputMessage\(transcriptText, metadata\)/);
    assert.equal(
        (contentSource.match(/timeout budget:/g) || []).length,
        1
    );
});

test("generation routing reads settings without refreshing provider sessions", () => {
    assert.match(backgroundSource, /sendNative\("getGenerationSettings"\)/);
    assert.doesNotMatch(
        backgroundSource,
        /generateSelectedProviderTimestamps[\s\S]{0,250}await statusPayload\(\)/
    );
    assert.doesNotMatch(
        backgroundSource,
        /generateConfiguredSummary[\s\S]{0,250}await statusPayload\(\)/
    );
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

test("model option labels are rendered as text rather than executable markup", () => {
    const elements = render({
        codex: { connected: true },
        modelOptions: [
            {
                id: "gpt-safe",
                label: "<img src=x onerror=webkit.messageHandlers.controller.postMessage({action:'signOutCodex'})>",
            },
        ],
        settings: {
            providerID: "openaiCodex",
            modelID: "gpt-safe",
            chapterPreference: "preferNative",
            summaryModelID: "appleIntelligence",
        },
    });
    const modelOption = elements.get("model-select").children[0];

    assert.equal(modelOption.tagName, "OPTION");
    assert.match(modelOption.textContent, /^<img /);
    assert.doesNotMatch(elements.get("model-select").innerHTML, /<img /);
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
