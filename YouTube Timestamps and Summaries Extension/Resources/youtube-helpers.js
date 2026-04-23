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

    function buildCanonicalVideoURL(videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
    }

    function looksLikeInputRequest(text) {
        const normalized = String(text ?? "").trim().toLowerCase();
        if (!normalized) {
            return true;
        }

        if (normalized.length > 700) {
            return false;
        }

        const requestLeadPatterns = [
            /^i(?:'|’)d be happy to help\b/,
            /^i(?:'|’)d love to help\b/,
            /^please (?:provide|paste|upload|send|share)\b/,
            /^\s*once you provide\b/,
            /\byou haven(?:'|’)t provided\b/,
            /\bplease provide the\b/,
        ];
        const missingInputPatterns = [
            /\byoutube (?:link|url)\b/,
            /\bvideo (?:link|url|file)\b/,
            /\btranscript\b/,
            /\bupload (?:the )?video\b/,
            /\bpaste (?:the )?(?:youtube )?(?:link|url)\b/,
            /\bprovide (?:the )?(?:video|content|link)\b/,
            /\bshare (?:the )?(?:video|link|url)\b/,
        ];
        const summarySignalPatterns = [
            /\b(?:this|the) video (?:covers|discusses|explains|highlights|mentions|shows|walks through|is about)\b/,
            /\bin this video\b/,
            /\bcovers\b/,
            /\bdiscuss(?:es|ed)\b/,
            /\bexplains?\b/,
            /\bhighlights?\b/,
            /\bmentions?\b/,
            /\btakeaways?\b/,
            /\bkey points?\b/,
            /\bsummary\b/,
        ];

        const hasRequestLead = requestLeadPatterns.some((pattern) => pattern.test(normalized));
        const hasMissingInputSignal = missingInputPatterns.some((pattern) => pattern.test(normalized));
        const hasSummarySignal = summarySignalPatterns.some((pattern) => pattern.test(normalized));

        return hasRequestLead && hasMissingInputSignal && !hasSummarySignal;
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

    const helpers = {
        buildCanonicalVideoURL,
        extractVideoKey,
        getNavigationURL,
        isShortsURL,
        isVideoURL,
        isWatchURL,
        looksLikeInputRequest,
        parseTimestamps,
        timeToSeconds,
    };

    globalScope.GeminiYouTubeHelpers = helpers;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = helpers;
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
