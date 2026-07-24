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
    private static let legacyGrokBuildProviderID = "grokBuild"
    private static let legacyGrokBuildModelID = "grok-build-0.1"
    private static let legacyChatGPTSolAlias = "gpt-5.6"
    private static let legacyChatGPT54ModelID = "gpt-5.4"
    private static let legacyChatGPT54MiniModelID = "gpt-5.4-mini"
    static let chatGPTSolModelID = "gpt-5.6-sol"
    static let chatGPTTerraModelID = "gpt-5.6-terra"
    static let chatGPTLunaModelID = "gpt-5.6-luna"
    static let defaultProviderID = chatGPTProviderID
    static let defaultModelID = chatGPTTerraModelID
    static let defaultGrokModelID = "grok-4.5"
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
    private static let legacyGrok45QualityModelID = "grok-4.5-quality"
    static let preferNativeChapters = "preferNative"
    static let alwaysGenerateChapters = "alwaysGenerate"
    static let defaultChapterPreference = preferNativeChapters

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
        providerModels + appleModels
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
        ]
    }

    static func modelOptions(for providerID: String) -> [[String: String]] {
        switch normalizedProviderID(providerID) {
        case grokProviderID:
            return [
                [
                    "id": defaultGrokModelID,
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
                    "label": "GPT-5.6 Sol",
                ],
                [
                    "id": chatGPTTerraModelID,
                    "label": "GPT-5.6 Terra",
                ],
                [
                    "id": chatGPTLunaModelID,
                    "label": "GPT-5.6 Luna",
                ],
                [
                    "id": "gpt-5.5",
                    "label": "GPT-5.5 Thinking",
                ],
            ]
        }
    }

    static func sortedModelOptions(_ options: [[String: String]]) -> [[String: String]] {
        options.enumerated()
            .sorted { lhs, rhs in
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
                // such as GPT-5.6 Sol, Terra, and Luna.
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
        normalizedProviderID(providerID) == grokProviderID
            ? defaultGrokModelID
            : defaultModelID
    }

    static func isGrok45ModelID(_ modelID: String) -> Bool {
        let candidate = canonicalModelID(modelID, providerID: grokProviderID)
            .lowercased()
        return candidate == "grok-4.5" || candidate.hasPrefix("grok-4.5-")
    }

    /// Every Grok 4.5 request must carry an explicit low-reasoning payload.
    /// Older and future model families retain the provider default until
    /// separately validated.
    static func grokReasoningEffort(for modelID: String) -> String? {
        isGrok45ModelID(modelID) ? "low" : nil
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
            return modelID.hasPrefix("gpt-")
        }
    }

    private static func modelVersionComponents(_ modelID: String) -> [Int] {
        modelID
            .split(whereSeparator: { !$0.isNumber })
            .compactMap { Int($0) }
    }

    private static func canonicalModelID(_ modelID: String, providerID: String) -> String {
        let candidate = modelID.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalizedProviderID(providerID) == chatGPTProviderID {
            switch candidate.lowercased() {
            case legacyChatGPTSolAlias:
                return chatGPTSolModelID
            case legacyChatGPT54ModelID:
                return chatGPTTerraModelID
            case legacyChatGPT54MiniModelID:
                return chatGPTLunaModelID
            default:
                break
            }
        }
        if normalizedProviderID(providerID) == grokProviderID,
           candidate.lowercased() == legacyGrok45QualityModelID {
            return defaultGrokModelID
        }
        return candidate
    }

    private static func generatedModelLabel(for modelID: String, providerID: String) -> String {
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
