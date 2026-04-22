const clientIDInput = document.getElementById("client-id");
const clientSecretInput = document.getElementById("client-secret");
const projectIDInput = document.getElementById("project-id");
const modelSelect = document.getElementById("model");
const timestampsPromptInput = document.getElementById("timestamps-prompt");
const summaryPromptInput = document.getElementById("summary-prompt");
const extensionStatus = document.getElementById("extension-status");
const connectionStatus = document.getElementById("connection-status");
const messageBanner = document.getElementById("message");
const setupTitle = document.getElementById("setup-title");
const configFields = document.getElementById("config-fields");
const saveConfigButton = document.getElementById("save-config");
const savePromptsButton = document.getElementById("save-prompts");
const resetPromptsButton = document.getElementById("reset-prompts");
const setupHint = document.getElementById("setup-hint");
const checklist = document.getElementById("checklist");
const signInButton = document.getElementById("sign-in");
const signOutButton = document.getElementById("sign-out");

function post(action, extra = {}) {
    webkit.messageHandlers.controller.postMessage({ action, ...extra });
}

function settingsLabel(useSettingsLabel) {
    return useSettingsLabel ? "Settings" : "Preferences";
}

function renderChecklist(usesBundledConfig) {
    const items = usesBundledConfig
        ? [
            "Run this app and click <strong>Sign In With Google</strong>.",
            "Open Safari Extension Settings and turn the extension on.",
            "Choose a Gemini model and adjust the prompts below if you want to customize generation.",
            "Open a YouTube watch page in Safari.",
            "<strong>Timestamps</strong> generate automatically. Open <strong>Summary</strong> when you want the recap.",
        ]
        : [
            "Create or choose a Google Cloud project.",
            "Enable the Google Generative Language API.",
            "Create an OAuth client of type <strong>Desktop app</strong>.",
            "Paste the OAuth Client ID, Client Secret, and Project ID here, then sign in.",
            "Choose a Gemini model and review the prompts below so Gemini returns the format you want.",
            "Open a YouTube watch page in Safari. Timestamps generate automatically, and Summary runs on click.",
        ];

    checklist.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

window.renderAppState = function renderAppState(state) {
    const usesBundledConfig = Boolean(state.usesBundledConfig);
    const isSignedIn = Boolean(state.isSignedIn);
    const isSigningIn = Boolean(state.isSigningIn);

    clientIDInput.value = state.clientID ?? "";
    clientSecretInput.value = state.clientSecret ?? "";
    projectIDInput.value = state.projectID ?? "";
    modelSelect.value = state.selectedModel ?? "gemini-3-flash-preview";
    timestampsPromptInput.value = state.timestampsPrompt ?? "";
    summaryPromptInput.value = state.summaryPrompt ?? "";
    configFields.hidden = usesBundledConfig;
    saveConfigButton.hidden = usesBundledConfig;
    setupHint.hidden = usesBundledConfig;
    setupTitle.textContent = usesBundledConfig ? "Google sign-in" : "Google Cloud values";
    renderChecklist(usesBundledConfig);
    signOutButton.hidden = !isSignedIn;
    signOutButton.disabled = !isSignedIn || isSigningIn;
    signInButton.disabled = isSigningIn || isSignedIn;
    signInButton.textContent = isSigningIn
        ? "Opening Browser..."
        : (isSignedIn ? "Connected To Google" : "Sign In With Google");

    const label = settingsLabel(Boolean(state.usesSettingsLabel));

    if (typeof state.extensionEnabled === "boolean") {
        extensionStatus.textContent = state.extensionEnabled
            ? "The Safari extension is enabled."
            : `The Safari extension is disabled. Open Safari ${label} and turn it on.`;
    } else {
        extensionStatus.textContent = `Safari ${label} can show whether the extension is enabled after the app finishes checking.`;
    }

    if (isSignedIn) {
        connectionStatus.textContent = "Google is connected.";
        connectionStatus.dataset.state = "connected";
    } else if (isSigningIn) {
        connectionStatus.textContent = "Finish the Google sign-in flow in your browser, then return here.";
        connectionStatus.dataset.state = "configured";
    } else if (state.isConfigured) {
        connectionStatus.textContent = usesBundledConfig
            ? "This build already includes the Gemini setup. Finish by signing in with Google."
            : "Setup is saved. Finish by signing in with Google.";
        connectionStatus.dataset.state = "configured";
    } else {
        connectionStatus.textContent = "Add your OAuth Client ID and Project ID to finish Gemini setup.";
        if (!usesBundledConfig) {
            connectionStatus.textContent = "Add your OAuth Client ID, Client Secret, and Project ID to finish Gemini setup.";
        }
        connectionStatus.dataset.state = "missing";
    }

    if (state.message) {
        messageBanner.hidden = false;
        messageBanner.textContent = state.message;
    } else {
        messageBanner.hidden = true;
        messageBanner.textContent = "";
    }

    document.getElementById("open-preferences").textContent = `Open Safari Extension ${label}`;
};

document.getElementById("save-config").addEventListener("click", () => {
    post("saveConfig", {
        clientID: clientIDInput.value,
        clientSecret: clientSecretInput.value,
        projectID: projectIDInput.value,
    });
});

document.getElementById("sign-in").addEventListener("click", () => {
    post("startSignIn");
});

document.getElementById("sign-out").addEventListener("click", () => {
    post("signOut");
});

savePromptsButton.addEventListener("click", () => {
    post("savePrompts", {
        selectedModel: modelSelect.value,
        timestampsPrompt: timestampsPromptInput.value,
        summaryPrompt: summaryPromptInput.value,
    });
});

resetPromptsButton.addEventListener("click", () => {
    post("resetPrompts");
});

document.getElementById("open-preferences").addEventListener("click", () => {
    post("openPreferences");
});

post("ready");
