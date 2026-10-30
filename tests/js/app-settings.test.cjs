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
const codexGenerationSource = fs.readFileSync(
    path.join(root, "YouTube Timestamps and Summaries Extension/CodexGenerationService.swift"),
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
        listeners: {},
        addEventListener(name, handler) { this.listeners[name] = handler; },
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
    elements.postedMessages = [];
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
                controller: { postMessage(message) { elements.postedMessages.push(message); } },
            },
        },
        window,
    });

    vm.runInContext(scriptSource, context);
    window.renderAppState({
        providerOptions: [
            { id: "openaiCodex", label: "ChatGPT / Codex" },
            { id: "xaiOAuth", label: "Grok (SuperGrok)" },
            { id: "googleGemini", label: "Gemini" },
        ],
        modelOptions: [],
        chapterPreferenceOptions: [],
        summaryOptions: [],
        settings: {
            providerID: "openaiCodex",
            modelID: "gpt-6.1-sol",
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

test("Apple Intelligence uses one Summary model choice", () => {
    const elements = render({
        summaryOptions: [
            { id: "appleIntelligence", label: "Apple Intelligence" },
            { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
        ],
        settings: {
            providerID: "openaiCodex",
            modelID: "gpt-6.1-sol",
            chapterPreference: "preferNative",
            summaryModelID: "appleIntelligence",
        },
    });

    assert.equal(elements.get("summary-select").value, "appleIntelligence");
    assert.match(
        elements.get("summary-select").innerHTML,
        /Apple Intelligence.*GPT-6\.1 Sol/
    );
    assert.equal(
        (elements.get("summary-select").innerHTML.match(/<option/g) || []).length,
        2
    );
});

test("GPT-6.1 Sol and GPT-6 Luna can be selected independently for Chapters and Summary", () => {
    const models = [
        { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
        { id: "gpt-6-luna", label: "GPT-6 Luna" },
    ];
    const elements = render({
        codex: { connected: true },
        modelOptions: models,
        summaryOptions: models,
        settings: {
            providerID: "openaiCodex",
            modelID: "gpt-6.1-sol",
            summaryModelID: "gpt-6-luna",
            chapterPreference: "preferNative",
        },
    });
    assert.equal(elements.get("model-select").value, "gpt-6.1-sol");
    assert.equal(elements.get("summary-select").value, "gpt-6-luna");
    assert.match(elements.get("summary-select").innerHTML, /GPT-6\.1 Sol/);
});

test("ChatGPT model reasoning policy reaches the common Chapters/Summary request boundary", () => {
    assert.match(codexGenerationSource, /GenerationSettings\.chatGPTReasoningRequestValue\(for: model\)/);
    assert.match(codexGenerationSource, /body\["reasoning"\] = reasoning/);
    assert.doesNotMatch(codexGenerationSource, /"(?:temperature|top_p|top_logprobs|prompt_cache_retention)"/);
});

test("Grok 4.5 through 4.7 low reasoning is enforced at the final request boundary", () => {
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
        /!GenerationSettings\.requiresExplicitLowGrokReasoning\(model\)[\s\S]{0,100}reasoning == \["effort": "low"\]/
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

test("missing ChatGPT model selection falls back to GPT-6 Luna", () => {
    const elements = render({
        codex: { connected: true },
        grok: { connected: false },
        modelOptions: [
            { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
            { id: "gpt-6-luna", label: "GPT-6 Luna" },
        ],
        settings: {
            providerID: "openaiCodex",
            chapterPreference: "preferNative",
            summaryModelID: "appleIntelligence",
        },
    });

    assert.equal(elements.get("model-select").value, "gpt-6-luna");
});


test("Gemini connection enables its models and keeps Apple Summary selectable", () => {
    const models = [
        { id: "gemini-4-argon", label: "Gemini 4 Argon" },
        { id: "gemini-flash-latest", label: "Gemini Flash (latest)" },
        { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
    ];
    const elements = render({
        gemini: { connected: true },
        settings: { providerID: "googleGemini", modelID: "gemini-flash-latest", summaryModelID: "appleIntelligence" },
        modelOptions: models,
        summaryOptions: [
            { id: "appleIntelligence", label: "Apple Intelligence" },
            ...models,
        ],
    });
    assert.equal(elements.get("provider-select").disabled, false);
    assert.equal(elements.get("provider-select").dataset.selectedUnavailable, "false");
    assert.equal(elements.get("model-select").disabled, false);
    assert.equal(elements.get("summary-select").value, "appleIntelligence");
    assert.equal(elements.get("model-select").value, "gemini-flash-latest");
    assert.match(elements.get("summary-select").innerHTML, /Apple Intelligence.*Gemini 4 Argon.*Gemini Flash.*Gemini 3\.5 Flash-Lite/);
    assert.equal(elements.get("gemini-status").textContent, "Gemini is connected.");
    assert.equal(elements.get("gemini-api-key").value, "");
    assert.equal(elements.get("gemini-disconnect").hidden, false);
    assert.equal(elements.get("gemini-api-key").disabled, true);
    assert.equal(elements.get("gemini-connect").hidden, true);
    elements.get("gemini-connect").listeners.click();
    assert.equal(elements.postedMessages.filter((message) => message.action === "connectGemini").length, 0);
});

test("Gemini key submission clears the password field and disables duplicate connection attempts", () => {
    const elements = render({ gemini: { connected: false } });
    const key = elements.get("gemini-api-key");
    const button = elements.get("gemini-connect");
    key.value = "fake-private-key";
    button.listeners.click();
    assert.equal(key.value, "");
    assert.equal(key.disabled, true);
    assert.equal(button.disabled, true);
    assert.equal(elements.postedMessages.at(-1).action, "connectGemini");
    assert.equal(elements.postedMessages.at(-1).apiKey, "fake-private-key");
    button.listeners.click();
    assert.equal(elements.postedMessages.filter((message) => message.action === "connectGemini").length, 1);
});

test("Gemini validation state and errors are visible without enabling a disconnected provider", () => {
    const pending = render({ gemini: { connecting: true } });
    assert.equal(pending.get("gemini-connect").disabled, true);
    assert.equal(pending.get("gemini-api-key").disabled, true);
    const failed = render({ gemini: { connected: false, error: "Google rejected this API key." } });
    assert.equal(failed.get("gemini-status").textContent, "Google rejected this API key.");
    assert.match(failed.get("provider-select").innerHTML, /value="googleGemini" disabled/);
    assert.equal(failed.get("gemini-connect").disabled, false);
});
