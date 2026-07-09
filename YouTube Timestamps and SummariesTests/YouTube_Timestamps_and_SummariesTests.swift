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
            #"static let chapterPreferenceKey = "generation.chapterPreference""#,
            #"static let chatGPTProviderID = "openaiCodex""#,
            #"static let defaultProviderID = chatGPTProviderID"#,
            #"static let defaultModelID = "gpt-5.5""#,
            #"static let defaultSummaryEngine = "selectedModel""#,
            #"static let preferNativeChapters = "preferNative""#,
            #"static let alwaysGenerateChapters = "alwaysGenerate""#,
            #"static let defaultChapterPreference = preferNativeChapters"#,
            #"static let grokProviderID = "xaiOAuth""#,
            #"static let defaultGrokModelID = "grok-4.5""#,
            #"static func modelOptions(for providerID: String)"#,
            #"static func supportedModelIDs(for providerID: String)"#,
            #"static func isUsableModelID(_ modelID: String, providerID: String) -> Bool"#,
            #"static var chapterPreferenceOptions: [[String: String]]"#,
        ]

        for contract in sharedContracts {
            #expect(appSettingsSource.contains(contract))
            #expect(extensionSettingsSource.contains(contract))
        }

        #expect(appSettingsSource.contains(#""id": defaultGrokModelID"#))
        #expect(extensionSettingsSource.contains(#""id": defaultGrokModelID"#))
        #expect(appSettingsSource.contains(#""id": "grok-4.3""#))
        #expect(extensionSettingsSource.contains(#""id": "grok-4.3""#))
        #expect(appSettingsSource.contains(#""id": "grok-build-0.1""#) == false)
        #expect(extensionSettingsSource.contains(#""id": "grok-build-0.1""#) == false)
        #expect(appSettingsSource.contains(#"? defaultGrokModelID"#))
        #expect(extensionSettingsSource.contains(#"? defaultGrokModelID"#))
        #expect(appSettingsSource.contains(#"!modelID.hasPrefix("grok-4.20")"#))
        #expect(extensionSettingsSource.contains(#"!modelID.hasPrefix("grok-4.20")"#))
        #expect(appSettingsSource.contains(#"!modelID.hasPrefix("grok-420")"#))
        #expect(extensionSettingsSource.contains(#"!modelID.hasPrefix("grok-420")"#))
        #expect(appSettingsSource.contains(#"modelID.hasPrefix("gpt-")"#))
        #expect(extensionSettingsSource.contains(#"modelID.hasPrefix("gpt-")"#))
    }

    @Test func summaryModelCanBeIndependentFromTimestampModel() throws {
        let appSettingsSource = try source(appPath("GenerationSettings.swift"))
        let extensionSettingsSource = try source(extensionPath("GenerationSettings.swift"))
        let viewControllerSource = try source(appPath("ViewController.swift"))

        #expect(appSettingsSource.contains(#"static let appleIntelligenceModelID = "appleIntelligence""#))
        #expect(appSettingsSource.contains(#"let summaryModelID: String"#))
        #expect(extensionSettingsSource.contains(#"let summaryModelID: String"#))
        #expect(viewControllerSource.contains(#"private func modelOptions("#))
        #expect(viewControllerSource.contains(#"xaiAuthService.modelOptions()"#))
        #expect(viewControllerSource.contains(#"] + providerModels"#))
    }

    @Test func chatGPTModelPickerCanUseRemoteCatalog() throws {
        let catalogServiceSource = try source(appPath("RemoteModelCatalogService.swift"))
        let viewControllerSource = try source(appPath("ViewController.swift"))
        let catalogJSON = try source("docs/model-catalog.json")
        let catalogDocumentation = try source("docs/model-catalog.md")
        let privacySource = try source("docs/privacy.md")

        #expect(catalogServiceSource.contains(#"https://raw.githubusercontent.com/Hlbkomer/YouTube-Timestamps-and-Summaries/main/docs/model-catalog.json"#))
        #expect(catalogServiceSource.contains(#"private let cacheDuration: TimeInterval = 60 * 60"#))
        #expect(catalogServiceSource.contains(#"private let failureRetryDelay: TimeInterval = 15 * 60"#))
        #expect(catalogServiceSource.contains(#"GenerationSettings.isUsableModelID(model.id, providerID: providerID)"#))
        #expect(viewControllerSource.contains(#"private let remoteModelCatalogService = RemoteModelCatalogService()"#))
        #expect(viewControllerSource.contains(#"providerID == GenerationSettings.chatGPTProviderID"#))
        #expect(viewControllerSource.contains(#"remoteModelCatalogService.modelCatalog(for: providerID)"#))
        #expect(catalogJSON.contains(#""openaiCodex""#))
        #expect(catalogJSON.contains(#""id": "gpt-5.6""#))
        #expect(catalogJSON.contains(#""id": "gpt-5.6-terra""#))
        #expect(catalogJSON.contains(#""id": "gpt-5.6-luna""#))
        #expect(catalogJSON.contains(#""id": "gpt-5.5""#))
        #expect(catalogJSON.contains(#""id": "gpt-5.4""#))
        #expect(catalogJSON.contains(#""id": "gpt-5.4-mini""#))
        #expect(catalogDocumentation.contains("The catalog must be on `main`"))
        #expect(catalogDocumentation.contains("one-hour in-memory cache"))
        #expect(catalogDocumentation.contains("Grok 4.20, Grok Build, Imagine, and voice models are excluded"))
        #expect(privacySource.contains("model catalog JSON file"))
        #expect(privacySource.contains("does not include YouTube transcripts, video URLs, or provider sign-in tokens"))
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
        #expect(grokSource.contains(#"GenerationSettings.isUsableModelID(safeModel, providerID: Self.providerID)"#))
        #expect(grokSource.contains("Process(") == false)
        #expect(appAuthSource.contains(#"https://auth.x.ai/.well-known/openid-configuration"#))
        #expect(appAuthSource.contains(#"https://api.x.ai/v1/language-models"#))
        #expect(appAuthSource.contains(#"input_modalities"#))
        #expect(appAuthSource.contains(#"output_modalities"#))
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

    @Test func nativeYouTubeChaptersPopulateTimestampsBeforeGeneration() throws {
        let contentSource = try source(extensionPath("Resources/content.js"))

        #expect(contentSource.contains(#"parseNativeYouTubeChapters,"#))
        #expect(contentSource.contains(#"function applyNativeChaptersIfAvailable("#))
        #expect(contentSource.contains(#"function hasNativeYouTubeChapters("#))
        #expect(contentSource.contains(#"function shouldGenerateChaptersInsteadOfNative("#))
        #expect(contentSource.contains(#"function effectiveChapterSource("#))
        #expect(contentSource.contains(#"nativeChapterCache"#))
        #expect(contentSource.contains(#"function nativeChaptersForVideo("#))
        #expect(contentSource.contains(#"state.timestampsSource === "youtubeChapters""#))
        #expect(contentSource.contains(#"chapterSourceOverrideByVideoKey"#))
        #expect(contentSource.contains(#"const chapters = parseNativeYouTubeChapters(getInitialData(videoKey));"#))
        #expect(contentSource.contains(#"state.timestampsSource = "youtubeChapters";"#))
        #expect(contentSource.contains(#"clearPendingGeneration(videoKey, "timestamps");"#))
        #expect(contentSource.contains(#"return "Using chapters already available on YouTube.";"#))
        #expect(contentSource.contains(#"!canGenerateTimestamps() && !state.timestampsText"#))
        #expect(contentSource.contains(#"if (applyNativeChaptersIfAvailable())"#))
        #expect(contentSource.contains(#"kind === "timestamps" && applyNativeChaptersIfAvailable(videoKey)"#))
        #expect(contentSource.contains(#"nativeChaptersAvailable: hasNativeYouTubeChapters(videoKey)"#))
        #expect(contentSource.contains(#"state.didAutogenerateAnalysis = false;"#))
        #expect(contentSource.contains(#"void maybeGenerateTimestamps();"#))
        let backgroundSource = try source(extensionPath("Resources/background.js"))
        #expect(backgroundSource.contains(#"nativeChaptersAvailable: Boolean(response?.nativeChaptersAvailable)"#))
        #expect(backgroundSource.contains(#"pageActionStateByVideoKey"#))
        #expect(backgroundSource.contains(#"function rememberedEffectiveChapterSource("#))
        #expect(backgroundSource.contains(#"rememberPageActions(tab, response);"#))
    }

    @Test func nativeYouTubeInThisVideoPanelReceivesExtensionTabs() throws {
        let contentSource = try source(extensionPath("Resources/content.js"))
        let nativePanelSource = try source(extensionPath("Resources/native-panel.js"))

        #expect(nativePanelSource.contains(#"function getNativeInThisVideoPanel()"#))
        #expect(nativePanelSource.contains(#"nativePanelTitle(panel) === "In this video""#))
        #expect(nativePanelSource.contains(#"function syncTabs("#))
        #expect(nativePanelSource.contains(#"NATIVE_PANEL_TAB_WRAPPER_ATTRIBUTE"#))
        #expect(nativePanelSource.contains(#"currentState.timestampsSource !== "youtubeChapters""#))
        #expect(nativePanelSource.contains(#"return state().isLoading.timestamps ? "Chapters..." : "Chapters";"#))
        #expect(nativePanelSource.contains(#"async function handleExtensionTabSelection(kind)"#))
        #expect(contentSource.contains(#"data-yts-placement="native""#))
        #expect(nativePanelSource.contains(#"function isNativePanelVisible(panel)"#))
        #expect(nativePanelSource.contains(#"function open(mount)"#))
        #expect(contentSource.contains(#"if (nativePanel.open(nativeMount))"#))
        #expect(nativePanelSource.contains(#"state().nativePanelDismissed"#))
        #expect(contentSource.contains(#"const nativeMount = nativePanel.getMount();"#))
        #expect(nativePanelSource.contains(#"panel.setAttribute("visibility", NATIVE_PANEL_VISIBILITY_EXPANDED);"#))
        #expect(contentSource.contains(#"nativePanel.selectDefaultExtensionTab();"#))
        #expect(nativePanelSource.contains(#"function handleYouTubeControlClick(event)"#))
        #expect(contentSource.contains(#"document.addEventListener("click", nativePanel.handleYouTubeControlClick, true);"#))
        #expect(nativePanelSource.contains(#"function syncOwnedTabPressedState("#))
        #expect(nativePanelSource.contains(#"chip.classList.toggle("ytChipShapeSelected", selected);"#))
        #expect(nativePanelSource.contains(#"NATIVE_PANEL_HEADER_ACTION_ATTRIBUTE"#))
        #expect(nativePanelSource.contains(#"function syncHeaderCopyButton("#))
        #expect(nativePanelSource.contains(#"closeControl.parentElement.insertBefore(host, closeControl);"#))
        #expect(nativePanelSource.contains(#"button.addEventListener("click", (event) => {"#))
        #expect(nativePanelSource.contains(#"button.addEventListener("pointerdown", stopHeaderCopyEvent, true);"#))
        #expect(nativePanelSource.contains(#"function nativeOwnedTabButton(kind"#))
        #expect(nativePanelSource.contains(#"function selectNativeOwnedTab(kind"#))
        #expect(nativePanelSource.contains(#"const NATIVE_PANEL_TAB_ORDER = ["chapters", "summary", "transcript", "timeline"];"#))
        #expect(nativePanelSource.contains(#"function reorderTabs("#))
        #expect(nativePanelSource.contains(#"return kind === "timestamps" ? "chapters" : kind;"#))
        #expect(nativePanelSource.contains(#"reorderTabs(mount);"#))
        #expect(nativePanelSource.contains(#"currentState.timestampsSource === "youtubeChapters""#))
        #expect(nativePanelSource.contains(#"selectNativeOwnedTab("chapters", mount, { preserveUserSelection: true })"#))
        #expect(nativePanelSource.contains(#"currentState.nativeYouTubeTab = "chapters";"#))
        #expect(contentSource.contains(#"nativePanel.selectDefaultExtensionTab(nativeMount);"#))
        #expect(nativePanelSource.contains(#"function syncContentVisibility("#))
        #expect(nativePanelSource.contains(#"ytd-transcript-search-panel-renderer"#))
        #expect(nativePanelSource.contains(#"function headerCopyKind("#))
        #expect(nativePanelSource.contains(#"return nativeKind === "transcript" ? "transcript" : "";"#))
        #expect(contentSource.contains(#"function transcriptCopyText("#))
        #expect(contentSource.contains(#"return "Copy transcript";"#))
        #expect(contentSource.contains(#"function resultScrollSurface("#))
        #expect(nativePanelSource.contains(#"function syncBodyViewport("#))
        #expect(contentSource.contains(#"--yts-native-body-max-height"#))
        #expect(contentSource.contains(#"window.addEventListener("resize", () => nativePanel.syncBodyViewport());"#))
        #expect(contentSource.contains(#"requestAnimationFrame(() => nativePanel.syncBodyViewport());"#))
        #expect(contentSource.contains(#".native-body"#))
        #expect(!contentSource.contains(#"native-action-row"#))
        #expect(contentSource.contains(#".native-wrap .timestamp-link"#))
        #expect(contentSource.contains(#"padding: 0;"#))
        #expect(contentSource.contains(#"type: "native""#))
        #expect(contentSource.contains(#"type: "sidebar""#))
        #expect(nativePanelSource.contains(#"function syncNativeOwnedTabVisibility("#))
        #expect(nativePanelSource.contains(#"state().nativeChaptersOverridden"#))
        #expect(nativePanelSource.contains(#"function shouldRespectYouTubeTimelineSurface()"#))
        #expect(nativePanelSource.contains(#"function dismissNativePanel("#))
        #expect(nativePanelSource.contains(#"function revealNativeOwnedTab("#))
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
