//
//  GeminiNativeService.swift
//  YouTube Timestamps and Summaries Extension
//
//  Created by Codex on 21/04/2026.
//

import AppKit
import Foundation
import os.log

enum GeminiNativeError: LocalizedError {
    case missingConfiguration
    case notSignedIn
    case invalidVideoURL
    case googleRequestFailed(String)

    var errorDescription: String? {
        switch self {
        case .missingConfiguration:
            return "Open the companion app and add your Google OAuth Client ID, Client Secret, and Project ID first."
        case .notSignedIn:
            return "Open the companion app and sign in with Google first."
        case .invalidVideoURL:
            return "This YouTube page does not have a valid video URL."
        case .googleRequestFailed(let message):
            return message
        }
    }
}

private struct OAuthTokenResponse: Decodable {
    let access_token: String
    let expires_in: Int
    let refresh_token: String?
    let scope: String
    let token_type: String
    let error: String?
    let error_description: String?
}

private struct GeminiErrorEnvelope: Decodable {
    struct GeminiErrorBody: Decodable {
        let message: String?
    }

    let error: GeminiErrorBody?
}

private struct GeminiGenerateResponse: Decodable {
    struct Candidate: Decodable {
        struct Content: Decodable {
            struct Part: Decodable {
                let text: String?
            }

            let parts: [Part]?
        }

        let content: Content?
    }

    struct PromptFeedback: Decodable {
        let blockReason: String?
    }

    let candidates: [Candidate]?
    let promptFeedback: PromptFeedback?
}

final class GeminiNativeService {
    private let store = SharedGeminiStore.shared
    private let session = URLSession.shared
    private let logger = Logger(subsystem: "Matuko.YouTube-Timestamps-and-Summaries", category: "Gemini")

    func statusPayload() -> [String: Any] {
        let config = store.config
        let token = store.token
        let prompts = store.prompts
        let selectedModel = store.model.rawValue

        return [
            "ok": true,
            "model": selectedModel,
            "isConfigured": config?.isComplete ?? false,
            "isSignedIn": token?.isUsable ?? false,
            "timestampsPrompt": prompts.timestamps,
            "summaryPrompt": prompts.summary,
        ]
    }

    func openContainerApp() -> [String: Any] {
        guard let appURL = containingAppURL() else {
            return [
                "ok": false,
                "error": "The companion app could not be opened from the extension."
            ]
        }

        let opened = NSWorkspace.shared.open(appURL)
        return [
            "ok": opened,
            "error": opened ? "" : "The companion app could not be opened from the extension."
        ]
    }

    func generate(videoURL: String, kind: String) async -> [String: Any] {
        let selectedModel = store.model.rawValue
        print("[GeminiNative] Starting generation. kind=\(kind) model=\(selectedModel)")
        logger.log("Starting Gemini generation. kind=\(kind, privacy: .public) model=\(selectedModel, privacy: .public) url=\(videoURL, privacy: .public)")
        do {
            let promptConfig = store.prompts
            let rawPrompt = kind == "summary" ? promptConfig.summary : promptConfig.timestamps
            let trimmedPrompt = rawPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedPrompt.isEmpty else {
                throw GeminiNativeError.googleRequestFailed("Add a prompt before sending the YouTube video to Gemini.")
            }

            guard URL(string: videoURL) != nil else {
                throw GeminiNativeError.invalidVideoURL
            }

            let config = try requireConfig()
            let accessToken = try await currentAccessToken(using: config)
            let text = try await requestGeminiText(
                accessToken: accessToken,
                model: selectedModel,
                projectID: config.trimmedProjectID,
                videoURL: videoURL,
                prompt: trimmedPrompt
            )

            print("[GeminiNative] Generation succeeded. kind=\(kind) textLength=\(text.count)")
            logger.log("Gemini generation succeeded. kind=\(kind, privacy: .public) textLength=\(text.count, privacy: .public)")
            return [
                "ok": true,
                "text": text,
                "debug": [
                    "layer": "native",
                    "kind": kind,
                    "model": selectedModel,
                    "step": "completed",
                    "textLength": text.count,
                ],
            ]
        } catch {
            let message = error.localizedDescription.isEmpty ? String(describing: error) : error.localizedDescription
            print("[GeminiNative] Generation failed. kind=\(kind) message=\(message)")
            logger.error("Gemini generation failed. kind=\(kind, privacy: .public) message=\(message, privacy: .private(mask: .hash))")
            return [
                "ok": false,
                "error": message,
                "debug": [
                    "layer": "native",
                    "kind": kind,
                    "model": selectedModel,
                    "step": "failed",
                    "detail": message,
                ],
            ]
        }
    }

    private func requireConfig() throws -> GeminiOAuthConfig {
        guard let config = store.config, config.isComplete else {
            throw GeminiNativeError.missingConfiguration
        }

        return config
    }

    private func currentAccessToken(using config: GeminiOAuthConfig) async throws -> String {
        guard let token = store.token, token.isUsable else {
            throw GeminiNativeError.notSignedIn
        }

        if token.expiryDate > Date().addingTimeInterval(60) {
            print("[GeminiNative] Using cached Google access token.")
            logger.log("Using cached access token.")
            return token.accessToken
        }

        print("[GeminiNative] Refreshing Google access token.")
        logger.log("Refreshing Google access token.")
        let refreshedToken = try await refreshAccessToken(
            refreshToken: token.refreshToken,
            clientID: config.trimmedClientID,
            clientSecret: config.trimmedClientSecret
        )

        let merged = GeminiOAuthToken(
            accessToken: refreshedToken.access_token,
            refreshToken: refreshedToken.refresh_token ?? token.refreshToken,
            scope: refreshedToken.scope,
            tokenType: refreshedToken.token_type,
            expiryDate: Date().addingTimeInterval(TimeInterval(refreshedToken.expires_in))
        )
        store.token = merged
        return merged.accessToken
    }

    private func refreshAccessToken(refreshToken: String, clientID: String, clientSecret: String) async throws -> OAuthTokenResponse {
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = formEncodedData([
            "client_id": clientID,
            "client_secret": clientSecret,
            "refresh_token": refreshToken,
            "grant_type": "refresh_token",
        ])

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw GeminiNativeError.googleRequestFailed("Google returned an invalid OAuth response.")
        }

        print("[GeminiNative] Google token refresh status=\(httpResponse.statusCode)")
        logger.log("Google token refresh responded with status=\(httpResponse.statusCode, privacy: .public)")
        let decoded = try JSONDecoder().decode(OAuthTokenResponse.self, from: data)
        if httpResponse.statusCode >= 400 {
            let message = decoded.error_description ?? decoded.error ?? "Google rejected the access token refresh."
            throw GeminiNativeError.googleRequestFailed(message)
        }

        return decoded
    }

    private func requestGeminiText(
        accessToken: String,
        model: String,
        projectID: String,
        videoURL: String,
        prompt: String
    ) async throws -> String {
        var request = URLRequest(url: URL(string: "https://generativelanguage.googleapis.com/v1beta/models/\(model):generateContent")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 300
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(projectID, forHTTPHeaderField: "x-goog-user-project")

        let promptText = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        let urlText = videoURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let payload: [String: Any] = [
            "contents": [[
                "parts": [
                    ["text": promptText],
                    ["file_data": [
                        "mime_type": "video/*",
                        "file_uri": urlText,
                    ]],
                ],
            ]],
            "store": false,
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        print("[GeminiNative] Sending Gemini request. model=\(model) promptLength=\(promptText.count) urlLength=\(urlText.count)")
        logger.log("Sending Gemini request. model=\(model, privacy: .public) promptLength=\(promptText.count, privacy: .public) urlLength=\(urlText.count, privacy: .public)")

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw GeminiNativeError.googleRequestFailed("Gemini returned an invalid response.")
        }

        print("[GeminiNative] Gemini response status=\(httpResponse.statusCode) bytes=\(data.count)")
        logger.log("Gemini responded with status=\(httpResponse.statusCode, privacy: .public) bytes=\(data.count, privacy: .public)")
        if httpResponse.statusCode >= 400 {
            let responseText = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            print("[GeminiNative] Gemini request failed. status=\(httpResponse.statusCode) body=\(responseText)")
            logger.error("Gemini request failed. model=\(model, privacy: .public) status=\(httpResponse.statusCode) body=\(responseText, privacy: .private(mask: .hash))")
            let envelope = try? JSONDecoder().decode(GeminiErrorEnvelope.self, from: data)
            let message = envelope?.error?.message
                ?? (responseText.isEmpty ? nil : responseText)
                ?? "Gemini rejected the request."
            throw GeminiNativeError.googleRequestFailed(message)
        }

        let decoded = try JSONDecoder().decode(GeminiGenerateResponse.self, from: data)
        let text = decoded.candidates?
            .compactMap { $0.content?.parts?.compactMap(\.text).joined(separator: "\n") }
            .first(where: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })

        if let text {
            return text
        }

        if let blockReason = decoded.promptFeedback?.blockReason {
            print("[GeminiNative] Gemini blocked request. reason=\(blockReason)")
            logger.error("Gemini blocked the request. model=\(model, privacy: .public) blockReason=\(blockReason, privacy: .public)")
            throw GeminiNativeError.googleRequestFailed("Gemini blocked the request: \(blockReason).")
        }

        print("[GeminiNative] Gemini returned no text.")
        logger.error("Gemini returned no text. model=\(model, privacy: .public)")
        throw GeminiNativeError.googleRequestFailed("Gemini returned no text for this video.")
    }

    private func formEncodedData(_ values: [String: String]) -> Data {
        let body = values
            .map { key, value in
                "\(percentEncode(key))=\(percentEncode(value))"
            }
            .joined(separator: "&")

        return Data(body.utf8)
    }

    private func percentEncode(_ value: String) -> String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "+&=")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    private func containingAppURL() -> URL? {
        let bundleURL = Bundle.main.bundleURL
        let pluginsURL = bundleURL.deletingLastPathComponent()
        let contentsURL = pluginsURL.deletingLastPathComponent()
        return contentsURL.deletingLastPathComponent()
    }
}
