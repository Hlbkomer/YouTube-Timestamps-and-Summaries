//
//  XAIAuthService.swift
//  Timestamps & Summaries for YT
//

import AppKit
import CryptoKit
import Foundation
import Network
import Security

enum XAIAuthError: LocalizedError {
    case missingRefreshToken
    case invalidResponse(String)
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .missingRefreshToken:
            return "Grok is not connected. Sign in from the companion app."
        case .invalidResponse(let message), .requestFailed(let message):
            return message
        }
    }
}

/// A short-lived HTTP listener for the OAuth redirect. It is bound only to
/// loopback and exists only while the person is actively signing in.
nonisolated fileprivate final class XAILoopbackCallbackServer: @unchecked Sendable {
    static let port: UInt16 = 56_121

    private let listener: NWListener
    private let queue = DispatchQueue(label: "app.timestamps-summaries.xai-oauth-callback")
    private let lock = NSLock()
    private var callbackContinuation: CheckedContinuation<URLComponents, Error>?
    private var timeoutWorkItem: DispatchWorkItem?
    private var startSemaphore: DispatchSemaphore?
    private var startResult: Result<Void, Error>?
    private var didCompleteCallback = false
    private var isStopped = false

    init() throws {
        guard let port = NWEndpoint.Port(rawValue: Self.port) else {
            throw XAIAuthError.requestFailed("Could not start the local Grok sign-in callback.")
        }
        let parameters = NWParameters.tcp
        parameters.allowLocalEndpointReuse = true
        parameters.requiredInterfaceType = .loopback
        listener = try NWListener(using: parameters, on: port)
        listener.newConnectionHandler = { [weak self] connection in
            self?.receiveCallback(from: connection)
        }
        listener.stateUpdateHandler = { [weak self] state in
            self?.handleListenerState(state)
        }
    }

    deinit {
        stop()
    }

    func start() throws {
        let semaphore = DispatchSemaphore(value: 0)
        lock.lock()
        startSemaphore = semaphore
        startResult = nil
        lock.unlock()

        listener.start(queue: queue)
        guard semaphore.wait(timeout: .now() + 5) == .success else {
            stop()
            throw XAIAuthError.requestFailed("The local Grok sign-in callback did not become ready in time. Please try again.")
        }

        lock.lock()
        let result = startResult
        startResult = nil
        startSemaphore = nil
        lock.unlock()

        if case .failure(let error) = result {
            throw error
        }
        guard listener.port?.rawValue == Self.port else {
            stop()
            throw XAIAuthError.requestFailed("The local Grok sign-in callback did not start on port \(Self.port). Please try again.")
        }
    }

    func stop() {
        lock.lock()
        let shouldStop = !isStopped
        isStopped = true
        let timeout = timeoutWorkItem
        timeoutWorkItem = nil
        let callback = callbackContinuation
        callbackContinuation = nil
        let start = startSemaphore
        startSemaphore = nil
        startResult = .failure(XAIAuthError.requestFailed("The local Grok sign-in callback stopped unexpectedly."))
        lock.unlock()

        timeout?.cancel()
        if shouldStop {
            listener.cancel()
        }
        start?.signal()
        callback?.resume(throwing: XAIAuthError.requestFailed("The local Grok sign-in callback stopped unexpectedly."))
    }

    func waitForCallback() async throws -> URLComponents {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                let timeout = DispatchWorkItem { [weak self] in
                    self?.finishCallback(.failure(XAIAuthError.requestFailed("Grok sign-in timed out. Please try again.")))
                }

                lock.lock()
                guard callbackContinuation == nil, !didCompleteCallback else {
                    lock.unlock()
                    timeout.cancel()
                    continuation.resume(throwing: XAIAuthError.requestFailed("The local Grok sign-in callback is already waiting for Safari."))
                    return
                }
                callbackContinuation = continuation
                timeoutWorkItem = timeout
                lock.unlock()

                queue.asyncAfter(deadline: .now() + 180, execute: timeout)
            }
        } onCancel: {
            stop()
        }
    }

    private func handleListenerState(_ state: NWListener.State) {
        switch state {
        case .ready:
            finishStart(.success(()))
        case .failed(let error):
            let authError = XAIAuthError.requestFailed("The local Grok sign-in callback failed: \(error.localizedDescription)")
            finishStart(.failure(authError))
            finishCallback(.failure(authError))
            stop()
        case .cancelled:
            finishStart(.failure(XAIAuthError.requestFailed("The local Grok sign-in callback stopped unexpectedly.")))
        default:
            break
        }
    }

    private func finishStart(_ result: Result<Void, Error>) {
        lock.lock()
        guard let semaphore = startSemaphore else {
            lock.unlock()
            return
        }
        startResult = result
        startSemaphore = nil
        lock.unlock()

        semaphore.signal()
    }

    private func finishCallback(_ result: Result<URLComponents, Error>) {
        lock.lock()
        guard !didCompleteCallback else {
            lock.unlock()
            return
        }
        didCompleteCallback = true
        let continuation = callbackContinuation
        callbackContinuation = nil
        let timeout = timeoutWorkItem
        timeoutWorkItem = nil
        lock.unlock()

        timeout?.cancel()
        continuation?.resume(with: result)
    }

    private func receiveCallback(from connection: NWConnection) {
        lock.lock()
        let alreadyCompleted = didCompleteCallback
        lock.unlock()
        guard !alreadyCompleted else {
            connection.cancel()
            return
        }

        connection.stateUpdateHandler = { state in
            if case .failed = state {
                connection.cancel()
            }
        }
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8_192) { [weak self] data, _, _, error in
            guard let self else {
                connection.cancel()
                return
            }
            if let error {
                self.finishCallback(.failure(XAIAuthError.requestFailed("The local Grok sign-in callback could not read Safari's response: \(error.localizedDescription)")))
                connection.cancel()
                return
            }
            guard let data, !data.isEmpty else {
                self.finishCallback(.failure(XAIAuthError.requestFailed("The local Grok sign-in callback received an empty browser response.")))
                connection.cancel()
                return
            }

            do {
                let components = try self.parseCallbackRequest(data)
                self.sendBrowserResponse(on: connection, success: true)
                self.finishCallback(.success(components))
            } catch {
                self.sendBrowserResponse(on: connection, success: false)
                self.finishCallback(.failure(error))
            }
        }
    }

    private func parseCallbackRequest(_ data: Data) throws -> URLComponents {
        let request = String(decoding: data, as: UTF8.self)
        let requestLine = request.split(separator: "\r\n", maxSplits: 1).first ?? ""
        let parts = requestLine.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: true)
        let target = parts.count > 1 ? String(parts[1]) : ""
        let callbackURL = URL(string: "http://127.0.0.1:\(Self.port)\(target)")
        let components = callbackURL.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }

        let isValidCallback = parts.first == "GET" && components?.path == "/callback"

        guard isValidCallback, let components else {
            throw XAIAuthError.requestFailed("Grok sign-in returned an unexpected local callback.")
        }
        return components
    }

    private func sendBrowserResponse(on connection: NWConnection, success: Bool) {
        let body = success
            ? "<html><body><p>Grok sign-in is complete. You can return to Timestamps &amp; Summaries for YT.</p></body></html>"
            : "<html><body><p>This was not a valid Grok sign-in callback. You can close this page.</p></body></html>"
        let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: \(body.lengthOfBytes(using: .utf8))\r\nConnection: close\r\n\r\n\(body)"
        let data = Data(response.utf8)
        connection.send(content: data, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

}

/// The short-lived state needed to finish a Grok OAuth sign-in. It is kept in
/// memory only, so a pasted authorization code can never be reused after the
/// sign-in attempt is cancelled or the app is quit.
final class XAIOAuthLoginSession {
    let id: String
    let authorizationURL: URL
    let expiresAt: Date
    let loopbackAvailable: Bool

    fileprivate let state: String
    fileprivate let verifier: String
    fileprivate let challenge: String
    fileprivate let tokenEndpoint: URL
    fileprivate let redirectURL: String
    fileprivate let callbackServer: XAILoopbackCallbackServer?

    fileprivate init(
        id: String = UUID().uuidString,
        authorizationURL: URL,
        expiresAt: Date,
        state: String,
        verifier: String,
        challenge: String,
        tokenEndpoint: URL,
        redirectURL: String,
        callbackServer: XAILoopbackCallbackServer?
    ) {
        self.id = id
        self.authorizationURL = authorizationURL
        self.expiresAt = expiresAt
        self.loopbackAvailable = callbackServer != nil
        self.state = state
        self.verifier = verifier
        self.challenge = challenge
        self.tokenEndpoint = tokenEndpoint
        self.redirectURL = redirectURL
        self.callbackServer = callbackServer
    }

    var payload: [String: Any] {
        [
            "id": id,
            "expiresAt": Int(expiresAt.timeIntervalSince1970 * 1_000),
            "loopbackAvailable": loopbackAvailable,
        ]
    }

    func stop() {
        callbackServer?.stop()
    }
}

/// Owns the shared xAI OAuth session. The extension reads the same session but
/// cannot start the browser flow itself.
final class XAIAuthService {
    private static let clientID = "b1a00492-073a-47ea-816f-4c329264a828"
    private static let discoveryURL = URL(string: "https://auth.x.ai/.well-known/openid-configuration")!
    private static let languageModelsURL = URL(string: "https://api.x.ai/v1/language-models")!
    private static let redirectURL = "http://127.0.0.1:\(XAILoopbackCallbackServer.port)/callback"
    private static let scope = "openid profile email offline_access grok-cli:access api:access"
    private static let refreshSkew: TimeInterval = 60 * 60
    private static let defaultExpiry: TimeInterval = 6 * 60 * 60

    private enum Keys {
        static let accessToken = "xaiOAuth.accessToken"
        static let refreshToken = "xaiOAuth.refreshToken"
        static let expiresAt = "xaiOAuth.expiresAt"
        static let updatedAt = "xaiOAuth.updatedAt"
    }

    private struct Discovery: Decodable {
        let authorizationEndpoint: URL
        let tokenEndpoint: URL

        enum CodingKeys: String, CodingKey {
            case authorizationEndpoint = "authorization_endpoint"
            case tokenEndpoint = "token_endpoint"
        }
    }

    func statusPayload(refresh: Bool = false) async -> [String: Any] {
        do {
            let tokens = try await tokens(refresh: refresh)
            return [
                "connected": true,
                "expiresAt": Int(tokens.expiresAt.timeIntervalSince1970 * 1_000),
            ]
        } catch {
            return [
                "connected": false,
                "error": refresh ? error.localizedDescription : "",
            ]
        }
    }

    func modelOptions() async throws -> [[String: String]] {
        let accessToken = try await tokens(refresh: true).accessToken
        let (data, response) = try await get(url: Self.languageModelsURL, bearerToken: accessToken)
        if response.statusCode == 401 {
            signOut()
            throw XAIAuthError.requestFailed("Grok sign-in expired. Sign in again from the companion app.")
        }
        guard response.statusCode == 200 else {
            throw XAIAuthError.requestFailed(errorMessage(from: data) ?? "Grok model catalog could not be loaded.")
        }
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let models = json["models"] as? [[String: Any]]
        else {
            throw XAIAuthError.invalidResponse("Grok model catalog returned an invalid response.")
        }

        var seen = Set<String>()
        return models.compactMap { model -> [String: String]? in
            guard
                let id = model["id"] as? String,
                GenerationSettings.isUsableModelID(id, providerID: GenerationSettings.grokProviderID),
                hasModality("text", in: model["input_modalities"]),
                hasModality("text", in: model["output_modalities"]),
                !seen.contains(id)
            else {
                return nil
            }
            seen.insert(id)
            return [
                "id": id,
                "label": GenerationSettings.modelLabel(for: id, providerID: GenerationSettings.grokProviderID),
            ]
        }
    }

    func beginSignIn() async throws -> XAIOAuthLoginSession {
        let discovery = try await fetchDiscovery()
        let verifier = try randomURLSafeString(byteCount: 48)
        let state = try randomURLSafeString(byteCount: 24)
        let nonce = try randomURLSafeString(byteCount: 24)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncodedString()
        let callbackServer: XAILoopbackCallbackServer?
        do {
            let server = try XAILoopbackCallbackServer()
            try server.start()
            callbackServer = server
        } catch {
            // The pasted-callback path below remains safe because this session
            // still retains its unique state and PKCE verifier in memory.
            callbackServer = nil
        }

        guard var components = URLComponents(url: discovery.authorizationEndpoint, resolvingAgainstBaseURL: false) else {
            throw XAIAuthError.invalidResponse("xAI sign-in configuration is invalid.")
        }
        var queryItems = components.queryItems ?? []
        queryItems += [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: Self.clientID),
            URLQueryItem(name: "redirect_uri", value: Self.redirectURL),
            URLQueryItem(name: "scope", value: Self.scope),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "nonce", value: nonce),
            URLQueryItem(name: "plan", value: "generic"),
            URLQueryItem(name: "referrer", value: "timestamps-summaries-for-yt"),
        ]
        components.queryItems = queryItems
        guard let authorizationURL = components.url else {
            throw XAIAuthError.invalidResponse("xAI sign-in configuration is invalid.")
        }

        return XAIOAuthLoginSession(
            authorizationURL: authorizationURL,
            expiresAt: Date().addingTimeInterval(15 * 60),
            state: state,
            verifier: verifier,
            challenge: challenge,
            tokenEndpoint: discovery.tokenEndpoint,
            redirectURL: Self.redirectURL,
            callbackServer: callbackServer
        )
    }

    func completeLoopbackSignIn(_ session: XAIOAuthLoginSession) async throws {
        guard Date() < session.expiresAt else {
            throw XAIAuthError.requestFailed("The Grok sign-in attempt expired. Start it again.")
        }
        guard let callbackServer = session.callbackServer else {
            throw XAIAuthError.requestFailed("Safari could not start the local callback. Paste the callback URL or code below.")
        }

        let callback = try await callbackServer.waitForCallback()
        let items = Dictionary(uniqueKeysWithValues: (callback.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        try await completeSignIn(session, callbackItems: items, requiresState: true)
    }

    func completeManualSignIn(_ session: XAIOAuthLoginSession, pastedCallback: String) async throws {
        guard Date() < session.expiresAt else {
            throw XAIAuthError.requestFailed("The Grok sign-in attempt expired. Start it again.")
        }

        let parsed = try parsePastedCallback(pastedCallback)
        try await completeSignIn(session, callbackItems: parsed.items, requiresState: parsed.requiresState)
    }

    func signIn() async throws {
        let session = try await beginSignIn()
        defer { session.stop() }
        guard NSWorkspace.shared.open(session.authorizationURL) else {
            throw XAIAuthError.requestFailed("Could not open the Grok sign-in page.")
        }
        try await completeLoopbackSignIn(session)
    }

    private func completeSignIn(
        _ session: XAIOAuthLoginSession,
        callbackItems: [String: String],
        requiresState: Bool
    ) async throws {
        if let error = callbackItems["error"], !error.isEmpty {
            throw XAIAuthError.requestFailed(callbackItems["error_description"] ?? "Grok sign-in was not completed.")
        }
        if requiresState {
            guard callbackItems["state"] == session.state else {
                throw XAIAuthError.requestFailed("Grok sign-in could not verify the browser response. Start the sign-in again.")
            }
        } else if let state = callbackItems["state"], state != session.state {
            throw XAIAuthError.requestFailed("Grok sign-in could not verify the browser response. Start the sign-in again.")
        }
        guard let code = callbackItems["code"], !code.isEmpty else {
            throw XAIAuthError.requestFailed("Grok sign-in did not return an authorization code.")
        }

        try await exchangeAuthorizationCode(
            code,
            verifier: session.verifier,
            challenge: session.challenge,
            redirectURL: session.redirectURL,
            tokenEndpoint: session.tokenEndpoint
        )
    }

    private func parsePastedCallback(_ pastedCallback: String) throws -> (items: [String: String], requiresState: Bool) {
        let compact = pastedCallback
            .replacingOccurrences(of: "&amp;", with: "&")
            .components(separatedBy: .whitespacesAndNewlines)
            .joined()
            .trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
        guard !compact.isEmpty else {
            throw XAIAuthError.requestFailed("Paste the callback URL or authorization code from the Grok page.")
        }

        if let questionMark = compact.firstIndex(of: "?") {
            var query = String(compact[compact.index(after: questionMark)...])
            if let quote = query.firstIndex(where: { $0 == "\"" || $0 == "'" || $0 == "<" || $0 == ">" }) {
                query = String(query[..<quote])
            }
            let items = queryItems(from: query)
            guard !items.isEmpty else {
                throw XAIAuthError.requestFailed("The pasted Grok callback did not contain an authorization code.")
            }
            return (items, true)
        }

        let code = compact.hasPrefix("code=") ? String(compact.dropFirst(5)) : compact
        guard !code.isEmpty else {
            throw XAIAuthError.requestFailed("The pasted Grok authorization code is empty.")
        }
        return (["code": code], false)
    }

    private func queryItems(from query: String) -> [String: String] {
        var items: [String: String] = [:]
        for pair in query.split(separator: "&", omittingEmptySubsequences: true) {
            let parts = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            guard let rawName = parts.first else { continue }
            let name = String(rawName)
                .replacingOccurrences(of: "+", with: " ")
                .removingPercentEncoding ?? String(rawName)
            let rawValue = parts.count > 1 ? String(parts[1]) : ""
            let value = rawValue
                .replacingOccurrences(of: "+", with: " ")
                .removingPercentEncoding ?? rawValue
            items[name] = value
        }
        return items
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

    private func exchangeAuthorizationCode(
        _ code: String,
        verifier: String,
        challenge: String,
        redirectURL: String,
        tokenEndpoint: URL
    ) async throws {
        let body = formBody([
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirectURL,
            "client_id": Self.clientID,
            "code_verifier": verifier,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        ])
        let (data, response) = try await post(
            url: tokenEndpoint,
            body: body,
            contentType: "application/x-www-form-urlencoded"
        )
        guard response.statusCode == 200 else {
            throw XAIAuthError.requestFailed(errorMessage(from: data) ?? "Grok sign-in could not be completed.")
        }
        try saveTokens(from: data)
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
            throw XAIAuthError.requestFailed(errorMessage(from: data) ?? "Grok sign-in expired. Sign in again from the companion app.")
        }
        try saveTokens(from: data, existingRefreshToken: refreshToken)
    }

    private func fetchDiscovery() async throws -> Discovery {
        let (data, response) = try await URLSession.shared.data(from: Self.discoveryURL)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw XAIAuthError.requestFailed("xAI sign-in configuration could not be loaded.")
        }
        guard let discovery = try? JSONDecoder().decode(Discovery.self, from: data),
              isTrustedXAIURL(discovery.authorizationEndpoint),
              isTrustedXAIURL(discovery.tokenEndpoint)
        else {
            throw XAIAuthError.invalidResponse("xAI sign-in configuration is invalid.")
        }
        return discovery
    }

    private func isTrustedXAIURL(_ url: URL) -> Bool {
        url.scheme == "https" && (url.host == "x.ai" || url.host?.hasSuffix(".x.ai") == true)
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

        let expiresIn = (json["expires_in"] as? NSNumber)?.doubleValue ?? Self.defaultExpiry
        let expiresAt = accessTokenExpiry(accessToken) ?? Date().addingTimeInterval(expiresIn)
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

    private func get(url: URL, bearerToken: String) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.setValue("TimestampsSummariesForYT/1.0", forHTTPHeaderField: "User-Agent")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw XAIAuthError.invalidResponse("xAI returned an invalid network response.")
        }
        return (data, httpResponse)
    }

    private func hasModality(_ modality: String, in value: Any?) -> Bool {
        guard let modalities = value as? [String] else {
            return false
        }
        return modalities.contains(modality)
    }

    private func formBody(_ values: [String: String]) -> Data {
        var components = URLComponents()
        components.queryItems = values.map { URLQueryItem(name: $0.key, value: $0.value) }
        return Data((components.percentEncodedQuery ?? "").utf8)
    }

    private func randomURLSafeString(byteCount: Int) throws -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw XAIAuthError.requestFailed("Could not securely start Grok sign-in.")
        }
        return Data(bytes).base64URLEncodedString()
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
            let expiry = (json["exp"] as? NSNumber)?.doubleValue
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

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
