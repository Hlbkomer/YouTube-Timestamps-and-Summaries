//
//  SafariWebExtensionHandler.swift
//  YouTube Timestamps and Summaries Extension
//
//  Created by Matus Vojtek on 21/04/2026.
//

import SafariServices
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
            return await service.generate(kind: kind, transcript: transcript)

        case "generateCodexTimestamps":
            let transcript = payload["transcript"] as? String ?? ""
            let model = payload["model"] as? String ?? GenerationSettings.load().modelID
            return await codexService.generateTimestamps(
                transcript: transcript,
                model: model
            )

        case "generateCodexSummary":
            let transcript = payload["transcript"] as? String ?? ""
            let model = payload["model"] as? String ?? GenerationSettings.load().modelID
            return await codexService.generateSummary(
                transcript: transcript,
                model: model
            )

        default:
            return [
                "ok": false,
                "error": "Unsupported native action: \(action)"
            ]
        }
    }

    private func openContainerApp(from context: NSExtensionContext) async -> [String: Any] {
        // Do not use NSWorkspace from the extension sandbox. It can fail with
        // "(null) does not have permission to open (null)". Opening the app's
        // registered URL scheme through the extension context keeps the handoff
        // inside the host-approved extension API.
        await withCheckedContinuation { continuation in
            context.open(companionAppURL) { success in
                continuation.resume(returning: [
                    "ok": success,
                    "error": success ? "" : "The companion app could not be opened from Safari."
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
        let effectiveSummaryEngine = settings.summaryEngine == "appleIntelligence" && !appleConfigured
            ? "selectedModel"
            : settings.summaryEngine
        let summaryUsesApple = effectiveSummaryEngine == "appleIntelligence"
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
            "isConfigured": codexConnected && (!summaryUsesApple || appleConfigured),
            "appleIntelligence": appleStatus,
            "codex": codexStatus,
            "settings": settingsPayload,
        ]
    }
}
