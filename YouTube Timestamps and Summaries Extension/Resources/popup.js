const extensionAPI = globalThis.browser || globalThis.chrome;
const chapterSourceSelect = document.getElementById("video-chapter-source");
const nativeChapterOption = document.getElementById("video-chapter-source-native");
const settingsButton = document.getElementById("open-settings");
const errorMessage = document.getElementById("popup-error");
let isRendering = false;

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
    await refreshPageActions();
}

function applyPageActions(response, fallbackEffectiveChapterSource = "") {
    const chapterPreference = response?.chapterPreference || "preferNative";
    const hasExplicitOverride = Boolean(
        response?.chapterSourceOverride
        && response.chapterSourceOverride !== "default"
    );
    const knowsNativeAvailability = Boolean(
        response?.nativeChaptersAvailable
        || response?.effectiveChapterSource
        || hasExplicitOverride
    );
    const nativeChaptersAvailable = knowsNativeAvailability
        ? Boolean(response.nativeChaptersAvailable)
        : true;
    const effectiveChapterSource = response?.effectiveChapterSource
        || fallbackEffectiveChapterSource
        || (chapterPreference === "alwaysGenerate" ? "generated" : "native");

    nativeChapterOption.disabled = knowsNativeAvailability && !nativeChaptersAvailable;
    nativeChapterOption.textContent = nativeChapterOption.disabled
        ? "Native (Not Available)"
        : "Native";
    chapterSourceSelect.value = effectiveChapterSource === "generated" ? "generated" : "native";
    if (chapterSourceSelect.value === "native" && nativeChapterOption.disabled) {
        chapterSourceSelect.value = "generated";
    }
    chapterSourceSelect.disabled = !response?.canSetVideoChapterSource;
}

async function refreshPageActions() {
    isRendering = true;
    chapterSourceSelect.disabled = true;

    const response = await sendMessage({ type: "ai:getPageActions" }).catch(() => null);
    applyPageActions(response);
    isRendering = false;
}

chapterSourceSelect.addEventListener("change", async () => {
    if (isRendering) {
        return;
    }

    const requestedSource = chapterSourceSelect.value === "native" ? "native" : "generated";
    chapterSourceSelect.disabled = true;
    errorMessage.hidden = true;
    errorMessage.textContent = "";

    const response = await sendMessage({
        type: "ai:setVideoChapterSource",
        source: requestedSource,
    }).catch((error) => ({
        ok: false,
        error: error?.message || "Safari could not update this video's chapter source.",
    }));

    if (!response?.ok) {
        errorMessage.textContent = response?.error || "Safari could not update this video's chapter source.";
        errorMessage.hidden = false;
        await refreshPageActions();
        return;
    }

    applyPageActions(response, requestedSource);
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
