const STORAGE_KEY = "extensionEnabled";
const extensionAPI = globalThis.browser || globalThis.chrome;
const enabledCheckbox = document.getElementById("extension-enabled");
const settingsButton = document.getElementById("open-settings");
const errorMessage = document.getElementById("popup-error");

async function storageGet(defaults) {
    const result = extensionAPI.storage.local.get(defaults);
    if (result && typeof result.then === "function") {
        return await result;
    }

    return await new Promise((resolve) => {
        extensionAPI.storage.local.get(defaults, resolve);
    });
}

async function storageSet(values) {
    const result = extensionAPI.storage.local.set(values);
    if (result && typeof result.then === "function") {
        await result;
        return;
    }

    await new Promise((resolve) => {
        extensionAPI.storage.local.set(values, resolve);
    });
}

async function sendMessage(message) {
    const result = extensionAPI.runtime.sendMessage(message);
    if (result && typeof result.then === "function") {
        return await result;
    }

    return await new Promise((resolve) => {
        extensionAPI.runtime.sendMessage(message, resolve);
    });
}

async function restoreState() {
    const stored = await storageGet({ [STORAGE_KEY]: true });
    enabledCheckbox.checked = stored[STORAGE_KEY] !== false;
}

enabledCheckbox.addEventListener("change", () => {
    void storageSet({ [STORAGE_KEY]: enabledCheckbox.checked });
});

settingsButton.addEventListener("click", async () => {
    settingsButton.disabled = true;
    errorMessage.hidden = true;
    errorMessage.textContent = "";

    const response = await sendMessage({ type: "ai:openApp" }).catch((error) => ({
        ok: false,
        error: error?.message || "Safari could not open the companion app.",
    }));

    if (response?.ok) {
        window.close();
        return;
    }

    errorMessage.textContent = response?.error || "Safari could not open the companion app.";
    errorMessage.hidden = false;
    settingsButton.disabled = false;
});

void restoreState();
