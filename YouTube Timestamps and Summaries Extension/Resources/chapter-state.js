(function (globalScope) {
    const TERMINAL_DETECTION_STATUSES = new Set(["available", "unavailable"]);
    const NATIVE_CHAPTER_DISCOVERY_GRACE_MS = 30 * 1000;

    function normalizeDetectionStatus(value, nativeChaptersAvailable = false) {
        if (nativeChaptersAvailable) {
            return "available";
        }

        return value === "pending" || value === "available" || value === "unavailable"
            ? value
            : "unknown";
    }

    function isTerminalDetectionStatus(value) {
        return TERMINAL_DETECTION_STATUSES.has(normalizeDetectionStatus(value));
    }

    function mergeDetectionStatus(previousValue, nextValue, nextNativeChaptersAvailable = false) {
        const previous = normalizeDetectionStatus(previousValue);
        const next = normalizeDetectionStatus(nextValue, nextNativeChaptersAvailable);

        // Availability is a per-video decision. Once resolved, later pending or
        // unknown transport snapshots cannot restart discovery for that video.
        if (isTerminalDetectionStatus(previous)) {
            return previous;
        }

        return next;
    }

    globalScope.YouTubeTimestampsChapterState = {
        NATIVE_CHAPTER_DISCOVERY_GRACE_MS,
        isTerminalDetectionStatus,
        mergeDetectionStatus,
        normalizeDetectionStatus,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = globalScope.YouTubeTimestampsChapterState;
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
