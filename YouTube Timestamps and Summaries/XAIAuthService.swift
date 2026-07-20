//
//  XAIAuthService.swift
//  Timestamps & Summaries for YT
//

import AppKit
import CryptoKit
import Foundation
import Network
import os.log
import Security

/// A short-lived HTTP listener for the OAuth redirect. It is bound only to
/// loopback and exists only while the person is actively signing in.
nonisolated final class XAILoopbackCallbackServer: @unchecked Sendable {
    static let port: UInt16 = 56_121
    private static let maximumRequestBytes = 16_384

    private let listener: NWListener
    private let requestedPort: UInt16?
    private let expectedState: String?
    private let queue = DispatchQueue(label: "app.timestamps-summaries.xai-oauth-callback")
    private let lock = NSLock()
    private let logger = Logger(subsystem: "Matuko.YouTube-Timestamps-and-Summaries", category: "GrokOAuthCallback")
    private var callbackContinuation: CheckedContinuation<URLComponents, Error>?
    private var callbackResult: Result<URLComponents, Error>?
    private var timeoutWorkItem: DispatchWorkItem?
    private var startSemaphore: DispatchSemaphore?
    private var startResult: Result<Void, Error>?
    private var activeConnections: [ObjectIdentifier: NWConnection] = [:]
    private var didCompleteCallback = false
    private var isStopped = false

    var listeningPort: UInt16? {
        listener.port?.rawValue
    }

    init(
        port requestedPort: UInt16? = XAILoopbackCallbackServer.port,
        expectedState: String? = nil
    ) throws {
        self.requestedPort = requestedPort
        self.expectedState = expectedState
        let parameters = NWParameters.tcp
        parameters.requiredInterfaceType = .loopback
        if let requestedPort {
            guard let port = NWEndpoint.Port(rawValue: requestedPort) else {
                throw XAIAuthError.requestFailed("Could not start the local Grok sign-in callback.")
            }
            listener = try NWListener(using: parameters, on: port)
        } else {
            listener = try NWListener(using: parameters)
        }
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
        guard let listeningPort else {
            stop()
            throw XAIAuthError.requestFailed("The local Grok sign-in callback did not receive a port. Please try again.")
        }
        if let requestedPort, listeningPort != requestedPort {
            stop()
            throw XAIAuthError.requestFailed("The local Grok sign-in callback did not start on port \(requestedPort). Please try again.")
        }
        logger.debug("Grok OAuth callback listener is ready on loopback")
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
        let connections = Array(activeConnections.values)
        activeConnections.removeAll()
        lock.unlock()

        timeout?.cancel()
        if shouldStop {
            listener.cancel()
        }
        for connection in connections {
            connection.stateUpdateHandler = nil
            connection.cancel()
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
                if let result = callbackResult {
                    callbackResult = nil
                    lock.unlock()
                    timeout.cancel()
                    continuation.resume(with: result)
                    return
                }
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
        if continuation == nil {
            callbackResult = result
        }
        let timeout = timeoutWorkItem
        timeoutWorkItem = nil
        lock.unlock()

        timeout?.cancel()
        continuation?.resume(with: result)
    }

    private func receiveCallback(from connection: NWConnection) {
        lock.lock()
        let shouldAccept = !didCompleteCallback && !isStopped
        if shouldAccept {
            activeConnections[ObjectIdentifier(connection)] = connection
        }
        lock.unlock()
        guard shouldAccept else {
            connection.cancel()
            return
        }

        logger.debug("Accepted a Grok OAuth loopback connection")
        connection.stateUpdateHandler = { [weak self, weak connection] state in
            guard let self, let connection else { return }
            switch state {
            case .failed(let error):
                self.logger.debug("Ignoring a failed Grok OAuth probe connection: \(error.localizedDescription, privacy: .public)")
                self.removeConnection(connection)
                connection.cancel()
            case .cancelled:
                self.removeConnection(connection)
            default:
                break
            }
        }
        connection.start(queue: queue)
        receiveHTTPRequest(from: connection, accumulated: Data())
    }

    private func receiveHTTPRequest(from connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 4_096) { [weak self] data, _, isComplete, error in
            guard let self else {
                connection.cancel()
                return
            }
            if let error {
                self.logger.debug("Ignoring a Grok OAuth probe read failure: \(error.localizedDescription, privacy: .public)")
                self.removeConnection(connection)
                connection.cancel()
                return
            }

            var request = accumulated
            if let data {
                request.append(data)
            }
            if request.count > Self.maximumRequestBytes {
                self.logger.debug("Rejected an oversized Grok OAuth loopback request")
                self.sendBrowserResponse(on: connection, success: false) { _ in
                    // An invalid connection must not consume the one valid
                    // OAuth callback that Safari may send immediately after it.
                }
                return
            }

            let headerTerminator = Data("\r\n\r\n".utf8)
            guard request.range(of: headerTerminator) != nil else {
                if isComplete {
                    self.logger.debug("Ignored a Grok OAuth probe without a complete HTTP request")
                    self.removeConnection(connection)
                    connection.cancel()
                } else {
                    self.receiveHTTPRequest(from: connection, accumulated: request)
                }
                return
            }

            self.logger.debug("Received a complete Grok OAuth loopback HTTP header")
            do {
                let components = try self.parseCallbackRequest(request)
                self.sendBrowserResponse(on: connection, success: true) { result in
                    switch result {
                    case .success:
                        self.finishCallback(.success(components))
                    case .failure(let error):
                        self.finishCallback(.failure(error))
                    }
                }
            } catch {
                self.logger.debug("Rejected a non-matching Grok OAuth loopback request")
                self.sendBrowserResponse(on: connection, success: false) { _ in
                    // Keep listening. Safari can create speculative or retry
                    // connections before sending the actual callback.
                }
            }
        }
    }

    private func parseCallbackRequest(_ data: Data) throws -> URLComponents {
        let request = String(decoding: data, as: UTF8.self)
        let requestLine = request.split(separator: "\r\n", maxSplits: 1).first ?? ""
        let parts = requestLine.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: true)
        let target = parts.count > 1 ? String(parts[1]) : ""
        guard let listeningPort else {
            throw XAIAuthError.requestFailed("The local Grok sign-in callback is no longer listening.")
        }
        let callbackURL = URL(string: "http://127.0.0.1:\(listeningPort)\(target)")
        let components = callbackURL.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }

        guard parts.first == "GET", let components, components.path == "/callback" else {
            throw XAIAuthError.requestFailed("Grok sign-in returned an unexpected local callback.")
        }
        let queryItems = components.queryItems ?? []
        let callbackState = queryItems.first(where: { $0.name == "state" })?.value
        if let expectedState, callbackState != expectedState {
            throw XAIAuthError.requestFailed("Grok sign-in returned a callback for a different sign-in attempt.")
        }
        let hasAuthorizationResult = queryItems.contains { item in
            (item.name == "code" || item.name == "error") && !(item.value ?? "").isEmpty
        }
        guard hasAuthorizationResult else {
            throw XAIAuthError.requestFailed("Grok sign-in returned an incomplete local callback.")
        }
        return components
    }

    private func sendBrowserResponse(
        on connection: NWConnection,
        success: Bool,
        completion: @escaping @Sendable (Result<Void, Error>) -> Void
    ) {
        let body = success
            ? "<!doctype html><html><head><meta charset=\"utf-8\"><title>Grok sign-in complete</title></head><body><p>Grok sign-in is complete. You can return to Timestamps &amp; Summaries for YT.</p></body></html>"
            : "<!doctype html><html><head><meta charset=\"utf-8\"><title>Invalid Grok callback</title></head><body><p>This was not a valid Grok sign-in callback. You can close this page.</p></body></html>"
        let status = success ? "200 OK" : "400 Bad Request"
        let response = "HTTP/1.1 \(status)\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: \(body.lengthOfBytes(using: .utf8))\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n\(body)"
        let data = Data(response.utf8)
        connection.send(
            content: data,
            contentContext: .finalMessage,
            isComplete: true,
            completion: .contentProcessed { [weak self] error in
                guard let self else {
                    connection.cancel()
                    return
                }
                self.removeConnection(connection)
                if let error {
                    self.logger.error("Could not flush the Grok OAuth browser response: \(error.localizedDescription, privacy: .public)")
                    connection.cancel()
                    completion(.failure(XAIAuthError.requestFailed("The local Grok sign-in callback could not respond to Safari: \(error.localizedDescription)")))
                    return
                }

                self.logger.debug("Flushed the Grok OAuth browser response")
                // Keep the accepted connection alive briefly after the TCP
                // write-close so Safari can consume the complete response,
                // even if OAuth token exchange and listener teardown are fast.
                self.queue.asyncAfter(deadline: .now() + 1) {
                    connection.stateUpdateHandler = nil
                    connection.cancel()
                }
                completion(.success(()))
            }
        )
    }

    private func removeConnection(_ connection: NWConnection) {
        lock.lock()
        activeConnections.removeValue(forKey: ObjectIdentifier(connection))
        lock.unlock()
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
    private static let languageModelsURL = URL(string: "https://api.x.ai/v1/language-models")!
    private static let redirectURL = "http://127.0.0.1:\(XAILoopbackCallbackServer.port)/callback"
    private static let scope = "openid profile email offline_access grok-cli:access api:access"
    private let tokenSession = XAITokenSession()

    func statusPayload(refresh: Bool = false) async -> [String: Any] {
        await tokenSession.statusPayload(refresh: refresh)
    }

    func modelOptions() async throws -> [[String: String]] {
        let accessToken = try await tokenSession.accessToken()
        let (data, response) = try await tokenSession.get(url: Self.languageModelsURL, bearerToken: accessToken)
        if response.statusCode == 401 {
            signOut()
            throw XAIAuthError.requestFailed("Grok sign-in expired. Sign in again from the companion app.")
        }
        guard response.statusCode == 200 else {
            throw XAIAuthError.requestFailed(XAITokenResponseParser.errorMessage(from: data) ?? "Grok model catalog could not be loaded.")
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
        let discovery = try await tokenSession.fetchDiscovery(requireAuthorizationEndpoint: true)
        let verifier = try randomURLSafeString(byteCount: 48)
        let state = try randomURLSafeString(byteCount: 24)
        let nonce = try randomURLSafeString(byteCount: 24)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncodedString()
        let callbackServer: XAILoopbackCallbackServer?
        do {
            let server = try XAILoopbackCallbackServer(expectedState: state)
            try server.start()
            callbackServer = server
        } catch {
            // The pasted-callback path below remains safe because this session
            // still retains its unique state and PKCE verifier in memory.
            callbackServer = nil
        }

        guard
            let authorizationEndpoint = discovery.authorizationEndpoint,
            var components = URLComponents(url: authorizationEndpoint, resolvingAgainstBaseURL: false)
        else {
            throw XAIAuthError.invalidResponse("xAI sign-in configuration is invalid.")
        }
        var queryItems = components.queryItems ?? []
        queryItems += [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: XAITokenSession.clientID),
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
        tokenSession.signOut()
    }

    private func exchangeAuthorizationCode(
        _ code: String,
        verifier: String,
        challenge: String,
        redirectURL: String,
        tokenEndpoint: URL
    ) async throws {
        let body = tokenSession.formBody([
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirectURL,
            "client_id": XAITokenSession.clientID,
            "code_verifier": verifier,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        ])
        let (data, response) = try await tokenSession.post(
            url: tokenEndpoint,
            body: body,
            contentType: "application/x-www-form-urlencoded"
        )
        guard response.statusCode == 200 else {
            throw XAIAuthError.requestFailed(XAITokenResponseParser.errorMessage(from: data) ?? "Grok sign-in could not be completed.")
        }
        try tokenSession.saveTokens(from: data)
    }

    private func hasModality(_ modality: String, in value: Any?) -> Bool {
        guard let modalities = value as? [String] else {
            return false
        }
        return modalities.contains(modality)
    }

    private func randomURLSafeString(byteCount: Int) throws -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw XAIAuthError.requestFailed("Could not securely start Grok sign-in.")
        }
        return Data(bytes).base64URLEncodedString()
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
