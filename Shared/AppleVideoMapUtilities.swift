import Foundation

nonisolated enum AppleVideoMapUtilities {
    struct ChapterCandidate: Equatable, Sendable {
        let anchorID: String
        let seconds: Int
        let title: String
    }

    struct Digest: Equatable, Sendable {
        let topic: String
        let points: [String]
        let chapters: [ChapterCandidate]
        let handoff: String
    }

    static func parseDigest(
        _ text: String,
        anchorSeconds: [String: Int],
        includeSummaryPoints: Bool,
        maximumPoints: Int = 3,
        maximumChapters: Int = 3
    ) -> Digest? {
        guard let expression = try? NSRegularExpression(
            pattern: #"^(TOPIC|POINT|CHAPTER|HANDOFF)\s*:\s*(.+)$"#,
            options: [.caseInsensitive]
        ) else {
            return nil
        }

        var taggedLines: [(tag: String, value: String)] = []
        var foundTaggedOutput = false
        for rawLine in text.split(whereSeparator: \.isNewline) {
            let line = String(rawLine)
                .replacingOccurrences(of: "**", with: "")
                .replacingOccurrences(
                    of: #"^\s*[-*•]\s*"#,
                    with: "",
                    options: .regularExpression
                )
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !line.isEmpty else { continue }

            let range = NSRange(line.startIndex..., in: line)
            if
                let match = expression.firstMatch(in: line, range: range),
                let tagRange = Range(match.range(at: 1), in: line),
                let valueRange = Range(match.range(at: 2), in: line)
            {
                let value = String(line[valueRange])
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                guard
                    !value.isEmpty,
                    !AppleSummaryTextUtilities.containsModelMetaText(value)
                else {
                    return nil
                }
                taggedLines.append((
                    tag: String(line[tagRange]).uppercased(),
                    value: value
                ))
                foundTaggedOutput = true
            } else if foundTaggedOutput {
                if line == "```" {
                    break
                }
                return nil
            }
        }

        let topics = taggedLines.filter { $0.tag == "TOPIC" }.map(\.value)
        let handoffs = taggedLines.filter { $0.tag == "HANDOFF" }.map(\.value)
        guard topics.count == 1, !handoffs.isEmpty else {
            return parseJSONDigest(
                text,
                anchorSeconds: anchorSeconds,
                includeSummaryPoints: includeSummaryPoints,
                maximumPoints: maximumPoints,
                maximumChapters: maximumChapters
            )
        }

        let rawPoints = taggedLines
            .filter { $0.tag == "POINT" }
            .map(\.value)
            .filter { !isNoneMarker($0) }
        if !includeSummaryPoints, !rawPoints.isEmpty {
            return nil
        }
        guard rawPoints.count <= maximumPoints else {
            return nil
        }

        let rawChapters = taggedLines
            .filter { $0.tag == "CHAPTER" }
            .map(\.value)
        guard rawChapters.count <= maximumChapters else {
            return nil
        }

        var chapters: [ChapterCandidate] = []
        for rawChapter in rawChapters {
            if isNoneMarker(rawChapter) {
                continue
            }

            let parts = rawChapter.split(
                separator: "|",
                maxSplits: 1,
                omittingEmptySubsequences: false
            )
            guard parts.count == 2 else {
                return nil
            }
            let anchorID = String(parts[0])
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .uppercased()
            let title = cleanTitle(String(parts[1]))
            guard
                let seconds = anchorSeconds[anchorID],
                isUsableTitle(title)
            else {
                return nil
            }
            chapters.append(
                ChapterCandidate(
                    anchorID: anchorID,
                    seconds: seconds,
                    title: title
                )
            )
        }

        return Digest(
            topic: topics[0],
            points: rawPoints,
            chapters: chapters,
            handoff: handoffs.last ?? topics[0]
        )
    }

    private static func parseJSONDigest(
        _ text: String,
        anchorSeconds: [String: Int],
        includeSummaryPoints: Bool,
        maximumPoints: Int,
        maximumChapters: Int
    ) -> Digest? {
        guard
            let firstBrace = text.firstIndex(of: "{"),
            let lastBrace = text.lastIndex(of: "}"),
            firstBrace <= lastBrace,
            let data = String(text[firstBrace...lastBrace]).data(using: .utf8),
            let dictionary = try? JSONSerialization.jsonObject(with: data)
                as? [String: Any],
            let topic = dictionary["topic"] as? String,
            !topic.isEmpty,
            !AppleSummaryTextUtilities.containsModelMetaText(topic)
        else {
            return nil
        }

        let rawPoints: [String]
        let pointValue = dictionary["points"] ?? dictionary["summary_points"]
        if let points = pointValue as? [String] {
            rawPoints = points.filter { !isNoneMarker($0) }
        } else if let point = pointValue as? String {
            rawPoints = isNoneMarker(point) ? [] : [point]
        } else {
            rawPoints = []
        }
        guard
            (includeSummaryPoints || rawPoints.isEmpty),
            rawPoints.count <= maximumPoints,
            !rawPoints.contains(where: AppleSummaryTextUtilities.containsModelMetaText)
        else {
            return nil
        }

        let rawChapters = dictionary["chapters"] as? [Any] ?? []
        guard rawChapters.count <= maximumChapters else {
            return nil
        }
        var chapters: [ChapterCandidate] = []
        var nestedHandoffs: [String] = []
        for rawChapter in rawChapters {
            let chapterValue: String?
            if let chapter = rawChapter as? String {
                chapterValue = chapter
            } else if
                let tuple = rawChapter as? [Any],
                tuple.count == 2,
                let anchorID = tuple[0] as? String,
                let title = tuple[1] as? String
            {
                chapterValue = "\(anchorID) | \(title)"
            } else if let object = rawChapter as? [String: Any] {
                if let chapter = object["chapter"] as? String {
                    chapterValue = chapter
                } else if
                    let anchorID = object["anchor"] as? String,
                    let title = object["title"] as? String
                {
                    chapterValue = "\(anchorID) | \(title)"
                } else {
                    chapterValue = nil
                }
                if let handoff = object["handoff"] as? String {
                    nestedHandoffs.append(handoff)
                }
            } else {
                chapterValue = nil
            }

            guard
                let chapterValue,
                let chapter = chapterCandidate(
                    from: chapterValue,
                    anchorSeconds: anchorSeconds
                )
            else {
                return nil
            }
            chapters.append(chapter)
        }

        let handoff = (dictionary["handoff"] as? String)
            ?? nestedHandoffs.last
            ?? topic
        guard
            !handoff.isEmpty,
            !AppleSummaryTextUtilities.containsModelMetaText(handoff)
        else {
            return nil
        }

        return Digest(
            topic: topic,
            points: rawPoints,
            chapters: chapters,
            handoff: handoff
        )
    }

    static func compileChapters(
        candidates: [ChapterCandidate],
        videoDuration: Int,
        fallbackTitle: String
    ) -> [String] {
        let duration = max(
            videoDuration,
            candidates.map(\.seconds).max() ?? 0
        )
        let maximumCount = maximumChapterCount(for: duration)
        let minimumGap = max(30, duration / max(maximumCount * 2, 1))

        var seenTimes = Set<Int>()
        var seenTitles = Set<String>()
        var valid = candidates
            .filter { $0.seconds >= 0 && $0.seconds <= duration + 10 }
            .sorted {
                if $0.seconds == $1.seconds {
                    return $0.anchorID < $1.anchorID
                }
                return $0.seconds < $1.seconds
            }
            .filter { candidate in
                let title = cleanTitle(candidate.title)
                let titleKey = normalizedTitle(title)
                return isUsableTitle(title)
                    && seenTimes.insert(candidate.seconds).inserted
                    && seenTitles.insert(titleKey).inserted
            }

        let safeFallback = isUsableTitle(cleanTitle(fallbackTitle))
            ? cleanTitle(fallbackTitle)
            : "Introduction"
        if valid.isEmpty {
            valid = [
                ChapterCandidate(
                    anchorID: "L0001",
                    seconds: 0,
                    title: safeFallback
                ),
            ]
        } else if valid[0].seconds <= 15 {
            valid[0] = ChapterCandidate(
                anchorID: valid[0].anchorID,
                seconds: 0,
                title: valid[0].title
            )
        } else {
            valid.insert(
                ChapterCandidate(
                    anchorID: "L0001",
                    seconds: 0,
                    title: safeFallback
                ),
                at: 0
            )
        }

        var spaced: [ChapterCandidate] = []
        for candidate in valid {
            if
                spaced.isEmpty
                    || candidate.seconds - (spaced.last?.seconds ?? 0) >= minimumGap
            {
                spaced.append(candidate)
            }
        }

        if spaced.count > maximumCount {
            spaced = evenlySampled(spaced, maximumCount: maximumCount)
        }

        return spaced.map {
            "\(formatTimestamp(seconds: $0.seconds)) \($0.title)"
        }
    }

    static func cleanTitle(_ title: String) -> String {
        title
            .replacingOccurrences(
                of: #"^[\-\*•–—]\s*"#,
                with: "",
                options: .regularExpression
            )
            .replacingOccurrences(
                of: #"^\d+[\.\)]\s+"#,
                with: "",
                options: .regularExpression
            )
            .replacingOccurrences(
                of: #"\s+"#,
                with: " ",
                options: .regularExpression
            )
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func isUsableTitle(_ title: String) -> Bool {
        let words = title.split(whereSeparator: \.isWhitespace)
        let lowercasedTitle = title.lowercased()
        let sentenceLikeStarts = [
            "at ",
            "i ",
            "i'm ",
            "i’ve ",
            "i was ",
            "we ",
            "we're ",
            "you ",
            "he ",
            "she ",
            "they ",
            "it ",
            "this ",
            "that ",
            "there ",
            "when ",
            "where ",
            "why ",
            "how ",
            "so ",
            "and ",
            "but ",
        ]

        return !title.isEmpty
            && title.count <= 90
            && words.count <= 12
            && title.range(of: #"[.!?]"#, options: .regularExpression) == nil
            && !sentenceLikeStarts.contains { lowercasedTitle.hasPrefix($0) }
    }

    private static func maximumChapterCount(for duration: Int) -> Int {
        switch duration {
        case ..<300:
            return 5
        case ..<900:
            return 8
        case ..<3_600:
            return 12
        case ..<7_200:
            return 16
        default:
            return 20
        }
    }

    private static func evenlySampled(
        _ candidates: [ChapterCandidate],
        maximumCount: Int
    ) -> [ChapterCandidate] {
        guard candidates.count > maximumCount, maximumCount > 1 else {
            return Array(candidates.prefix(maximumCount))
        }

        return (0..<maximumCount).map { index in
            let sourceIndex = Int(
                (Double(index) * Double(candidates.count - 1)
                    / Double(maximumCount - 1)).rounded()
            )
            return candidates[sourceIndex]
        }
    }

    private static func isNoneMarker(_ value: String) -> Bool {
        let normalized = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return ["none", "no point", "no points", "n/a"].contains(normalized)
    }

    private static func chapterCandidate(
        from rawChapter: String,
        anchorSeconds: [String: Int]
    ) -> ChapterCandidate? {
        let parts = rawChapter.split(
            separator: "|",
            maxSplits: 1,
            omittingEmptySubsequences: false
        )
        guard parts.count == 2 else {
            return nil
        }
        let anchorID = String(parts[0])
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        let title = cleanTitle(String(parts[1]))
        guard
            let seconds = anchorSeconds[anchorID],
            isUsableTitle(title)
        else {
            return nil
        }
        return ChapterCandidate(
            anchorID: anchorID,
            seconds: seconds,
            title: title
        )
    }

    private static func normalizedTitle(_ title: String) -> String {
        title
            .lowercased()
            .trimmingCharacters(
                in: CharacterSet.whitespacesAndNewlines
                    .union(.punctuationCharacters)
            )
    }

    private static func formatTimestamp(seconds: Int) -> String {
        let safeSeconds = max(0, seconds)
        let hours = safeSeconds / 3_600
        let minutes = (safeSeconds % 3_600) / 60
        let remainingSeconds = safeSeconds % 60

        if hours > 0 {
            return "\(hours):\(String(format: "%02d", minutes)):\(String(format: "%02d", remainingSeconds))"
        }
        return "\(String(format: "%02d", minutes)):\(String(format: "%02d", remainingSeconds))"
    }
}
