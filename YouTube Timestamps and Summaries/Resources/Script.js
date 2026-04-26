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
const codexSignInButton = document.getElementById("codex-sign-in");
const codexSignOutButton = document.getElementById("codex-sign-out");
const copyCodexCodeButton = document.getElementById("copy-codex-code");

function post(action, extra = {}) {
    webkit.messageHandlers.controller.postMessage({ action, ...extra });
}

function settingsLabel(useSettingsLabel) {
    return useSettingsLabel ? "Settings" : "Preferences";
}

function renderChecklist() {
    const items = [
        "Choose the model used for timestamps and summary.",
        "Sign in with ChatGPT.",
        "Enable the Safari extension.",
        "Open a YouTube video with captions or a transcript.",
        "<strong>Timestamps</strong> and <strong>Summary</strong> will appear automatically.",
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

function selectedModelLabel() {
    const selectedOption = modelSelect.options[modelSelect.selectedIndex];
    return selectedOption?.textContent || "Selected model";
}

function syncSummaryModelLabel() {
    const option = Array.from(summarySelect.options).find((item) => item.value === "selectedModel");
    if (option) {
        option.textContent = selectedModelLabel();
    }
}

function saveGenerationSettings() {
    post("saveGenerationSettings", {
        providerID: providerSelect.value,
        modelID: modelSelect.value,
        summaryEngine: summarySelect.value,
    });
}

window.renderAppState = function renderAppState(state) {
    renderChecklist();

    const label = settingsLabel(Boolean(state.usesSettingsLabel));
    const settings = state.settings || {};

    renderOptions(providerSelect, state.providerOptions || [], settings.providerID || "openaiCodex");
    renderOptions(modelSelect, state.modelOptions || [], settings.modelID || "gpt-5.5");
    renderOptions(summarySelect, state.summaryOptions || [], settings.summaryEngine || "selectedModel");
    syncSummaryModelLabel();

    if (state.codex?.connected) {
        codexStatus.textContent = "ChatGPT is connected.";
        codexStatus.dataset.state = "connected";
        codexSignInButton.hidden = true;
        codexSignOutButton.hidden = false;
    } else {
        codexStatus.textContent = state.codex?.error
            ? `ChatGPT is not connected: ${state.codex.error}`
            : "ChatGPT is not connected.";
        codexStatus.dataset.state = "missing";
        codexSignInButton.hidden = false;
        codexSignOutButton.hidden = true;
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
    syncSummaryModelLabel();
    saveGenerationSettings();
});

summarySelect.addEventListener("change", saveGenerationSettings);

codexSignInButton.addEventListener("click", () => {
    post("startCodexLogin");
});

codexSignOutButton.addEventListener("click", () => {
    post("signOutCodex");
});

copyCodexCodeButton.addEventListener("click", () => {
    post("copyCodexCode");
});

post("ready");
