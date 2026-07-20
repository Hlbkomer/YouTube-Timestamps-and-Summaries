//
//  XAITokenSession.swift
//  Timestamps & Summaries for YT (Shared)
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

struct XAIDiscovery: Decodable {
    let authorizationEndpoint: URL?
    let tokenEndpoint: URL

    enum CodingKeys: String, CodingKey {
        case authorizationEndpoint = "authorization_endpoint"
        case tokenEndpoint = "token_endpoint"
    }
}

struct XAITokenResponse: Equatable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
}

enum XAITokenResponseParser {
    static let defaultExpiry: TimeInterval = 6 * 60 * 60

    static func parse(
        _ data: Data,
        existingRefreshToken: String? = nil,
        now: Date = Date()
    ) throws -> XAITokenResponse {
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

        let expiresIn = (json["expires_in"] as? NSNumber)?.doubleValue ?? defaultExpiry
        return XAITokenResponse(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: accessTokenExpiry(accessToken) ?? now.addingTimeInterval(expiresIn)
        )
    }

    static func accessTokenExpiry(_ accessToken: String) -> Date? {
        let parts = accessToken.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        var payload = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while payload.count % 4 != 0 { payload.append("=") }
        guard
            let data = Data(base64Encoded: payload),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let expiry = (json["exp"] as? NSNumber)?.doubleValue
        else { return nil }
        return Date(timeIntervalSince1970: expiry)
    }

    static func errorMessage(from data: Data) -> String? {
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

/// Shared owner for the xAI credentials and refresh protocol. The containing
/// app owns interactive sign-in; both targets use this session afterward.
final class XAITokenSession {
    static let clientID = "b1a00492-073a-47ea-816f-4c329264a828"
    static let discoveryURL = URL(string: "https://auth.x.ai/.well-known/openid-configuration")!

    private static let refreshSkew: TimeInterval = 60 * 60
    private let credentialStore = SharedCredentialStore(service: "Matuko.YouTube-Timestamps-and-Summaries.xai")
    private let defaults: UserDefaults
    private let urlSession: URLSession

    private enum Keys {
        static let accessToken = "xaiOAuth.accessToken"
        static let refreshToken = "xaiOAuth.refreshToken"
        static let expiresAt = "xaiOAuth.expiresAt"
        static let updatedAt = "xaiOAuth.updatedAt"
    }

    init(
        defaults: UserDefaults = GenerationSettings.sharedDefaults,
        urlSession: URLSession = .shared
    ) {
        self.defaults = defaults
        self.urlSession = urlSession
    }

    func statusPayload(refresh: Bool = false) async -> [String: Any] {
        do {
            let tokens = try await tokens(refresh: refresh)
            return [
                "connected": true,
                "expiresAt": Int(tokens.expiresAt.timeIntervalSince1970 * 1_000),
            ]
        } catch {
            let message: String
            if case XAIAuthError.missingRefreshToken = error {
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

    func accessToken() async throws -> String {
        try await tokens(refresh: true).accessToken
    }

    func signOut() {
        try? credentialStore.remove(Keys.accessToken)
        try? credentialStore.remove(Keys.refreshToken)
        defaults.removeObject(forKey: Keys.accessToken)
        defaults.removeObject(forKey: Keys.refreshToken)
        defaults.removeObject(forKey: Keys.expiresAt)
        defaults.removeObject(forKey: Keys.updatedAt)
    }

    func fetchDiscovery(requireAuthorizationEndpoint: Bool = false) async throws -> XAIDiscovery {
        let (data, response) = try await urlSession.data(from: Self.discoveryURL)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw XAIAuthError.requestFailed("xAI sign-in configuration could not be loaded.")
        }
        guard
            let discovery = try? JSONDecoder().decode(XAIDiscovery.self, from: data),
            Self.isTrustedXAIURL(discovery.tokenEndpoint),
            (!requireAuthorizationEndpoint || discovery.authorizationEndpoint.map(Self.isTrustedXAIURL) == true)
        else {
            throw XAIAuthError.invalidResponse("xAI sign-in configuration is invalid.")
        }
        return discovery
    }

    func saveTokens(from data: Data, existingRefreshToken: String? = nil) throws {
        let tokens = try XAITokenResponseParser.parse(
            data,
            existingRefreshToken: existingRefreshToken
        )
        try credentialStore.set(tokens.refreshToken, for: Keys.refreshToken)
        try credentialStore.set(tokens.accessToken, for: Keys.accessToken)
        defaults.set(tokens.expiresAt.timeIntervalSince1970, forKey: Keys.expiresAt)
        defaults.set(Date().timeIntervalSince1970, forKey: Keys.updatedAt)
    }

    func post(url: URL, body: Data, contentType: String) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = body
        return try await response(for: request)
    }

    func get(url: URL, bearerToken: String) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.setValue("TimestampsSummariesForYT/1.0", forHTTPHeaderField: "User-Agent")
        return try await response(for: request)
    }

    func formBody(_ values: [String: String]) -> Data {
        var components = URLComponents()
        components.queryItems = values.map { URLQueryItem(name: $0.key, value: $0.value) }
        return Data((components.percentEncodedQuery ?? "").utf8)
    }

    static func isTrustedXAIURL(_ url: URL) -> Bool {
        url.scheme == "https" && (url.host == "x.ai" || url.host?.hasSuffix(".x.ai") == true)
    }

    private func tokens(refresh: Bool) async throws -> XAITokenResponse {
        try credentialStore.migrateLegacyPair(
            from: defaults,
            accessTokenKey: Keys.accessToken,
            refreshTokenKey: Keys.refreshToken
        )
        guard
            let accessToken = try credentialStore.string(for: Keys.accessToken),
            let refreshToken = try credentialStore.string(for: Keys.refreshToken),
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
        return XAITokenResponse(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: expiresAt
        )
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
            throw XAIAuthError.requestFailed(
                XAITokenResponseParser.errorMessage(from: data)
                    ?? "Grok sign-in expired. Open the companion app and sign in again."
            )
        }
        try saveTokens(from: data, existingRefreshToken: refreshToken)
    }

    private func response(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw XAIAuthError.invalidResponse("xAI returned an invalid network response.")
        }
        return (data, httpResponse)
    }
}
