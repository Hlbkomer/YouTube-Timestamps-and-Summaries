const extensionStatus = document.getElementById("extension-status");
const codexStatus = document.getElementById("codex-status");
const codexPairing = document.getElementById("codex-pairing");
const codexCode = document.getElementById("codex-code");
const messageBanner = document.getElementById("message");
const checklist = document.getElementById("checklist");
const openPreferencesButton = document.getElementById("open-preferences");
const providerSelect = document.getElementById("provider-select");
const modelSelect = document.getElementById("model-select");
const summarySelect = document.getElementById("summary-select");
const generationSetupHint = document.getElementById("generation-setup-hint");
const codexSignInButton = document.getElementById("codex-sign-in");
const codexSignOutButton = document.getElementById("codex-sign-out");
const copyCodexCodeButton = document.getElementById("copy-codex-code");
const grokStatus = document.getElementById("grok-status");
const grokSubscriptionHint = document.getElementById("grok-subscription-hint");
const grokSignInButton = document.getElementById("grok-sign-in");
const grokSignOutButton = document.getElementById("grok-sign-out");
const grokPairing = document.getElementById("grok-pairing");
const grokCallback = document.getElementById("grok-callback");
const completeGrokLoginButton = document.getElementById("complete-grok-login");
const cancelGrokLoginButton = document.getElementById("cancel-grok-login");

function post(action, extra = {}) {
    webkit.messageHandlers.controller.postMessage({ action, ...extra });
}

function settingsLabel(useSettingsLabel) {
    return useSettingsLabel ? "Settings" : "Preferences";
}

function renderChecklist() {
    const items = [
        "Optional: Connect ChatGPT or Grok for Timestamps and model-powered Summaries.",
        "Choose the models used for Timestamps and Summary.",
        "Enable the Safari extension.",
        "Open a YouTube video with captions or a transcript.",
        "<strong>Summary</strong> appears automatically. <strong>Timestamps</strong> appear when the selected provider is ready.",
    ];
    checklist.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

function renderOptions(select, options, selectedID) {
    const currentValue = select.value || selectedID;
    select.innerHTML = options
        .map((option) => `<option value="${option.id}">${option.label}</option>`)
        .join("");
    select.value = selectedID || currentValue;
}

function saveGenerationSettings() {
    post("saveGenerationSettings", {
        providerID: providerSelect.value,
        modelID: modelSelect.value,
        summaryEngine: summarySelect.value === "appleIntelligence" ? "appleIntelligence" : "selectedModel",
        summaryModelID: summarySelect.value,
    });
}

window.renderAppState = function renderAppState(state) {
    renderChecklist();

    const label = settingsLabel(Boolean(state.usesSettingsLabel));
    const settings = state.settings || {};

    renderOptions(providerSelect, state.providerOptions || [], settings.providerID || "openaiCodex");
    renderOptions(modelSelect, state.modelOptions || [], settings.modelID || "gpt-5.5");
    renderOptions(summarySelect, state.summaryOptions || [], settings.summaryModelID || settings.modelID || "appleIntelligence");

    const chatGPTConnected = Boolean(state.codex?.connected);
    const selectedProviderConnected = Boolean(state.selectedProviderConnected);
    providerSelect.disabled = false;
    modelSelect.disabled = !selectedProviderConnected;
    generationSetupHint.textContent = selectedProviderConnected
        ? ""
        : "Connect the selected provider to enable its timestamp model settings.";

    if (chatGPTConnected) {
        codexStatus.textContent = "ChatGPT is connected.";
        codexStatus.dataset.state = "connected";
        codexSignInButton.hidden = true;
        codexSignOutButton.hidden = false;
    } else {
        codexStatus.textContent = state.codex?.error
            ? `ChatGPT is not connected: ${state.codex.error}`
            : "ChatGPT is not connected. Apple Intelligence summaries still work when available.";
        codexStatus.dataset.state = "missing";
        codexSignInButton.hidden = false;
        codexSignOutButton.hidden = true;
    }

    const grokConnected = Boolean(state.grok?.connected);
    const grokLoginInProgress = Boolean(state.grokLogin);
    grokSubscriptionHint.hidden = grokConnected;
    if (grokConnected) {
        grokStatus.textContent = "Grok is connected.";
        grokStatus.dataset.state = "connected";
        grokSignInButton.hidden = true;
        grokSignOutButton.hidden = false;
    } else {
        grokStatus.textContent = state.grok?.error
            ? `Grok is not connected: ${state.grok.error}`
            : "Grok is not connected.";
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

post("ready");
