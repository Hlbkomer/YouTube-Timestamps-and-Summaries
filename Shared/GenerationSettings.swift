//
//  GenerationSettings.swift
//  Timestamps & Summaries for YT (Shared)
//

import Foundation

nonisolated struct GenerationSettings {
    static let appGroupIdentifier = "group.Matuko.YouTube-Timestamps-and-Summaries.shared"
    static let providerIDKey = "generation.providerID"
    static let modelIDKey = "generation.modelID"
    static let summaryEngineKey = "generation.summaryEngine"
    static let summaryModelIDKey = "generation.summaryModelID"
    static let chapterPreferenceKey = "generation.chapterPreference"

    static let chatGPTProviderID = "openaiCodex"
    static let grokProviderID = "xaiOAuth"
    static let geminiProviderID = "googleGemini"
    static let defaultGeminiModelID = "gemini-flash-latest"
    static let geminiFlashLiteModelID = "gemini-3.5-flash-lite"
    static let geminiArgonModelID = "gemini-4-argon"
    static let geminiThinkingLevel = "LOW"
    private static let legacyGrokBuildProviderID = "grokBuild"
    private static let legacyGrokBuildModelID = "grok-build-0.1"
    static let chatGPTSolModelID = "gpt-6.1-sol"
    static let chatGPTLunaModelID = "gpt-6-luna"
    static let grok45ModelID = "grok-4.5"
    static let grok46ModelID = "grok-4.6"
    static let grok47ModelID = "grok-4.7"
    static let defaultProviderID = chatGPTProviderID
    static let defaultModelID = chatGPTLunaModelID
    static let defaultGrokModelID = grok47ModelID
    static let defaultSummaryEngine = "selectedModel"
    static let appleIntelligenceModelID = "appleIntelligence"
    static let appleIntelligenceLabel = "Apple Intelligence"
    static let appleSummaryStrategyAdaptiveGrounded = "adaptiveGrounded"
    static let defaultAppleSummaryStrategy = appleSummaryStrategyAdaptiveGrounded
    #if DEBUG
    static let appleSummaryStrategyBaseline = "baseline"
    static let appleSummaryStrategyHierarchical = "hierarchical"
    static let appleSummaryStrategyRollingJoined = "rollingJoined"
    static let appleSummaryStrategyRollingComposed = "rollingComposed"
    #endif
    static let preferNativeChapters = "preferNative"
    static let alwaysGenerateChapters = "alwaysGenerate"
    static let defaultChapterPreference = preferNativeChapters

    static var providerUserAgent: String {
        let version = ((Bundle.main.object(
            forInfoDictionaryKey: "CFBundleShortVersionString"
        ) as? String) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let reportedVersion = version.isEmpty ? "unknown" : version
        return "TimestampsSummariesForYT/\(reportedVersion)"
    }

    let providerID: String
    let modelID: String
    let summaryModelID: String
    let summaryEngine: String
    let chapterPreference: String

    init(
        providerID: String,
        modelID: String,
        summaryEngine: String,
        summaryModelID: String? = nil,
        chapterPreference: String = defaultChapterPreference
    ) {
        let normalizedProviderID = Self.normalizedProviderID(providerID)
        let normalizedModelID = Self.normalizedModelID(modelID, providerID: normalizedProviderID)
        let requestedSummaryModelID = summaryModelID
            ?? (summaryEngine == Self.appleIntelligenceModelID ? Self.appleIntelligenceModelID : normalizedModelID)
        let appleSummaryModelID = Self.isAppleIntelligenceSummaryModelID(
            requestedSummaryModelID
        )
            ? Self.appleIntelligenceModelID
            : nil

        self.providerID = normalizedProviderID
        self.modelID = normalizedModelID
        self.summaryModelID = appleSummaryModelID
            ?? Self.normalizedModelID(
                requestedSummaryModelID,
                providerID: normalizedProviderID,
                fallback: normalizedModelID
            )
        self.summaryEngine = appleSummaryModelID == nil
            ? Self.defaultSummaryEngine
            : Self.appleIntelligenceModelID
        self.chapterPreference = Self.normalizedChapterPreference(chapterPreference)
    }

    static var sharedDefaults: UserDefaults {
        UserDefaults(suiteName: appGroupIdentifier) ?? .standard
    }

    static func load() -> GenerationSettings {
        let defaults = sharedDefaults
        return GenerationSettings(
            providerID: defaults.string(forKey: providerIDKey) ?? defaultProviderID,
            modelID: defaults.string(forKey: modelIDKey) ?? defaultModelID,
            summaryEngine: defaults.string(forKey: summaryEngineKey) ?? defaultSummaryEngine,
            summaryModelID: defaults.string(forKey: summaryModelIDKey),
            chapterPreference: defaults.string(forKey: chapterPreferenceKey) ?? defaultChapterPreference
        )
    }

    func save() {
        let defaults = Self.sharedDefaults
        defaults.set(providerID, forKey: Self.providerIDKey)
        defaults.set(modelID, forKey: Self.modelIDKey)
        defaults.set(summaryModelID, forKey: Self.summaryModelIDKey)
        defaults.set(summaryEngine, forKey: Self.summaryEngineKey)
        defaults.set(chapterPreference, forKey: Self.chapterPreferenceKey)
    }

    var payload: [String: Any] {
        [
            "providerID": providerID,
            "modelID": modelID,
            "summaryModelID": summaryModelID,
            "summaryEngine": summaryEngine,
            "chapterPreference": chapterPreference,
        ]
    }

    static var appleIntelligenceSummaryModelOptions: [[String: String]] {
        [
            [
                "id": appleIntelligenceModelID,
                "label": appleIntelligenceLabel,
            ],
        ]
    }

    static var chapterPreferenceOptions: [[String: String]] {
        [
            [
                "id": preferNativeChapters,
                "label": "Prefer YouTube chapters when available",
            ],
            [
                "id": alwaysGenerateChapters,
                "label": "Always generate chapters",
            ],
        ]
    }

    static func orderedSummaryModelOptions(
        providerModels: [[String: String]],
        appleModels: [[String: String]]
    ) -> [[String: String]] {
        // Apple Intelligence sorts alphabetically before every cloud provider.
        // providerModels contains the selected provider's models only.
        appleModels.sorted {
            ($0["label"] ?? "").localizedCaseInsensitiveCompare($1["label"] ?? "") == .orderedAscending
        } + sortedModelOptions(providerModels)
    }

    static var providerOptions: [[String: String]] {
        [
            [
                "id": chatGPTProviderID,
                "label": "ChatGPT / Codex",
            ],
            [
                "id": grokProviderID,
                "label": "Grok (SuperGrok)",
            ],
            [
                "id": geminiProviderID,
                "label": "Gemini",
            ],
        ].sorted {
            ($0["label"] ?? "").localizedCaseInsensitiveCompare($1["label"] ?? "") == .orderedAscending
        }
    }

    static func modelOptions(for providerID: String) -> [[String: String]] {
        switch normalizedProviderID(providerID) {
        case geminiProviderID:
            return [
                ["id": geminiArgonModelID, "label": "Gemini 4 Argon"],
                ["id": defaultGeminiModelID, "label": "Gemini Flash (latest)"],
                ["id": geminiFlashLiteModelID, "label": "Gemini 3.5 Flash-Lite"],
            ]
        case grokProviderID:
            return [
                [
                    "id": defaultGrokModelID,
                    "label": "Grok 4.7",
                ],
                [
                    "id": grok46ModelID,
                    "label": "Grok 4.6",
                ],
                [
                    "id": grok45ModelID,
                    "label": "Grok 4.5",
                ],
                [
                    "id": "grok-4.3",
                    "label": "Grok 4.3",
                ],
            ]
        default:
            return [
                [
                    "id": chatGPTSolModelID,
                    "label": "GPT-6.1 Sol",
                ],
                [
                    "id": chatGPTLunaModelID,
                    "label": "GPT-6 Luna",
                ],
            ]
        }
    }

    static func sortedModelOptions(_ options: [[String: String]]) -> [[String: String]] {
        let geminiOrder = modelOptions(for: geminiProviderID).compactMap { $0["id"] }
        return options.enumerated()
            .sorted { lhs, rhs in
                // Flash latest has no numeric version. Use the curated Gemini
                // order so it stays between Argon and the older Lite generation.
                if let lhsIndex = geminiOrder.firstIndex(of: lhs.element["id"] ?? ""),
                   let rhsIndex = geminiOrder.firstIndex(of: rhs.element["id"] ?? "") {
                    return lhsIndex < rhsIndex
                }
                let lhsVersion = modelVersionComponents(lhs.element["id"] ?? "")
                let rhsVersion = modelVersionComponents(rhs.element["id"] ?? "")
                let componentCount = max(lhsVersion.count, rhsVersion.count)

                for index in 0..<componentCount {
                    let lhsComponent = index < lhsVersion.count ? lhsVersion[index] : -1
                    let rhsComponent = index < rhsVersion.count ? rhsVersion[index] : -1
                    if lhsComponent != rhsComponent {
                        return lhsComponent > rhsComponent
                    }
                }

                // Keep the curated/API order for variants of the same version,
                // such as GPT-6.1 Sol and GPT-6 Luna.
                return lhs.offset < rhs.offset
            }
            .map(\.element)
    }

    static func supportedModelIDs(for providerID: String) -> Set<String> {
        Set(modelOptions(for: providerID).compactMap { $0["id"] })
    }

    static func normalizedModelID(
        _ modelID: String,
        providerID: String,
        fallback: String? = nil
    ) -> String {
        let candidate = canonicalModelID(modelID, providerID: providerID)
        guard isUsableModelID(candidate, providerID: providerID) else {
            return fallback ?? defaultModelID(for: providerID)
        }
        return candidate
    }

    static func isUsableModelID(_ modelID: String, providerID: String) -> Bool {
        let candidate = canonicalModelID(modelID, providerID: providerID)
        let normalizedProviderID = normalizedProviderID(providerID)
        if supportedModelIDs(for: normalizedProviderID).contains(candidate) {
            return true
        }
        return allowsFutureModelID(candidate, providerID: normalizedProviderID)
    }

    static func defaultModelID(for providerID: String) -> String {
        switch normalizedProviderID(providerID) {
        case grokProviderID: return defaultGrokModelID
        case geminiProviderID: return defaultGeminiModelID
        default: return defaultModelID
        }
    }

    static func providerLabel(for providerID: String) -> String {
        providerOptions.first { $0["id"] == providerID }?["label"] ?? "selected provider"
    }

    static func isGrok45ModelID(_ modelID: String) -> Bool {
        let candidate = canonicalModelID(modelID, providerID: grokProviderID)
            .lowercased()
        return candidate == grok45ModelID
    }

    static func isGrok46ModelID(_ modelID: String) -> Bool {
        let candidate = canonicalModelID(modelID, providerID: grokProviderID)
            .lowercased()
        return candidate == grok46ModelID
    }

    static func isGrok47ModelID(_ modelID: String) -> Bool {
        let candidate = canonicalModelID(modelID, providerID: grokProviderID)
            .lowercased()
        return candidate == grok47ModelID
    }

    static func requiresExplicitLowGrokReasoning(_ modelID: String) -> Bool {
        isGrok45ModelID(modelID)
            || isGrok46ModelID(modelID)
            || isGrok47ModelID(modelID)
    }

    /// Luna (fast default) and Sol (flagship) both use an explicit low reasoning
    /// effort for transcript generation. Sol always reasons and does not accept
    /// `none`; neither model is sent temperature/top_p, because Codex Responses
    /// requests here never include sampling parameters. Other (catalog-added)
    /// models retain the provider default.
    static func chatGPTReasoningRequestValue(for modelID: String) -> [String: String]? {
        let normalizedModel = normalizedModelID(
            modelID,
            providerID: chatGPTProviderID
        )
        switch normalizedModel {
        case chatGPTLunaModelID, chatGPTSolModelID:
            return ["effort": "low"]
        default:
            return nil
        }
    }

    /// OpenAI IDs that are no longer offered. A saved selection with one of
    /// these IDs is treated as unusable and falls back to the default Luna model.
    private static let retiredChatGPTModelIDPrefixes = [
        "gpt-3", "gpt-4", "gpt-5", "gpt-6-astra",
    ]

    private static func isRetiredChatGPTModelID(_ modelID: String) -> Bool {
        let lowercased = modelID.lowercased()
        return retiredChatGPTModelIDPrefixes.contains { lowercased.hasPrefix($0) }
    }

    /// Every curated Grok 4.5, 4.6, and 4.7 request must carry an explicit
    /// low-reasoning payload.
    /// Older and future model families retain the provider default until
    /// separately validated.
    static func grokReasoningEffort(for modelID: String) -> String? {
        requiresExplicitLowGrokReasoning(modelID) ? "low" : nil
    }

    static func grokReasoningRequestValue(for modelID: String) -> [String: String]? {
        guard let effort = grokReasoningEffort(for: modelID) else {
            return nil
        }
        return ["effort": effort]
    }

    static func grokProviderModelID(for modelID: String) -> String {
        canonicalModelID(modelID, providerID: grokProviderID)
    }

    static func modelLabel(for modelID: String, providerID: String = defaultProviderID) -> String {
        modelOptions(for: providerID)
            .first { $0["id"] == modelID }?["label"]
            ?? generatedModelLabel(for: modelID, providerID: providerID)
    }

    static func normalizedProviderID(_ providerID: String) -> String {
        if providerID == legacyGrokBuildProviderID {
            return grokProviderID
        }
        return providerOptions.contains { $0["id"] == providerID }
            ? providerID
            : defaultProviderID
    }

    static func normalizedChapterPreference(_ chapterPreference: String) -> String {
        chapterPreferenceOptions.contains { $0["id"] == chapterPreference }
            ? chapterPreference
            : defaultChapterPreference
    }

    static func isAppleIntelligenceSummaryModelID(_ modelID: String) -> Bool {
        modelID == appleIntelligenceModelID
    }

    #if DEBUG
    static func normalizedAppleSummaryStrategyForTesting(_ strategy: String) -> String {
        let internalStrategies = Set([
            appleSummaryStrategyBaseline,
            appleSummaryStrategyHierarchical,
            appleSummaryStrategyRollingJoined,
            appleSummaryStrategyRollingComposed,
            appleSummaryStrategyAdaptiveGrounded,
        ])
        return internalStrategies.contains(strategy)
            ? strategy
            : defaultAppleSummaryStrategy
    }
    #endif

    private static func allowsFutureModelID(_ modelID: String, providerID: String) -> Bool {
        guard !modelID.isEmpty else { return false }
        switch normalizedProviderID(providerID) {
        case geminiProviderID:
            // Use only the curated text models. Do not accept arbitrary
            // image/audio/agent model IDs from saved settings or native messages.
            return false
        case grokProviderID:
            return modelID.hasPrefix("grok-")
                && !modelID.hasPrefix("grok-build-")
                && !modelID.hasPrefix("grok-4.20")
                && !modelID.hasPrefix("grok-4-20")
                && !modelID.hasPrefix("grok-420")
                && modelID != legacyGrokBuildModelID
                && !modelID.contains("imagine")
                && !modelID.contains("voice")
        default:
            return modelID.hasPrefix("gpt-") && !isRetiredChatGPTModelID(modelID)
        }
    }

    private static func modelVersionComponents(_ modelID: String) -> [Int] {
        modelID
            .split(whereSeparator: { !$0.isNumber })
            .compactMap { Int($0) }
    }

    private static func canonicalModelID(_ modelID: String, providerID: String) -> String {
        let candidate = modelID.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalizedProviderID(providerID) == geminiProviderID {
            for curatedModelID in supportedModelIDs(for: geminiProviderID)
            where candidate.lowercased() == curatedModelID {
                return curatedModelID
            }
        }
        if normalizedProviderID(providerID) == chatGPTProviderID {
            // Matching is case-insensitive so " GPT-6-Luna " resolves to the curated ID.
            for curatedModelID in [chatGPTSolModelID, chatGPTLunaModelID]
            where candidate.lowercased() == curatedModelID {
                return curatedModelID
            }
        }
        if normalizedProviderID(providerID) == grokProviderID {
            let lowercasedCandidate = candidate.lowercased()
            for curatedModelID in [defaultGrokModelID, grok46ModelID, grok45ModelID] {
                if lowercasedCandidate == curatedModelID
                    || lowercasedCandidate.hasPrefix("\(curatedModelID)-")
                {
                    return curatedModelID
                }
            }
        }
        return candidate
    }

    private static func generatedModelLabel(for modelID: String, providerID: String) -> String {
        if normalizedProviderID(providerID) == geminiProviderID, modelID.hasPrefix("gemini-") {
            let words = modelID.dropFirst("gemini-".count).split(separator: "-").map { word in
                switch word {
                case "flash": return "Flash"
                case "lite": return "Lite"
                case "argon": return "Argon"
                default: return String(word)
                }
            }
            return "Gemini " + words.joined(separator: " ").replacingOccurrences(of: "Flash Lite", with: "Flash-Lite")
        }

        if normalizedProviderID(providerID) == grokProviderID, modelID.hasPrefix("grok-") {
            let version = String(modelID.dropFirst("grok-".count))
            return "Grok " + version.replacingOccurrences(of: "-", with: " ")
        }

        if modelID.hasPrefix("gpt-") {
            let version = String(modelID.dropFirst("gpt-".count))
            return "GPT-" + version.replacingOccurrences(of: "-mini", with: " mini")
        }

        return modelID
    }

}
