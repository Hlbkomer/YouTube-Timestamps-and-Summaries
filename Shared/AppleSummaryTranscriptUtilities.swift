import Foundation

nonisolated struct AppleSummaryTranscriptRedaction: Equatable {
    let text: String
    let count: Int
}

nonisolated enum AppleSummaryTranscriptUtilities {
    private static let redactionPatterns = [
        #"\[\s*_+\s*\]"#,
        #"\b(?:fuck(?:er|ing)?|fucking|fucked|shit(?:ty)?|bullshit|bitch(?:es)?|asshole|dick|pussy|cunt)\b"#,
        #"\b(?:nigg(?:a|er)s?|fag(?:got)?s?|retard(?:ed)?|whore(?:s)?|slut(?:s)?)\b"#,
    ]

    static func redactedForAppleIntelligence(_ text: String) -> AppleSummaryTranscriptRedaction {
        var redactedText = text
        var redactionCount = 0

        for pattern in redactionPatterns {
            guard let expression = try? NSRegularExpression(
                pattern: pattern,
                options: [.caseInsensitive]
            ) else {
                continue
            }

            let range = NSRange(redactedText.startIndex..., in: redactedText)
            redactionCount += expression.numberOfMatches(
                in: redactedText,
                options: [],
                range: range
            )
            redactedText = expression.stringByReplacingMatches(
                in: redactedText,
                options: [],
                range: range,
                withTemplate: "[redacted]"
            )
        }

        return AppleSummaryTranscriptRedaction(
            text: redactedText,
            count: redactionCount
        )
    }
}
