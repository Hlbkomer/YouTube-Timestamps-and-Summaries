//
//  YouTube_Timestamps_and_SummariesTests.swift
//  Timestamps & Summaries for YT Tests
//
//  Created by Matus Vojtek on 21/04/2026.
//

import Foundation
import Testing

struct YouTube_Timestamps_and_SummariesTests {

    @Test func extensionBundleIdentifierMatchesSafariExtensionTarget() throws {
        let viewControllerSource = try source(appPath("ViewController.swift"))

        #expect(viewControllerSource.contains(#"let extensionBundleIdentifier = "Matuko.YouTube-Timestamps-and-Summaries.Extension""#))
    }

    @Test func generationDefaultsUseChatGPTForTimestampsAndSummary() throws {
        let appSettingsSource = try source(appPath("GenerationSettings.swift"))

        #expect(appSettingsSource.contains(#"static let defaultProviderID = "openaiCodex""#))
        #expect(appSettingsSource.contains(#"static let defaultModelID = "gpt-5.5""#))
        #expect(appSettingsSource.contains(#"static let defaultSummaryEngine = "selectedModel""#))
    }

    @Test func appAndExtensionGenerationDefaultsStayInSync() throws {
        let appSettingsSource = try source(appPath("GenerationSettings.swift"))
        let extensionSettingsSource = try source(extensionPath("GenerationSettings.swift"))

        let sharedContracts = [
            #"static let appGroupIdentifier = "group.Matuko.YouTube-Timestamps-and-Summaries.shared""#,
            #"static let providerIDKey = "generation.providerID""#,
            #"static let modelIDKey = "generation.modelID""#,
            #"static let summaryEngineKey = "generation.summaryEngine""#,
            #"static let defaultProviderID = "openaiCodex""#,
            #"static let defaultModelID = "gpt-5.5""#,
            #"static let defaultSummaryEngine = "selectedModel""#,
            #"static let supportedModelIDs = Set(["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"])"#,
        ]

        for contract in sharedContracts {
            #expect(appSettingsSource.contains(contract))
            #expect(extensionSettingsSource.contains(contract))
        }
    }

    @Test func appleIntelligenceRemainsOptionalSummaryChoice() throws {
        let appSettingsSource = try source(appPath("GenerationSettings.swift"))

        #expect(appSettingsSource.contains(#""id": "selectedModel""#))
        #expect(appSettingsSource.contains(#""id": "appleIntelligence""#))
    }

    private func source(_ path: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let url = root.appending(path: path)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func appPath(_ filename: String) -> String {
        let folder = ["YouTube", "Timestamps", "and", "Summaries"].joined(separator: " ")
        return "\(folder)/\(filename)"
    }

    private func extensionPath(_ filename: String) -> String {
        let folder = ["YouTube", "Timestamps", "and", "Summaries", "Extension"].joined(separator: " ")
        return "\(folder)/\(filename)"
    }
}
