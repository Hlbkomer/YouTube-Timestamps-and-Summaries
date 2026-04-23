const {
    getNavigationURL,
    isVideoURL,
} = globalThis.GeminiYouTubeHelpers;

function isLeftClick(event) {
    return event.button === 0 && !event.defaultPrevented;
}

function hasModifierKey(event) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function navigate(url) {
    window.location.assign(new URL(url, window.location.origin).toString());
}

document.addEventListener("click", (event) => {
    if (!isLeftClick(event) || hasModifierKey(event)) {
        return;
    }

    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor) {
        return;
    }

    const target = anchor.getAttribute("target");
    if (target && target !== "_self") {
        return;
    }

    const href = anchor.href || "";
    if (!isVideoURL(href)) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    navigate(href);
}, true);

document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.key !== "Enter" || hasModifierKey(event)) {
        return;
    }

    const activeElement = document.activeElement instanceof Element ? document.activeElement.closest("a[href]") : null;
    if (!activeElement) {
        return;
    }

    const href = activeElement.href || "";
    if (!isVideoURL(href)) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    navigate(href);
}, true);

document.addEventListener("yt-navigate-start", (event) => {
    const nextURL = getNavigationURL(event);
    if (!isVideoURL(nextURL)) {
        return;
    }

    navigate(nextURL);
});

window.addEventListener("popstate", () => {
    if (!isVideoURL(window.location.href)) {
        return;
    }

    navigate(window.location.href);
});
