//
//  SafariWebExtensionHandler.swift
//  YouTube Timestamps and Summaries Extension
//
//  Created by Matus Vojtek on 21/04/2026.
//

import SafariServices
import os.log

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    private let service = GeminiNativeService()
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
            let payload = await handleMessage(message)
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

    private func handleMessage(_ message: Any?) async -> [String: Any] {
        guard let payload = message as? [String: Any], let action = payload["action"] as? String else {
            return [
                "ok": false,
                "error": "The extension received an invalid request."
            ]
        }

        switch action {
        case "getStatus":
            return service.statusPayload()

        case "openContainerApp":
            return service.openContainerApp()

        case "generateContent":
            let videoURL = payload["videoURL"] as? String ?? ""
            let kind = payload["kind"] as? String ?? "timestamps"
            return await service.generate(videoURL: videoURL, kind: kind)

        default:
            return [
                "ok": false,
                "error": "Unsupported native action: \(action)"
            ]
        }
    }
}
