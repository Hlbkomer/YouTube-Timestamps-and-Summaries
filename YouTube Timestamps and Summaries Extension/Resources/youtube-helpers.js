(function (globalScope) {
    function parseURL(url, origin = "https://www.youtube.com") {
        try {
            return new URL(url, origin);
        } catch (_) {
            return null;
        }
    }

    function isWatchURL(url, origin) {
        const parsed = parseURL(url, origin);
        return Boolean(parsed) && parsed.pathname === "/watch" && Boolean(parsed.searchParams.get("v"));
    }

    function isShortsURL(url, origin) {
        const parsed = parseURL(url, origin);
        return Boolean(parsed) && parsed.pathname.startsWith("/shorts/");
    }

    function isVideoURL(url, origin) {
        const parsed = parseURL(url, origin);
        return Boolean(parsed) && (
            (parsed.pathname === "/watch" && Boolean(parsed.searchParams.get("v")))
            || parsed.pathname.startsWith("/live/")
        );
    }

    function getNavigationURL(event, origin = "https://www.youtube.com") {
        const candidates = [
            event?.detail?.url,
            event?.detail?.endpoint?.commandMetadata?.webCommandMetadata?.url,
            event?.detail?.response?.currentEndpoint?.commandMetadata?.webCommandMetadata?.url,
            event?.detail?.pageUrl,
        ];

        for (const candidate of candidates) {
            if (typeof candidate === "string" && candidate.trim()) {
                const parsed = parseURL(candidate, origin);
                if (parsed) {
                    return parsed.toString();
                }
            }
        }

        return "";
    }

    function getNavigationResponse(event) {
        const candidates = [
            event?.detail?.response,
            event?.detail?.pageData?.response,
            event?.detail?.pageData,
        ];

        return candidates.find((candidate) => (
            candidate
            && typeof candidate === "object"
            && !Array.isArray(candidate)
        )) || null;
    }

    function getNavigationResponseVideoKey(response) {
        const directVideoKey = response?.playerResponse?.videoDetails?.videoId
            || response?.response?.playerResponse?.videoDetails?.videoId
            || response?.videoDetails?.videoId
            || response?.currentEndpoint?.watchEndpoint?.videoId
            || "";
        if (typeof directVideoKey === "string" && directVideoKey.trim()) {
            return directVideoKey.trim();
        }

        const endpointURL = response?.currentEndpoint
            ?.commandMetadata
            ?.webCommandMetadata
            ?.url;
        return extractVideoKey({ currentUrl: endpointURL || "" });
    }

    function extractVideoKey({
        currentUrl = "",
        canonicalHref = "",
        ogUrl = "",
        playerVideoId = "",
        pathname = "",
    } = {}) {
        const current = parseURL(currentUrl);
        const queryParam = current?.searchParams.get("v");
        if (queryParam) {
            return queryParam;
        }

        for (const candidate of [canonicalHref, ogUrl]) {
            const parsed = parseURL(candidate);
            const videoId = parsed?.searchParams.get("v");
            if (videoId) {
                return videoId;
            }
        }

        if (typeof playerVideoId === "string" && playerVideoId.trim()) {
            return playerVideoId.trim();
        }

        const livePath = pathname || current?.pathname || "";
        const livePathMatch = livePath.match(/^\/live\/([^/?#]+)/);
        if (livePathMatch) {
            return livePathMatch[1];
        }

        return "";
    }

    function timeToSeconds(time) {
        const parts = String(time ?? "").split(":").map(Number);
        if (parts.length < 2 || parts.some(Number.isNaN)) {
            return 0;
        }

        if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        }

        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    function secondsToTimestamp(seconds) {
        const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const remainingSeconds = totalSeconds % 60;
        const twoDigits = (value) => String(value).padStart(2, "0");

        if (hours > 0) {
            return `${hours}:${twoDigits(minutes)}:${twoDigits(remainingSeconds)}`;
        }

        return `${minutes}:${twoDigits(remainingSeconds)}`;
    }

    function parseTimestamps(text) {
        return String(text ?? "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const match = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*[-|\u2013\u2014]\s*|\s+)(.+)$/);
                if (!match) {
                    return null;
                }

                return {
                    time: match[1],
                    label: match[2],
                    seconds: timeToSeconds(match[1]),
                };
            })
            .filter(Boolean);
    }

    function textFromRuns(value) {
        if (typeof value?.simpleText === "string") {
            return value.simpleText;
        }

        if (typeof value?.content === "string") {
            return value.content;
        }

        if (Array.isArray(value?.runs)) {
            return value.runs.map((run) => run?.text || "").join("");
        }

        return "";
    }

    function firstFiniteNumber(values) {
        for (const value of values) {
            if (value === null || typeof value === "undefined" || value === "") {
                continue;
            }

            const number = Number(value);
            if (Number.isFinite(number)) {
                return number;
            }
        }

        return 0;
    }

    function macroMarkerStartSeconds(renderer) {
        const repeat = renderer?.repeatButton?.toggleButtonRenderer?.defaultServiceEndpoint?.repeatChapterCommand;
        const watchEndpoint = renderer?.onTap?.watchEndpoint
            || renderer?.navigationEndpoint?.watchEndpoint
            || renderer?.endpoint?.watchEndpoint;
        const timeDescription = textFromRuns(renderer?.timeDescription);
        const timeDescriptionSeconds = /\d{1,2}:\d{2}(?::\d{2})?/.test(timeDescription)
            ? timeToSeconds(timeDescription)
            : null;
        const startMs = firstFiniteNumber([
            repeat?.startTimeMs,
            renderer?.timeRangeStartMillis,
        ]);

        if (startMs > 0) {
            return Math.floor(startMs / 1000);
        }

        return firstFiniteNumber([
            watchEndpoint?.startTimeSeconds,
            timeDescriptionSeconds,
            0,
        ]);
    }

    function chapterItem(title, seconds) {
        const label = String(title || "").replace(/\s+/g, " ").trim();
        if (!label) {
            return null;
        }

        return {
            time: secondsToTimestamp(seconds),
            label,
            seconds: Math.max(0, Math.floor(Number(seconds) || 0)),
        };
    }

    function parseMacroMarkerChapters(initialData) {
        const panels = Array.isArray(initialData?.engagementPanels)
            ? initialData.engagementPanels
            : [];
        const chapters = [];

        for (const panel of panels) {
            const renderer = panel?.engagementPanelSectionListRenderer;
            const contents = renderer?.content?.macroMarkersListRenderer?.contents;
            if (!Array.isArray(contents)) {
                continue;
            }

            for (const item of contents) {
                const marker = item?.macroMarkersListItemRenderer;
                if (!marker) {
                    continue;
                }

                const chapter = chapterItem(
                    textFromRuns(marker.title),
                    macroMarkerStartSeconds(marker),
                );
                if (chapter) {
                    chapters.push(chapter);
                }
            }
        }

        return uniqueChapters(chapters);
    }

    function parseNestedMacroMarkerChapters(initialData) {
        if (!initialData || typeof initialData !== "object") {
            return [];
        }

        const chapters = [];
        const pending = [initialData];
        const visited = new WeakSet();

        while (pending.length > 0) {
            const value = pending.pop();
            if (!value || typeof value !== "object" || visited.has(value)) {
                continue;
            }
            visited.add(value);

            const marker = value.macroMarkersListItemRenderer;
            if (marker) {
                const chapter = chapterItem(
                    textFromRuns(marker.title),
                    macroMarkerStartSeconds(marker),
                );
                if (chapter) {
                    chapters.push(chapter);
                }
            }

            for (const child of Array.isArray(value) ? value : Object.values(value)) {
                if (child && typeof child === "object") {
                    pending.push(child);
                }
            }
        }

        return uniqueChapters(chapters);
    }

    function parsePlayerBarChapters(initialData) {
        const markersMap = initialData?.playerOverlays
            ?.playerOverlayRenderer
            ?.decoratedPlayerBarRenderer
            ?.decoratedPlayerBarRenderer
            ?.playerBar
            ?.multiMarkersPlayerBarRenderer
            ?.markersMap;
        if (!Array.isArray(markersMap)) {
            return [];
        }

        const chapters = [];
        for (const markerMap of markersMap) {
            const markerChapters = markerMap?.value?.chapters;
            if (!Array.isArray(markerChapters)) {
                continue;
            }

            for (const item of markerChapters) {
                const renderer = item?.chapterRenderer;
                const chapter = chapterItem(
                    textFromRuns(renderer?.title),
                    firstFiniteNumber([renderer?.timeRangeStartMillis]) / 1000,
                );
                if (chapter) {
                    chapters.push(chapter);
                }
            }
        }

        return uniqueChapters(chapters);
    }

    function uniqueChapters(chapters) {
        const seen = new Set();
        return chapters
            .filter(Boolean)
            .sort((first, second) => first.seconds - second.seconds)
            .filter((chapter) => {
                const key = `${chapter.seconds}:${chapter.label}`;
                if (seen.has(key)) {
                    return false;
                }
                seen.add(key);
                return true;
            });
    }

    function parseNativeYouTubeChapters(initialData) {
        const macroMarkerChapters = parseMacroMarkerChapters(initialData);
        if (macroMarkerChapters.length > 0) {
            return macroMarkerChapters;
        }

        // Automatic chapters can be presented as "Key moments" and YouTube
        // may nest their macro-marker list below a different engagement-panel
        // wrapper. The item renderer is the stable data contract, not the
        // English surface title or one fixed parent path.
        const nestedMacroMarkerChapters = parseNestedMacroMarkerChapters(initialData);
        if (nestedMacroMarkerChapters.length > 0) {
            return nestedMacroMarkerChapters;
        }

        return parsePlayerBarChapters(initialData);
    }

    function querySelectorAllSafe(root, selector) {
        try {
            return Array.from(root?.querySelectorAll?.(selector) || []);
        } catch (_) {
            return [];
        }
    }

    function querySelectorSafe(root, selector) {
        try {
            return root?.querySelector?.(selector) || null;
        } catch (_) {
            return null;
        }
    }

    function normalizedDOMText(node) {
        return String(node?.textContent || node?.getAttribute?.("title") || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function chapterRendererData(node) {
        const candidates = [
            node?.data,
            node?.__data?.data,
            node?.__dataHost?.data,
        ];

        for (const candidate of candidates) {
            const renderer = candidate?.macroMarkersListItemRenderer || candidate;
            if (renderer?.title || renderer?.timeDescription || renderer?.onTap || renderer?.repeatButton) {
                return renderer;
            }
        }

        return null;
    }

    function chapterFromDOMNode(node) {
        const renderer = chapterRendererData(node);
        if (renderer) {
            return chapterItem(
                textFromRuns(renderer.title),
                macroMarkerStartSeconds(renderer),
            );
        }

        const visibleDetails = querySelectorSafe(node, "#details:not([hidden])") || node;
        const titleNode = querySelectorSafe(
            visibleDetails,
            "h3.macro-markers:not([hidden]), h3:not([hidden])[title], [data-title]:not([hidden])",
        );
        const timeNode = querySelectorSafe(visibleDetails, "#time:not([hidden]), #time-description:not([hidden])");
        const title = normalizedDOMText(titleNode);
        const timeMatch = normalizedDOMText(timeNode).match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
        if (!title || !timeMatch) {
            return null;
        }

        return chapterItem(title, timeToSeconds(timeMatch[0]));
    }

    function parseNativeYouTubeChaptersFromDOM(root) {
        const items = querySelectorAllSafe(root, "ytd-macro-markers-list-item-renderer");
        return uniqueChapters(items.map(chapterFromDOMNode));
    }

    function hasNativeYouTubeChapters(initialData) {
        return parseNativeYouTubeChapters(initialData).length > 0;
    }

    function escapeSummaryHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function normalizeSummaryInlineText(value) {
        return String(value ?? "")
            .trim()
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
            .replace(/^\s{0,3}#{1,6}\s+/g, "")
            .replace(/`(.+?)`/g, "$1")
            .replace(/~~(.+?)~~/g, "$1")
            .replace(/\s+/g, " ")
            .trim();
    }

    function stripSingleAsteriskEmphasis(value) {
        return String(value ?? "").replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1$2");
    }

    function renderSummaryInlineHTML(value) {
        const text = normalizeSummaryInlineText(value);
        const strongPattern = /(\*\*|__)(.+?)\1/g;
        let html = "";
        let lastIndex = 0;
        let match = strongPattern.exec(text);

        while (match) {
            html += escapeSummaryHTML(stripSingleAsteriskEmphasis(text.slice(lastIndex, match.index)));

            const strongText = stripSingleAsteriskEmphasis(match[2]).trim();
            if (strongText) {
                html += `<strong>${escapeSummaryHTML(strongText)}</strong>`;
            }

            lastIndex = strongPattern.lastIndex;
            match = strongPattern.exec(text);
        }

        html += escapeSummaryHTML(stripSingleAsteriskEmphasis(text.slice(lastIndex)));
        return html;
    }

    function isSummarySectionLine(line) {
        const trimmed = String(line ?? "").trim();
        const withoutColon = trimmed.endsWith(":")
            ? trimmed.slice(0, -1).trim()
            : trimmed;

        return (
            (withoutColon.startsWith("**") && withoutColon.endsWith("**") && withoutColon.length > 4)
            || (withoutColon.startsWith("__") && withoutColon.endsWith("__") && withoutColon.length > 4)
        );
    }

    function renderSummaryBulletList(bullets) {
        if (!Array.isArray(bullets) || bullets.length === 0) {
            return "";
        }

        return `<ul>${bullets.map((bullet) => {
            const children = Array.isArray(bullet.children) ? bullet.children : [];
            const nested = children.length > 0
                ? `<ul>${children.map((child) => `<li>${renderSummaryInlineHTML(child)}</li>`).join("")}</ul>`
                : "";
            return `<li>${renderSummaryInlineHTML(bullet.text)}${nested}</li>`;
        }).join("")}</ul>`;
    }

    function renderSummaryHTML(text) {
        const lines = String(text ?? "").split(/\r?\n/);
        const blocks = [];
        let paragraph = [];
        let bullets = [];

        function flushParagraph() {
            if (paragraph.length === 0) {
                return;
            }

            blocks.push(`<p>${renderSummaryInlineHTML(paragraph.join(" "))}</p>`);
            paragraph = [];
        }

        function flushBullets() {
            if (bullets.length === 0) {
                return;
            }

            blocks.push(renderSummaryBulletList(bullets));
            bullets = [];
        }

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) {
                flushParagraph();
                flushBullets();
                continue;
            }

            if (/^(?:part|section)\s+\d+(?:\s+of\s+\d+)?[:.]?$/i.test(line)) {
                flushParagraph();
                flushBullets();
                continue;
            }

            const bulletMatch = rawLine.match(/^(\s*)([-*])\s+(.+)$/);
            if (bulletMatch) {
                flushParagraph();
                const indentColumns = bulletMatch[1].replace(/\t/g, "  ").length;
                const bulletText = bulletMatch[3].trim();
                const isNested = indentColumns >= 2 && bullets.length > 0;

                if (isNested) {
                    bullets[bullets.length - 1].children.push(bulletText);
                } else {
                    bullets.push({ text: bulletText, children: [] });
                }
                continue;
            }

            if (isSummarySectionLine(line)) {
                flushParagraph();
                flushBullets();
                blocks.push(`<div class="summary-section-title">${renderSummaryInlineHTML(line)}</div>`);
                continue;
            }

            flushBullets();
            paragraph.push(line);
        }

        flushParagraph();
        flushBullets();

        if (blocks.length === 0) {
            return `<p>${renderSummaryInlineHTML(text)}</p>`;
        }

        return blocks.join("");
    }

    function canGenerateTimestampsFromStatus(status = {}) {
        return Boolean(status.timestampsAvailable || status.codexConnected);
    }

    function canGenerateSummaryFromStatus(status = {}) {
        if (typeof status.summaryAvailable === "boolean") {
            return status.summaryAvailable;
        }

        const summaryEngine = status.summaryEngine || status.settings?.summaryEngine || "";

        return summaryEngine === "appleIntelligence"
            ? Boolean(status.appleIntelligenceAvailable)
            : Boolean(status.codexConnected);
    }

    function defaultGenerationTab(status = {}) {
        return canGenerateTimestampsFromStatus(status) ? "timestamps" : "summary";
    }

    const helpers = {
        canGenerateSummaryFromStatus,
        canGenerateTimestampsFromStatus,
        defaultGenerationTab,
        extractVideoKey,
        getNavigationResponse,
        getNavigationResponseVideoKey,
        getNavigationURL,
        hasNativeYouTubeChapters,
        isShortsURL,
        isVideoURL,
        isWatchURL,
        parseNativeYouTubeChapters,
        parseNativeYouTubeChaptersFromDOM,
        parseTimestamps,
        renderSummaryHTML,
        renderSummaryInlineHTML,
        secondsToTimestamp,
        timeToSeconds,
    };

    globalScope.YouTubeTimestampsHelpers = helpers;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = helpers;
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
