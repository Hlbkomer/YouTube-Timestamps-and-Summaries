//
//  CodexAuthService.swift
//  YouTube Timestamps and Summaries
//
//  Created by Codex on 26/04/2026.
//

import Foundation

struct CodexDeviceLoginSession {
    let id: String
    let deviceAuthID: String
    let userCode: String
    let verificationURL: URL
    let intervalSeconds: TimeInterval
    let expiresAt: Date

    var payload: [String: Any] {
        [
            "id": id,
            "userCode": userCode,
            "verificationURL": verificationURL.absoluteString,
            "intervalSeconds": intervalSeconds,
            "expiresAt": Int(expiresAt.timeIntervalSince1970 * 1000),
        ]
    }
}

enum CodexAuthError: LocalizedError {
    case missingRefreshToken
    case invalidResponse(String)
    case requestFailed(String)
    case loginExpired

    var errorDescription: String? {
        switch self {
        case .missingRefreshToken:
            return "ChatGPT sign-in is missing a refresh token."
        case .invalidResponse(let message), .requestFailed(let message):
            return message
        case .loginExpired:
            return "The ChatGPT pairing code expired. Start sign-in again."
        }
    }
}

final class CodexAuthService {
    private let authBaseURL = URL(string: "https://auth.openai.com")!
    private let clientID = "app_EMoamEEZ73f0CkXaXp7hrann"
    private let callbackURL = "https://auth.openai.com/deviceauth/callback"
    private let tokenRefreshSkew: TimeInterval = 120
    private let defaultExpiry: TimeInterval = 3600

    private enum Keys {
        static let accessToken = "codex.accessToken"
        static let refreshToken = "codex.refreshToken"
        static let expiresAt = "codex.expiresAt"
        static let updatedAt = "codex.updatedAt"
    }

    func statusPayload(refresh: Bool = false) async -> [String: Any] {
        do {
            let tokens = try await tokens(refresh: refresh)
            return [
                "connected": true,
                "expiresAt": Int(tokens.expiresAt.timeIntervalSince1970 * 1000),
            ]
        } catch {
            let message: String
            if case CodexAuthError.missingRefreshToken = error {
                message = ""
            } else {
                message = refresh ? error.localizedDescription : ""
            }
            return [
                "connected": false,
                "error": message,
            ]
        }
    }

    func startDeviceLogin() async throws -> CodexDeviceLoginSession {
        let url = authBaseURL.appending(path: "/api/accounts/deviceauth/usercode")
        let body = try JSONSerialization.data(withJSONObject: ["client_id": clientID], options: [])
        let (data, response) = try await post(url: url, body: body, contentType: "application/json")
        guard response.statusCode == 200 else {
            throw CodexAuthError.requestFailed(errorMessage(from: data) ?? "ChatGPT sign-in could not start.")
        }

        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let deviceAuthID = json["device_auth_id"] as? String,
            let userCode = (json["user_code"] as? String) ?? (json["usercode"] as? String),
            !deviceAuthID.isEmpty,
            !userCode.isEmpty
        else {
            throw CodexAuthError.invalidResponse("ChatGPT sign-in did not return a pairing code.")
        }

        let interval = TimeInterval((json["interval"] as? Double) ?? 5)
        return CodexDeviceLoginSession(
            id: UUID().uuidString,
            deviceAuthID: deviceAuthID,
            userCode: userCode,
            verificationURL: authBaseURL.appending(path: "/codex/device"),
            intervalSeconds: max(1, interval),
            expiresAt: Date().addingTimeInterval(15 * 60)
        )
    }

    func pollDeviceLogin(_ session: CodexDeviceLoginSession) async throws -> Bool {
        guard Date() < session.expiresAt else {
            throw CodexAuthError.loginExpired
        }

        let url = authBaseURL.appending(path: "/api/accounts/deviceauth/token")
        let requestBody: [String: Any] = [
            "device_auth_id": session.deviceAuthID,
            "user_code": session.userCode,
        ]
        let body = try JSONSerialization.data(withJSONObject: requestBody, options: [])
        let (data, response) = try await post(url: url, body: body, contentType: "application/json")

        if response.statusCode == 403 || response.statusCode == 404 {
            return false
        }

        guard response.statusCode == 200 else {
            throw CodexAuthError.requestFailed(errorMessage(from: data) ?? "ChatGPT pairing failed.")
        }

        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let authorizationCode = json["authorization_code"] as? String,
            let codeVerifier = json["code_verifier"] as? String,
            !authorizationCode.isEmpty,
            !codeVerifier.isEmpty
        else {
            throw CodexAuthError.invalidResponse("ChatGPT pairing did not return an authorization code.")
        }

        try await exchangeAuthorizationCode(authorizationCode, codeVerifier: codeVerifier)
        return true
    }

    func signOut() {
        let defaults = GenerationSettings.sharedDefaults
        defaults.removeObject(forKey: Keys.accessToken)
        defaults.removeObject(forKey: Keys.refreshToken)
        defaults.removeObject(forKey: Keys.expiresAt)
        defaults.removeObject(forKey: Keys.updatedAt)
    }

    private func exchangeAuthorizationCode(_ code: String, codeVerifier: String) async throws {
        let url = authBaseURL.appending(path: "/oauth/token")
        let body = formBody([
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": callbackURL,
            "client_id": clientID,
            "code_verifier": codeVerifier,
        ])
        let (data, response) = try await post(url: url, body: body, contentType: "application/x-www-form-urlencoded")
        guard response.statusCode == 200 else {
            throw CodexAuthError.requestFailed(errorMessage(from: data) ?? "ChatGPT token exchange failed.")
        }

        try saveTokens(from: data)
    }

    private func tokens(refresh: Bool) async throws -> (accessToken: String, refreshToken: String, expiresAt: Date) {
        let defaults = GenerationSettings.sharedDefaults
        guard
            let accessToken = defaults.string(forKey: Keys.accessToken),
            let refreshToken = defaults.string(forKey: Keys.refreshToken),
            !accessToken.isEmpty,
            !refreshToken.isEmpty
        else {
            throw CodexAuthError.missingRefreshToken
        }

        let expiresAt = Date(timeIntervalSince1970: defaults.double(forKey: Keys.expiresAt))
        if refresh && expiresAt.timeIntervalSinceNow <= tokenRefreshSkew {
            try await refreshTokens(refreshToken: refreshToken)
            return try await tokens(refresh: false)
        }

        return (accessToken, refreshToken, expiresAt)
    }

    private func refreshTokens(refreshToken: String) async throws {
        let url = authBaseURL.appending(path: "/oauth/token")
        let body = formBody([
            "grant_type": "refresh_token",
            "refresh_token": refreshToken,
            "client_id": clientID,
        ])
        let (data, response) = try await post(url: url, body: body, contentType: "application/x-www-form-urlencoded")
        guard response.statusCode == 200 else {
            signOut()
            throw CodexAuthError.requestFailed(errorMessage(from: data) ?? "ChatGPT token refresh failed.")
        }

        try saveTokens(from: data, existingRefreshToken: refreshToken)
    }

    private func saveTokens(from data: Data, existingRefreshToken: String? = nil) throws {
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let accessToken = json["access_token"] as? String,
            !accessToken.isEmpty
        else {
            throw CodexAuthError.invalidResponse("ChatGPT token response did not include an access token.")
        }

        let refreshToken = (json["refresh_token"] as? String) ?? existingRefreshToken
        guard let refreshToken, !refreshToken.isEmpty else {
            throw CodexAuthError.invalidResponse("ChatGPT token response did not include a refresh token.")
        }

        let expiresAt = accessTokenExpiry(accessToken)
            ?? Date().addingTimeInterval(TimeInterval((json["expires_in"] as? Double) ?? defaultExpiry))
        let defaults = GenerationSettings.sharedDefaults
        defaults.set(accessToken, forKey: Keys.accessToken)
        defaults.set(refreshToken, forKey: Keys.refreshToken)
        defaults.set(expiresAt.timeIntervalSince1970, forKey: Keys.expiresAt)
        defaults.set(Date().timeIntervalSince1970, forKey: Keys.updatedAt)
    }

    private func post(url: URL, body: Data, contentType: String) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw CodexAuthError.invalidResponse("ChatGPT returned an invalid network response.")
        }
        return (data, httpResponse)
    }

    private func formBody(_ values: [String: String]) -> Data {
        var components = URLComponents()
        components.queryItems = values.map { URLQueryItem(name: $0.key, value: $0.value) }
        return Data((components.percentEncodedQuery ?? "").utf8)
    }

    private func accessTokenExpiry(_ accessToken: String) -> Date? {
        let parts = accessToken.split(separator: ".")
        guard parts.count >= 2 else {
            return nil
        }

        var payload = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while payload.count % 4 != 0 {
            payload.append("=")
        }

        guard
            let data = Data(base64Encoded: payload),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let expiry = json["exp"] as? TimeInterval
        else {
            return nil
        }

        return Date(timeIntervalSince1970: expiry)
    }

    private func errorMessage(from data: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return String(data: data, encoding: .utf8)
        }

        if let error = json["error"] as? [String: Any] {
            return (error["message"] as? String)
                ?? (error["error_description"] as? String)
                ?? (error["code"] as? String)
        }

        return (json["error_description"] as? String)
            ?? (json["message"] as? String)
            ?? (json["error"] as? String)
    }
}
