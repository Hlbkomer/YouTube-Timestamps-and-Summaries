//
//  GenerationSettings.swift
//  Timestamps & Summaries for YT Extension
//

import Foundation

struct GenerationSettings {
    static let appGroupIdentifier = "group.Matuko.YouTube-Timestamps-and-Summaries.shared"
    static let providerIDKey = "generation.providerID"
    static let modelIDKey = "generation.modelID"
    static let summaryEngineKey = "generation.summaryEngine"
    static let summaryModelIDKey = "generation.summaryModelID"

    static let chatGPTProviderID = "openaiCodex"
    static let grokProviderID = "xaiOAuth"
    private static let legacyGrokBuildProviderID = "grokBuild"
    static let defaultProviderID = chatGPTProviderID
    static let defaultModelID = "gpt-5.5"
    static let defaultSummaryEngine = "selectedModel"
    static let appleIntelligenceModelID = "appleIntelligence"

    let providerID: String
    let modelID: String
    let summaryModelID: String
    let summaryEngine: String

    init(
        providerID: String,
        modelID: String,
        summaryEngine: String,
        summaryModelID: String? = nil
    ) {
        let normalizedProviderID = Self.normalizedProviderID(providerID)
        let normalizedModelID = Self.supportedModelIDs(for: normalizedProviderID).contains(modelID)
            ? modelID
            : Self.defaultModelID(for: normalizedProviderID)
        let requestedSummaryModelID = summaryModelID
            ?? (summaryEngine == Self.appleIntelligenceModelID ? Self.appleIntelligenceModelID : normalizedModelID)

        self.providerID = normalizedProviderID
        self.modelID = normalizedModelID
        self.summaryModelID = requestedSummaryModelID == Self.appleIntelligenceModelID
            ? Self.appleIntelligenceModelID
            : (Self.supportedModelIDs(for: normalizedProviderID).contains(requestedSummaryModelID)
                ? requestedSummaryModelID
                : normalizedModelID)
        self.summaryEngine = self.summaryModelID == Self.appleIntelligenceModelID
            ? Self.appleIntelligenceModelID
            : Self.defaultSummaryEngine
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
            summaryModelID: defaults.string(forKey: summaryModelIDKey)
        )
    }

    func save() {
        let defaults = Self.sharedDefaults
        defaults.set(providerID, forKey: Self.providerIDKey)
        defaults.set(modelID, forKey: Self.modelIDKey)
        defaults.set(summaryModelID, forKey: Self.summaryModelIDKey)
        defaults.set(summaryEngine, forKey: Self.summaryEngineKey)
    }

    var payload: [String: Any] {
        [
            "providerID": providerID,
            "modelID": modelID,
            "summaryModelID": summaryModelID,
            "summaryEngine": summaryEngine,
        ]
    }

    static func modelLabel(for modelID: String, providerID: String = defaultProviderID) -> String {
        modelOptions(for: providerID)
            .first { $0["id"] == modelID }?["label"]
            ?? modelID
    }

    static func modelOptions(for providerID: String) -> [[String: String]] {
        switch normalizedProviderID(providerID) {
        case grokProviderID:
            return [
                [
                    "id": "grok-4.3",
                    "label": "Grok 4.3",
                ],
            ]
        default:
            return [
                [
                    "id": "gpt-5.5",
                    "label": "GPT-5.5 Thinking",
                ],
                [
                    "id": "gpt-5.4",
                    "label": "GPT-5.4 Thinking",
                ],
                [
                    "id": "gpt-5.4-mini",
                    "label": "GPT-5.4 mini",
                ],
            ]
        }
    }

    static func supportedModelIDs(for providerID: String) -> Set<String> {
        Set(modelOptions(for: providerID).compactMap { $0["id"] })
    }

    static func defaultModelID(for providerID: String) -> String {
        normalizedProviderID(providerID) == grokProviderID
            ? "grok-4.3"
            : defaultModelID
    }

    static func normalizedProviderID(_ providerID: String) -> String {
        if providerID == legacyGrokBuildProviderID {
            return grokProviderID
        }
        return supportedProviderIDs.contains(providerID)
            ? providerID
            : defaultProviderID
    }

    private static var supportedProviderIDs: Set<String> {
        [chatGPTProviderID, grokProviderID]
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
}
