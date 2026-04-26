//
//  GenerationSettings.swift
//  Timestamps & Summaries for YT
//
//  Created by Codex on 26/04/2026.
//

import Foundation

struct GenerationSettings {
    static let appGroupIdentifier = "group.Matuko.YouTube-Timestamps-and-Summaries.shared"
    static let providerIDKey = "generation.providerID"
    static let modelIDKey = "generation.modelID"
    static let summaryEngineKey = "generation.summaryEngine"

    static let defaultProviderID = "openaiCodex"
    static let defaultModelID = "gpt-5.5"
    static let defaultSummaryEngine = "selectedModel"
    static let supportedModelIDs = Set(["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"])

    let providerID: String
    let modelID: String
    let summaryEngine: String

    static var sharedDefaults: UserDefaults {
        UserDefaults(suiteName: appGroupIdentifier) ?? .standard
    }

    static func load() -> GenerationSettings {
        let defaults = sharedDefaults
        let storedModelID = defaults.string(forKey: modelIDKey) ?? defaultModelID
        return GenerationSettings(
            providerID: defaults.string(forKey: providerIDKey) ?? defaultProviderID,
            modelID: supportedModelIDs.contains(storedModelID) ? storedModelID : defaultModelID,
            summaryEngine: defaults.string(forKey: summaryEngineKey) ?? defaultSummaryEngine
        )
    }

    func save() {
        let defaults = Self.sharedDefaults
        defaults.set(providerID, forKey: Self.providerIDKey)
        defaults.set(modelID, forKey: Self.modelIDKey)
        defaults.set(summaryEngine, forKey: Self.summaryEngineKey)
    }

    var payload: [String: Any] {
        [
            "providerID": providerID,
            "modelID": modelID,
            "summaryEngine": summaryEngine,
        ]
    }

    static var providerOptions: [[String: String]] {
        [
            [
                "id": "openaiCodex",
                "label": "ChatGPT / Codex",
            ],
        ]
    }

    static var modelOptions: [[String: String]] {
        [
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

    static var summaryOptions: [[String: String]] {
        [
            [
                "id": "appleIntelligence",
                "label": "Apple Intelligence",
            ],
            [
                "id": "selectedModel",
                "label": "Selected model",
            ],
        ]
    }
}
