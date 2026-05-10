//
//  SafariWebExtensionHandler.swift
//  Timestamps & Summaries for YT Extension
//
//  Created by Matus Vojtek on 21/04/2026.
//

import SafariServices
import AppKit
import os.log

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    private let service = AppleIntelligenceService()
    private let codexService = CodexGenerationService()
    private let codexAuthService = CodexAuthService()
    private let companionAppURL = URL(string: "youtube-timestamps-summaries://open")!
    private let logger = Logger(subsystem: "Matuko.YouTube-Timestamps-and-Summaries", category: "NativeBridge")

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = request?.userInfo?["profile"] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        let receivedLine = "[NativeBridge] Received native message. profile=\(profile?.uuidString ?? "none")"
        print(receivedLine)
        logger.log(
            "Received native message. profile=\(profile?.uuidString ?? "none", privacy: .public) payload=\(String(describing: message), privacy: .private(mask: .hash))"
        )

        Task {
            let payload = await handleMessage(message, context: context)
            print("[NativeBridge] Completed native message with ok=\((payload["ok"] as? Bool) == true)")
            logger.log("Completed native message with ok=\((payload["ok"] as? Bool) == true, privacy: .public)")
            let response = NSExtensionItem()

            if #available(iOS 15.0, macOS 11.0, *) {
                response.userInfo = [SFExtensionMessageKey: payload]
            } else {
                response.userInfo = ["message": payload]
            }

            context.completeRequest(returningItems: [response], completionHandler: nil)
        }
    }

    private func handleMessage(_ message: Any?, context: NSExtensionContext) async -> [String: Any] {
        guard let payload = message as? [String: Any], let action = payload["action"] as? String else {
            return [
                "ok": false,
                "error": "The extension received an invalid request."
            ]
        }

        switch action {
        case "getStatus":
            return await statusPayload()

        case "openContainerApp":
            return await openContainerApp(from: context)

        case "generateContent":
            let kind = payload["kind"] as? String ?? "timestamps"
            let transcript = payload["transcript"] as? String ?? ""
            let languageCode = payload["languageCode"] as? String ?? ""
            let languageLabel = payload["languageLabel"] as? String ?? ""
            return await service.generate(
                kind: kind,
                transcript: transcript,
                languageCode: languageCode,
                languageLabel: languageLabel
            )

        case "generateCodexTimestamps":
            let transcript = payload["transcript"] as? String ?? ""
            let model = payload["model"] as? String ?? GenerationSettings.load().modelID
            let languageCode = payload["languageCode"] as? String ?? ""
            let languageLabel = payload["languageLabel"] as? String ?? ""
            return await codexService.generateTimestamps(
                transcript: transcript,
                model: model,
                languageCode: languageCode,
                languageLabel: languageLabel
            )

        case "generateCodexSummary":
            let transcript = payload["transcript"] as? String ?? ""
            let model = payload["model"] as? String ?? GenerationSettings.load().modelID
            let languageCode = payload["languageCode"] as? String ?? ""
            let languageLabel = payload["languageLabel"] as? String ?? ""
            return await codexService.generateSummary(
                transcript: transcript,
                model: model,
                languageCode: languageCode,
                languageLabel: languageLabel
            )

        default:
            return [
                "ok": false,
                "error": "Unsupported native action: \(action)"
            ]
        }
    }

    private func openContainerApp(from context: NSExtensionContext) async -> [String: Any] {
        // Toolbar popups should not navigate Safari to the custom URL scheme.
        // Open the containing app bundle directly from the native extension,
        // matching the pattern used by several macOS Safari companion apps.
        if let appURL = containingAppURL() {
            let result = await openApplication(at: appURL)
            if (result["ok"] as? Bool) == true {
                return result
            }
        }

        if NSWorkspace.shared.open(companionAppURL) {
            return [
                "ok": true,
                "error": ""
            ]
        }

        return await withCheckedContinuation { continuation in
            context.open(companionAppURL) { success in
                continuation.resume(returning: [
                    "ok": success,
                    "error": success ? "" : "The companion app could not be opened from Safari."
                ])
            }
        }
    }

    private func containingAppURL() -> URL? {
        let appexURL = Bundle.main.bundleURL
        guard appexURL.pathExtension == "appex" else {
            return NSWorkspace.shared.urlForApplication(withBundleIdentifier: "Matuko.YouTube-Timestamps-and-Summaries")
        }

        let contentsURL = appexURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        return contentsURL.deletingLastPathComponent()
    }

    private func openApplication(at appURL: URL) async -> [String: Any] {
        await withCheckedContinuation { continuation in
            let configuration = NSWorkspace.OpenConfiguration()
            configuration.activates = true

            NSWorkspace.shared.openApplication(at: appURL, configuration: configuration) { application, error in
                continuation.resume(returning: [
                    "ok": application != nil && error == nil,
                    "error": error?.localizedDescription ?? ""
                ])
            }
        }
    }

    private func statusPayload() async -> [String: Any] {
        let appleStatus = service.statusPayload()
        let codexStatus = await codexAuthService.statusPayload(refresh: true)
        let settings = GenerationSettings.load()
        let appleConfigured = (appleStatus["isConfigured"] as? Bool) == true
        let codexConnected = (codexStatus["connected"] as? Bool) == true
        let effectiveSummaryEngine: String
        if !codexConnected, appleConfigured {
            effectiveSummaryEngine = "appleIntelligence"
        } else if settings.summaryEngine == "appleIntelligence", !appleConfigured {
            effectiveSummaryEngine = "selectedModel"
        } else {
            effectiveSummaryEngine = settings.summaryEngine
        }
        let summaryUsesApple = effectiveSummaryEngine == "appleIntelligence"
        let summaryAvailable = summaryUsesApple ? appleConfigured : codexConnected
        let modelLabel = GenerationSettings.modelLabel(for: settings.modelID)
        let summaryEngineLabel = summaryUsesApple ? "Apple Intelligence" : modelLabel
        var settingsPayload = settings.payload
        settingsPayload["summaryEngine"] = effectiveSummaryEngine
        settingsPayload["modelLabel"] = modelLabel
        settingsPayload["summaryEngineLabel"] = summaryEngineLabel

        return [
            "ok": true,
            "engine": summaryUsesApple ? "\(modelLabel) + Apple Intelligence" : modelLabel,
            "generationMode": "selectedProvider",
            "isConfigured": codexConnected || summaryAvailable,
            "timestampsAvailable": codexConnected,
            "summaryAvailable": summaryAvailable,
            "appleIntelligence": appleStatus,
            "codex": codexStatus,
            "settings": settingsPayload,
        ]
    }
}
