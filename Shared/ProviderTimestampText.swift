import Foundation

/// Keeps only chapter times present in the source transcript.
nonisolated enum ProviderTimestampText {
    private static func transcriptTimes(_ transcript: String) -> [String] {
        transcript
            .split(whereSeparator: \.isNewline)
            .compactMap { line -> String? in
                let prefix = line.trimmingCharacters(in: .whitespacesAndNewlines)
                guard let closingBracket = prefix.firstIndex(of: "]"), prefix.hasPrefix("[") else {
                    return nil
                }
                return String(prefix[prefix.index(after: prefix.startIndex)..<closingBracket])
            }
    }

    static func cleaned(_ text: String, transcript: String) -> String {
        let validTimes = Set(transcriptTimes(transcript))
        let timestampPattern = try? NSRegularExpression(pattern: "^(\\d{1,2}:\\d{2}(?::\\d{2})?)\\s+(.+?)\\s*$")

        return text
            .split(whereSeparator: \.isNewline)
            .compactMap { line -> String? in
                let value = String(line).trimmingCharacters(in: .whitespacesAndNewlines)
                let range = NSRange(value.startIndex..<value.endIndex, in: value)
                guard let match = timestampPattern?.firstMatch(in: value, range: range), match.numberOfRanges == 3,
                      let timeRange = Range(match.range(at: 1), in: value),
                      let titleRange = Range(match.range(at: 2), in: value)
                else {
                    return nil
                }

                let time = String(value[timeRange])
                let title = String(value[titleRange]).trimmingCharacters(in: .whitespacesAndNewlines)
                guard !title.isEmpty, validTimes.contains(time) else {
                    return nil
                }
                return "\(time) \(title)"
            }
            .joined(separator: "\n")
    }

    /// Gemini can add Markdown or change clock padding despite the plain-text
    /// instruction. Normalize presentation only, then apply the strict validator.
    static func cleanedGemini(_ text: String, transcript: String) -> String {
        let sourceTimes = transcriptTimes(transcript).reduce(into: [Int: String]()) { result, time in
            if let seconds = clockSeconds(time), result[seconds] == nil {
                result[seconds] = time
            }
        }
        let pattern = try? NSRegularExpression(
            pattern: #"^(?:(?:[-*+•]|\d+[.)])\s+)?\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?(?:\s*[-–—:]\s*|\s+)(.+?)\s*$"#
        )
        let normalized = text.split(whereSeparator: \.isNewline).compactMap { line -> String? in
            let value = String(line)
                .replacingOccurrences(of: "**", with: "")
                .replacingOccurrences(of: "__", with: "")
                .replacingOccurrences(of: "`", with: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let range = NSRange(value.startIndex..<value.endIndex, in: value)
            guard let match = pattern?.firstMatch(in: value, range: range),
                  let timeRange = Range(match.range(at: 1), in: value),
                  let titleRange = Range(match.range(at: 2), in: value),
                  let seconds = clockSeconds(String(value[timeRange])),
                  let sourceTime = sourceTimes[seconds] else {
                return nil
            }
            return "\(sourceTime) \(value[titleRange])"
        }.joined(separator: "\n")
        return cleaned(normalized, transcript: transcript)
    }

    private static func clockSeconds(_ time: String) -> Int? {
        let components = time.split(separator: ":", omittingEmptySubsequences: false)
        guard (2...3).contains(components.count),
              components.allSatisfy({ !$0.isEmpty && $0.utf8.allSatisfy { (48...57).contains($0) } }) else {
            return nil
        }
        let values = components.compactMap { Int($0) }
        guard values.count == components.count,
              values.dropFirst().allSatisfy({ $0 < 60 }),
              values[0] <= 99 else { return nil }
        return values.reduce(0) { $0 * 60 + $1 }
    }
}
