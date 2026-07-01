//
//  XAIAuthService.swift
//  Timestamps & Summaries for YT Extension
//

import Foundation

enum XAIAuthError: LocalizedError {
    case missingRefreshToken
    case invalidResponse(String)
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .missingRefreshToken:
            return "Grok is not connected. Open Timestamps & Summaries for YT and sign in."
        case .invalidResponse(let message), .requestFailed(let message):
            return message
        }
    }
}

/// Reads and refreshes the user's xAI OAuth session. Browser login happens only
/// in the containing app; the Safari extension only uses the shared session.
final class XAIAuthService {
    private static let clientID = "b1a00492-073a-47ea-816f-4c329264a828"
    private static let discoveryURL = URL(string: "https://auth.x.ai/.well-known/openid-configuration")!
    private static let refreshSkew: TimeInterval = 60 * 60
    private static let defaultExpiry: TimeInterval = 6 * 60 * 60

    private enum Keys {
        static let accessToken = "xaiOAuth.accessToken"
        static let refreshToken = "xaiOAuth.refreshToken"
        static let expiresAt = "xaiOAuth.expiresAt"
        static let updatedAt = "xaiOAuth.updatedAt"
    }

    private struct Discovery: Decodable {
        let tokenEndpoint: URL

        enum CodingKeys: String, CodingKey {
            case tokenEndpoint = "token_endpoint"
        }
    }

    func statusPayload(refresh: Bool = false) async -> [String: Any] {
        do {
            let tokens = try await tokens(refresh: refresh)
            return [
                "connected": true,
                "expiresAt": Int(tokens.expiresAt.timeIntervalSince1970 * 1000),
            ]
        } catch {
            return [
                "connected": false,
                "error": refresh ? error.localizedDescription : "",
            ]
        }
    }

    func accessToken() async throws -> String {
        try await tokens(refresh: true).accessToken
    }

    func signOut() {
        let defaults = GenerationSettings.sharedDefaults
        defaults.removeObject(forKey: Keys.accessToken)
        defaults.removeObject(forKey: Keys.refreshToken)
        defaults.removeObject(forKey: Keys.expiresAt)
        defaults.removeObject(forKey: Keys.updatedAt)
    }

    private func tokens(refresh: Bool) async throws -> (accessToken: String, refreshToken: String, expiresAt: Date) {
        let defaults = GenerationSettings.sharedDefaults
        guard
            let accessToken = defaults.string(forKey: Keys.accessToken),
            let refreshToken = defaults.string(forKey: Keys.refreshToken),
            !accessToken.isEmpty,
            !refreshToken.isEmpty
        else {
            throw XAIAuthError.missingRefreshToken
        }

        let expiresAt = Date(timeIntervalSince1970: defaults.double(forKey: Keys.expiresAt))
        if refresh && expiresAt.timeIntervalSinceNow <= Self.refreshSkew {
            try await refreshTokens(refreshToken: refreshToken)
            return try await tokens(refresh: false)
        }
        return (accessToken, refreshToken, expiresAt)
    }

    private func refreshTokens(refreshToken: String) async throws {
        let discovery = try await fetchDiscovery()
        let body = formBody([
            "grant_type": "refresh_token",
            "refresh_token": refreshToken,
            "client_id": Self.clientID,
        ])
        let (data, response) = try await post(
            url: discovery.tokenEndpoint,
            body: body,
            contentType: "application/x-www-form-urlencoded"
        )
        guard response.statusCode == 200 else {
            signOut()
            throw XAIAuthError.requestFailed(errorMessage(from: data) ?? "Grok sign-in expired. Open the companion app and sign in again.")
        }
        try saveTokens(from: data, existingRefreshToken: refreshToken)
    }

    private func fetchDiscovery() async throws -> Discovery {
        let (data, response) = try await URLSession.shared.data(from: Self.discoveryURL)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw XAIAuthError.requestFailed("xAI sign-in configuration could not be loaded.")
        }
        guard let discovery = try? JSONDecoder().decode(Discovery.self, from: data),
              discovery.tokenEndpoint.scheme == "https",
              discovery.tokenEndpoint.host?.hasSuffix("x.ai") == true
        else {
            throw XAIAuthError.invalidResponse("xAI sign-in configuration is invalid.")
        }
        return discovery
    }

    private func saveTokens(from data: Data, existingRefreshToken: String? = nil) throws {
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let accessToken = json["access_token"] as? String,
            !accessToken.isEmpty
        else {
            throw XAIAuthError.invalidResponse("xAI sign-in did not return an access token.")
        }

        let refreshToken = (json["refresh_token"] as? String) ?? existingRefreshToken
        guard let refreshToken, !refreshToken.isEmpty else {
            throw XAIAuthError.invalidResponse("xAI sign-in did not return a refresh token.")
        }

        let expiresAt = accessTokenExpiry(accessToken)
            ?? Date().addingTimeInterval(TimeInterval((json["expires_in"] as? Double) ?? Self.defaultExpiry))
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
            throw XAIAuthError.invalidResponse("xAI returned an invalid network response.")
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
        guard parts.count >= 2 else { return nil }
        var payload = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while payload.count % 4 != 0 { payload.append("=") }
        guard
            let data = Data(base64Encoded: payload),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let expiry = json["exp"] as? TimeInterval
        else { return nil }
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
