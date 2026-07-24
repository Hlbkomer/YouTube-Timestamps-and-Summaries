import Foundation

nonisolated enum AppleSummaryTextUtilities {
    private static let genericTitlePatterns = [
        #"^(?:#+\s*)?summary of (?:the )?video transcript[:.]?$"#,
        #"^(?:#+\s*)?video transcript summary[:.]?$"#,
        #"^(?:#+\s*)?summary of (?:the )?transcript[:.]?$"#,
    ]

    private static let modelProtocolMarkers = [
        "tool analysis:",
        "detected_language",
        "summary_points",
        "tool call:",
        "tool calls:",
    ]

    static func cleanedSummaryText(_ text: String) -> String {
        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n")
        var sourceLines = normalized.components(separatedBy: "\n")

        while sourceLines.first?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true {
            sourceLines.removeFirst()
        }

        if let firstLine = sourceLines.first?.trimmingCharacters(in: .whitespacesAndNewlines),
           isGenericTitle(firstLine) {
            sourceLines.removeFirst()
            while sourceLines.first?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true {
                sourceLines.removeFirst()
            }
        }

        var lines: [String] = []
        var seenLines = Set<String>()

        for rawLine in sourceLines {
            let line = rawLine
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)

            if line.isEmpty {
                if !lines.isEmpty, lines.last != "" {
                    lines.append("")
                }
                continue
            }

            if line.range(
                of: #"^(?:part|section)\s+\d+(?:\s+of\s+\d+)?[:.]?$"#,
                options: [.regularExpression, .caseInsensitive]
            ) != nil {
                continue
            }

            let deduplicationKey = normalizedSummaryLine(line)
            guard !deduplicationKey.isEmpty else { continue }

            if seenLines.insert(deduplicationKey).inserted {
                lines.append(line)
            }
        }

        while lines.last?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true {
            lines.removeLast()
        }

        return lines.joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func containsModelMetaText(_ text: String) -> Bool {
        let lowercased = text.lowercased()
        return modelProtocolMarkers.contains { lowercased.contains($0) }
    }

    static func cleanedReaderFacingText(_ text: String) -> String {
        let cleaned = cleanedSummaryText(text)
        let lines = cleaned.components(separatedBy: "\n")
        guard let firstMetaLine = lines.firstIndex(where: containsModelMetaText) else {
            return cleaned
        }

        return cleanedSummaryText(lines[..<firstMetaLine].joined(separator: "\n"))
    }

    static func isStrictReaderFacingSummary(_ text: String) -> Bool {
        let cleaned = cleanedSummaryText(text)
        guard !cleaned.isEmpty, !containsModelMetaText(cleaned) else {
            return false
        }

        let firstLine = cleaned
            .components(separatedBy: "\n")
            .first?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            ?? ""

        if firstLine.hasPrefix("```")
            || firstLine.hasPrefix("{")
            || firstLine.range(
                of: #"^"(?:overview|summary|sections|main_topic)"\s*:"#,
                options: .regularExpression
            ) != nil {
            return false
        }

        return true
    }

    private static func isGenericTitle(_ line: String) -> Bool {
        genericTitlePatterns.contains { pattern in
            line.range(
                of: pattern,
                options: [.regularExpression, .caseInsensitive]
            ) != nil
        }
    }

    private static func normalizedSummaryLine(_ line: String) -> String {
        line
            .replacingOccurrences(of: #"^[-*]\s+"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(.punctuationCharacters))
            .lowercased()
    }
}
