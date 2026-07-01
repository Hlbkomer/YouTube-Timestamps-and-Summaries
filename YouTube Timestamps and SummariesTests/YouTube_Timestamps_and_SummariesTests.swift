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

        #expect(appSettingsSource.contains(#"static let chatGPTProviderID = "openaiCodex""#))
        #expect(appSettingsSource.contains(#"static let defaultProviderID = chatGPTProviderID"#))
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
            #"static let summaryModelIDKey = "generation.summaryModelID""#,
            #"static let chatGPTProviderID = "openaiCodex""#,
            #"static let defaultProviderID = chatGPTProviderID"#,
            #"static let defaultModelID = "gpt-5.5""#,
            #"static let defaultSummaryEngine = "selectedModel""#,
            #"static let grokProviderID = "xaiOAuth""#,
            #"static func modelOptions(for providerID: String)"#,
            #"static func supportedModelIDs(for providerID: String)"#,
        ]

        for contract in sharedContracts {
            #expect(appSettingsSource.contains(contract))
            #expect(extensionSettingsSource.contains(contract))
        }

        #expect(appSettingsSource.contains(#""id": "grok-4.3""#))
        #expect(extensionSettingsSource.contains(#""id": "grok-4.3""#))
        #expect(appSettingsSource.contains(#""id": "grok-build-0.1""#) == false)
        #expect(extensionSettingsSource.contains(#""id": "grok-build-0.1""#) == false)
        #expect(appSettingsSource.contains(#"? "grok-4.3""#))
        #expect(extensionSettingsSource.contains(#"? "grok-4.3""#))
    }

    @Test func summaryModelCanBeIndependentFromTimestampModel() throws {
        let appSettingsSource = try source(appPath("GenerationSettings.swift"))
        let extensionSettingsSource = try source(extensionPath("GenerationSettings.swift"))
        let viewControllerSource = try source(appPath("ViewController.swift"))

        #expect(appSettingsSource.contains(#"static let appleIntelligenceModelID = "appleIntelligence""#))
        #expect(appSettingsSource.contains(#"let summaryModelID: String"#))
        #expect(extensionSettingsSource.contains(#"let summaryModelID: String"#))
        #expect(viewControllerSource.contains(#"let providerModels = GenerationSettings.modelOptions(for: providerID)"#))
        #expect(viewControllerSource.contains(#"] + providerModels"#))
    }

    @Test func selectedProviderIsOptionalWhenAppleIntelligenceCanSummarize() throws {
        let viewControllerSource = try source(appPath("ViewController.swift"))
        let extensionHandlerSource = try source(extensionPath("SafariWebExtensionHandler.swift"))

        #expect(viewControllerSource.contains(#"if !selectedProviderConnected, appleIntelligenceAvailable"#))
        #expect(viewControllerSource.contains(#"summaryEngine: "appleIntelligence""#))
        #expect(viewControllerSource.contains(#"if !selectedProviderConnected {"#))
        #expect(extensionHandlerSource.contains(#"if !selectedProviderConnected, appleConfigured {"#))
        #expect(extensionHandlerSource.contains(#""timestampsAvailable": selectedProviderConnected"#))
        #expect(extensionHandlerSource.contains(#""summaryAvailable": summaryAvailable"#))
    }

    @Test func grokProviderUsesDirectOAuthResponsesWithoutExternalProcess() throws {
        let grokSource = try source(extensionPath("GrokGenerationService.swift"))
        let appAuthSource = try source(appPath("XAIAuthService.swift"))
        let extensionAuthSource = try source(extensionPath("XAIAuthService.swift"))
        let viewControllerSource = try source(appPath("ViewController.swift"))
        let mainHTMLSource = try source(appPath("Resources/Base.lproj/Main.html"))

        #expect(grokSource.contains(#"https://api.x.ai/v1/responses"#))
        #expect(grokSource.contains(#"authService.accessToken()"#))
        #expect(grokSource.contains(#"output_text.delta"#))
        #expect(grokSource.contains("Process(") == false)
        #expect(appAuthSource.contains(#"https://auth.x.ai/.well-known/openid-configuration"#))
        #expect(appAuthSource.contains(#"grok-cli:access api:access"#))
        #expect(appAuthSource.contains(#"code_challenge_method", value: "S256""#))
        #expect(appAuthSource.contains(#"plan", value: "generic""#))
        #expect(appAuthSource.contains("completeManualSignIn"))
        #expect(appAuthSource.contains(#"127.0.0.1"#))
        #expect(appAuthSource.contains(#"requiredInterfaceType = .loopback"#))
        #expect(appAuthSource.contains(#"listener.port?.rawValue == Self.port"#))
        #expect(extensionAuthSource.contains(#"xaiOAuth.accessToken"#))
        #expect(viewControllerSource.contains(#"case "completeGrokLogin":"#))
        #expect(mainHTMLSource.contains(#"id="grok-callback""#))
    }

    @Test func grokOAuthKeepsAppAndExtensionSandboxedWithoutBridgeBuildSettings() throws {
        let appEntitlements = try source(appPath("App.entitlements"))
        let extensionEntitlements = try source(extensionPath("Extension.entitlements"))
        let projectSource = try source("YouTube Timestamps and Summaries.xcodeproj/project.pbxproj")

        #expect(appEntitlements.contains("com.apple.security.app-sandbox"))
        #expect(appEntitlements.contains("com.apple.security.network.server"))
        #expect(extensionEntitlements.contains("com.apple.security.app-sandbox"))
        #expect(extensionEntitlements.contains("com.apple.security.network.server") == false)
        #expect(projectSource.contains("ENABLE_APP_SANDBOX = YES"))
        #expect(projectSource.contains("App.Debug.entitlements") == false)
        #expect(projectSource.contains("Extension.Debug.entitlements") == false)
        #expect(projectSource.contains("GROK_BRIDGE") == false)
        #expect(projectSource.contains("Embed Grok Bridge") == false)
    }

    @Test func invalidatedChatGPTTokensAreCleared() throws {
        let codexGenerationSource = try source(extensionPath("CodexGenerationService.swift"))

        #expect(codexGenerationSource.contains(#"Your authentication token has been invalidated"#) == false)
        #expect(codexGenerationSource.contains(#"ChatGPT sign-in expired. Open the companion app and sign in again."#))
        #expect(codexGenerationSource.contains(#"authService.signOut()"#))
        #expect(codexGenerationSource.contains(#"lowercasedMessage.contains("authentication token")"#))
        #expect(codexGenerationSource.contains(#"lowercasedMessage.contains("invalidated")"#))
    }

    @Test func macOS27AppleIntelligenceSummaryUsesTheOnDevicePath() throws {
        let appleIntelligenceSource = try source(extensionPath("AppleIntelligenceService.swift"))

        #expect(appleIntelligenceSource.contains(#"#if compiler(>=6.4)"#))
        #expect(appleIntelligenceSource.contains(#"if #available(macOS 27.0, *)"#))
        #expect(appleIntelligenceSource.contains(#"if kind == "summaryFull""#))
        #expect(appleIntelligenceSource.contains(#"generateMacOS27FullSummary"#))
        #expect(appleIntelligenceSource.contains(#"tokenAwareFullSummaryChunkPlan"#))
        #expect(appleIntelligenceSource.contains(#"model.tokenCount(for:"#))
        #expect(appleIntelligenceSource.contains(#"session.prewarm(promptPrefix:"#))
        #expect(appleIntelligenceSource.contains(#""summaryPath""#))
    }

    @Test func macOS27SummaryReplacesTheExperimentalSidebarTabs() throws {
        let contentSource = try source(extensionPath("Resources/content.js"))
        let backgroundSource = try source(extensionPath("Resources/background.js"))
        let appleIntelligenceSource = try source(extensionPath("AppleIntelligenceService.swift"))

        #expect(contentSource.contains(#"data-tab="summaryBeta""#) == false)
        #expect(contentSource.contains(#"data-tab="timestampsBeta""#) == false)
        #expect(contentSource.contains(#"summaryFullBeta"#) == false)
        #expect(contentSource.contains(#"timestampsBeta"#) == false)
        #expect(contentSource.contains(#"T27"#) == false)
        #expect(backgroundSource.contains(#"summaryFullBeta"#) == false)
        #expect(backgroundSource.contains(#"timestampsBeta"#) == false)
        #expect(contentSource.contains(#"SHOW_GENERATION_TIMING_IN_RESULT_CAPTIONS"#))
        #expect(contentSource.contains(#"function resultCaption(kind)"#))
        #expect(contentSource.contains(#"? "Apple Intelligence""#))
        #expect(contentSource.contains(#"` in ${formatGenerationDuration(durationMs)}`"#))
        #expect(contentSource.contains(#"`Generated with ${engineLabel}${durationSuffix}."#))
        #expect(contentSource.contains(#"return kind === "timestamps" ? "Timestamps" : "Summary";"#))
        #expect(contentSource.contains(#"function readNativeTranscriptPanel()"#))
        #expect(contentSource.contains(#"transcript: track failed (${trackLabel(track)}: ${lastError})"#))
        #expect(contentSource.contains(#"function nativeTranscriptDOMSummary()"#))
        #expect(contentSource.contains(#"roots=${roots.length}"#))
        #expect(appleIntelligenceSource.contains(#"kind == "summaryFull""#))
        #expect(appleIntelligenceSource.contains(#"generateMacOS27FullSummary"#))
        #expect(appleIntelligenceSource.contains(#"legacyFullSummaryChunkPlan("#))
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
