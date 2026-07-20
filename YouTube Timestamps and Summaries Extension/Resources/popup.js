const extensionAPI = globalThis.browser;
const settingsButton = document.getElementById("open-settings");
const errorMessage = document.getElementById("popup-error");

async function sendMessage(message) {
    return await extensionAPI.runtime.sendMessage(message);
}

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
