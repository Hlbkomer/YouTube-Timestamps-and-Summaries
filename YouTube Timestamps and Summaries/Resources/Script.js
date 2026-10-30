const extensionStatus = document.getElementById("extension-status");
const codexStatus = document.getElementById("codex-status");
const codexPairing = document.getElementById("codex-pairing");
const codexCode = document.getElementById("codex-code");
const messageBanner = document.getElementById("message");
const checklist = document.getElementById("checklist");
const openPreferencesButton = document.getElementById("open-preferences");
const providerSelect = document.getElementById("provider-select");
const modelSelect = document.getElementById("model-select");
const chapterPreferenceSelect = document.getElementById("chapter-preference-select");
const summarySelect = document.getElementById("summary-select");
const codexSignInButton = document.getElementById("codex-sign-in");
const codexSignOutButton = document.getElementById("codex-sign-out");
const copyCodexCodeButton = document.getElementById("copy-codex-code");
const grokStatus = document.getElementById("grok-status");
const grokSignInButton = document.getElementById("grok-sign-in");
const grokSignOutButton = document.getElementById("grok-sign-out");
const grokPairing = document.getElementById("grok-pairing");
const grokCallback = document.getElementById("grok-callback");
const completeGrokLoginButton = document.getElementById("complete-grok-login");
const cancelGrokLoginButton = document.getElementById("cancel-grok-login");
const geminiStatus = document.getElementById("gemini-status");
const geminiKey = document.getElementById("gemini-api-key");
const geminiConnectButton = document.getElementById("gemini-connect");
const geminiDisconnectButton = document.getElementById("gemini-disconnect");
const geminiAPIKeysButton = document.getElementById("gemini-api-keys");

function post(action, extra = {}) {
    webkit.messageHandlers.controller.postMessage({ action, ...extra });
}

function settingsLabel(useSettingsLabel) {
    return useSettingsLabel ? "Settings" : "Preferences";
}

function renderChecklist() {
    const items = [
        "Optional: Connect ChatGPT, Grok, or Gemini for Timestamps and model-powered Summaries.",
        "Choose the models used for Timestamps and Summary.",
        "Enable the Safari extension.",
        "Open a YouTube video with captions or a transcript.",
        "<strong>Summary</strong> appears automatically. <strong>Timestamps</strong> appear when the selected provider is ready.",
    ];
    checklist.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

function renderOptions(select, options, selectedID) {
    const currentValue = select.value || selectedID;
    select.replaceChildren();
    for (const optionData of options) {
        const option = document.createElement("option");
        option.value = String(optionData.id || "");
        option.textContent = String(optionData.label || optionData.id || "");
        option.disabled = Boolean(optionData.disabled);
        select.append(option);
    }
    select.value = selectedID || currentValue;
}

function providerIsConnected(providerID, state) {
    if (providerID === "openaiCodex") {
        return Boolean(state.codex?.connected);
    }
    if (providerID === "xaiOAuth") {
        return Boolean(state.grok?.connected);
    }
    if (providerID === "googleGemini") {
        return Boolean(state.gemini?.connected);
    }
    return false;
}

function summaryModelUsesAppleIntelligence(modelID) {
    return String(modelID || "").startsWith("appleIntelligence");
}

function saveGenerationSettings() {
    post("saveGenerationSettings", {
        providerID: providerSelect.value,
        modelID: modelSelect.value,
        chapterPreference: chapterPreferenceSelect.value || "preferNative",
        summaryEngine: summaryModelUsesAppleIntelligence(summarySelect.value)
            ? "appleIntelligence"
            : "selectedModel",
        summaryModelID: summarySelect.value,
    });
}

window.renderAppState = function renderAppState(state) {
    renderChecklist();

    const label = settingsLabel(Boolean(state.usesSettingsLabel));
    const settings = state.settings || {};
    const selectedProviderID = settings.providerID || "openaiCodex";
    const providerOptions = (state.providerOptions || []).map((option) => ({
        ...option,
        disabled: !providerIsConnected(option.id, state),
    }));
    const selectedProviderConnected = providerIsConnected(selectedProviderID, state);

    renderOptions(providerSelect, providerOptions, selectedProviderID);
    renderOptions(modelSelect, state.modelOptions || [], settings.modelID || "gpt-6-luna");
    renderOptions(chapterPreferenceSelect, state.chapterPreferenceOptions || [], settings.chapterPreference || "preferNative");
    renderOptions(
        summarySelect,
        state.summaryOptions || [],
        settings.summaryModelID || settings.modelID || "appleIntelligence",
    );

    const chatGPTConnected = Boolean(state.codex?.connected);
    providerSelect.disabled = providerOptions.length === 0 || providerOptions.every((option) => option.disabled);
    providerSelect.dataset.selectedUnavailable = String(!selectedProviderConnected);
    modelSelect.disabled = !selectedProviderConnected;

    if (chatGPTConnected) {
        codexStatus.textContent = "ChatGPT is connected.";
        codexStatus.dataset.state = "connected";
        codexSignInButton.hidden = true;
        codexSignOutButton.hidden = false;
    } else {
        codexStatus.textContent = "ChatGPT is not connected.";
        codexStatus.dataset.state = "missing";
        codexSignInButton.hidden = false;
        codexSignOutButton.hidden = true;
    }

    const grokConnected = Boolean(state.grok?.connected);
    const grokLoginInProgress = Boolean(state.grokLogin);
    if (grokConnected) {
        grokStatus.textContent = "Grok is connected.";
        grokStatus.dataset.state = "connected";
        grokSignInButton.hidden = true;
        grokSignOutButton.hidden = false;
    } else {
        grokStatus.textContent = "Grok is not connected.";
        grokStatus.dataset.state = "missing";
        grokSignInButton.hidden = false;
        grokSignOutButton.hidden = true;
    }

    if (grokLoginInProgress) {
        grokPairing.hidden = false;
        grokSignInButton.textContent = "Signing in...";
        grokSignInButton.disabled = true;
        completeGrokLoginButton.disabled = false;
        cancelGrokLoginButton.disabled = false;
    } else {
        grokPairing.hidden = true;
        grokCallback.value = "";
        grokSignInButton.textContent = "Sign in with Grok";
        grokSignInButton.disabled = false;
        completeGrokLoginButton.disabled = false;
        cancelGrokLoginButton.disabled = false;
    }

    const geminiConnected = Boolean(state.gemini?.connected);
    const geminiConnecting = Boolean(state.gemini?.connecting);
    geminiStatus.textContent = geminiConnecting
        ? "Checking Gemini API access..."
        : (state.gemini?.error || (geminiConnected ? "Gemini is connected." : "Gemini is not connected."));
    geminiStatus.dataset.state = geminiConnecting ? "configured" : (geminiConnected ? "connected" : "missing");
    geminiConnectButton.textContent = geminiConnecting ? "Checking..." : "Connect Gemini";
    geminiConnectButton.hidden = geminiConnected;
    geminiConnectButton.disabled = geminiConnecting || geminiConnected;
    geminiKey.disabled = geminiConnecting || geminiConnected;
    if (geminiConnected) {
        geminiKey.value = "";
    }
    geminiKey.placeholder = geminiConnected ? "API key saved in Keychain" : "Paste your Google AI Studio API key";
    geminiDisconnectButton.hidden = !geminiConnected;
    geminiDisconnectButton.disabled = geminiConnecting;

    if (state.codexLogin) {
        codexPairing.hidden = false;
        codexCode.textContent = state.codexLogin.userCode || "";
        codexSignInButton.textContent = "Signing in...";
        codexSignInButton.disabled = true;
    } else {
        codexPairing.hidden = true;
        codexCode.textContent = "";
        codexSignInButton.textContent = "Sign in with ChatGPT";
        codexSignInButton.disabled = false;
    }

    if (typeof state.extensionEnabled === "boolean") {
        extensionStatus.textContent = state.extensionEnabled
            ? "The Safari extension is enabled."
            : `The Safari extension is disabled. Open Safari ${label} and turn it on.`;
    } else {
        extensionStatus.textContent = `Safari ${label} can show whether the extension is enabled after the app finishes checking.`;
    }

    if (state.message) {
        messageBanner.hidden = false;
        messageBanner.textContent = state.message;
    } else {
        messageBanner.hidden = true;
        messageBanner.textContent = "";
    }

    openPreferencesButton.textContent = `Open Safari Extension ${label}`;
};

openPreferencesButton.addEventListener("click", () => {
    post("openPreferences");
});

providerSelect.addEventListener("change", saveGenerationSettings);

modelSelect.addEventListener("change", () => {
    saveGenerationSettings();
});

chapterPreferenceSelect.addEventListener("change", saveGenerationSettings);

summarySelect.addEventListener("change", saveGenerationSettings);

codexSignInButton.addEventListener("click", () => {
    post("startCodexLogin");
});

codexSignOutButton.addEventListener("click", () => {
    post("signOutCodex");
});

grokSignInButton.addEventListener("click", () => {
    post("startGrokLogin");
});

grokSignOutButton.addEventListener("click", () => {
    post("signOutGrok");
});

completeGrokLoginButton.addEventListener("click", () => {
    post("completeGrokLogin", { callback: grokCallback.value });
});

cancelGrokLoginButton.addEventListener("click", () => {
    post("cancelGrokLogin");
});

copyCodexCodeButton.addEventListener("click", () => {
    post("copyCodexCode");
});

function connectGemini() {
    if (geminiConnectButton.disabled) {
        return;
    }
    const apiKey = geminiKey.value;
    geminiKey.value = "";
    geminiConnectButton.disabled = true;
    geminiKey.disabled = true;
    geminiDisconnectButton.disabled = true;
    post("connectGemini", { apiKey });
}

geminiConnectButton.addEventListener("click", connectGemini);
geminiKey.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        connectGemini();
    }
});
geminiDisconnectButton.addEventListener("click", () => post("disconnectGemini"));
geminiAPIKeysButton.addEventListener("click", () => post("openGeminiAPIKeys"));

post("ready");
