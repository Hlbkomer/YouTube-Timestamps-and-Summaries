//
//  GeminiOAuthManager.swift
//  YouTube Timestamps and Summaries
//
//  Created by Codex on 21/04/2026.
//

import AppKit
import CryptoKit
import Foundation

enum GeminiOAuthError: LocalizedError {
    case missingConfiguration
    case couldNotStartCallbackServer
    case couldNotOpenBrowser
    case callbackTimedOut
    case missingAuthorizationCode
    case missingRefreshToken
    case invalidState
    case cancelled
    case invalidCallback
    case tokenRequestFailed(String)

    var errorDescription: String? {
        switch self {
        case .missingConfiguration:
            return "Add your Google OAuth client ID, client secret, and Google Cloud project ID first."
        case .couldNotStartCallbackServer:
            return "The app could not start the local Google sign-in callback listener. In Xcode, enable Incoming Connections (Server) for the macOS app target and run the app again."
        case .couldNotOpenBrowser:
            return "The app could not open your default browser for Google sign-in."
        case .callbackTimedOut:
            return "Google sign-in did not return to the app. If the browser did not land on a local 'You can head back to the app' page, copy the browser error here."
        case .missingAuthorizationCode:
            return "Google did not return an authorization code."
        case .missingRefreshToken:
            return "Google sign-in finished, but no refresh token was returned. Try signing in again after revoking the app from your Google account permissions."
        case .invalidState:
            return "The OAuth response could not be verified."
        case .cancelled:
            return "Google sign-in was cancelled."
        case .invalidCallback:
            return "The app could not read the OAuth callback from Google."
        case .tokenRequestFailed(let message):
            return message
        }
    }
}

struct OAuthTokenResponse: Decodable {
    let access_token: String
    let expires_in: Int
    let refresh_token: String?
    let scope: String
    let token_type: String
    let error: String?
    let error_description: String?
}

@MainActor
final class GeminiOAuthManager {
    static let shared = GeminiOAuthManager()

    private let store = SharedGeminiStore.shared
    private let session: URLSession

    private init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 30
        configuration.waitsForConnectivity = false
        session = URLSession(configuration: configuration)
    }

    func signIn(progress: (@MainActor (String) async -> Void)? = nil) async throws {
        guard let config = store.config, config.isComplete else {
            throw GeminiOAuthError.missingConfiguration
        }

        print("[OAuth] Preparing loopback callback server")
        await progress?("Preparing Google sign-in callback…")
        let callbackServer = try LoopbackCallbackServer()
        let verifier = Self.makeCodeVerifier()
        let state = UUID().uuidString
        let redirectURI = callbackServer.redirectURI
        let authURL = try makeAuthorizationURL(
            clientID: config.trimmedClientID,
            redirectURI: redirectURI,
            state: state,
            codeChallenge: Self.makeCodeChallenge(from: verifier)
        )

        print("[OAuth] Opening browser for Google sign-in")
        await progress?("Opening Google sign-in in your default browser…")
        guard NSWorkspace.shared.open(authURL) else {
            throw GeminiOAuthError.couldNotOpenBrowser
        }

        print("[OAuth] Waiting for loopback callback")
        await progress?("Waiting for Google to return to the app…")
        let callbackURL = try await callbackServer.waitForRedirect()
        print("[OAuth] Received OAuth callback from browser")
        await progress?("Google approved access. Finishing sign-in…")
        let callbackComponents = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)

        if callbackComponents?.queryItems?.first(where: { $0.name == "state" })?.value != state {
            throw GeminiOAuthError.invalidState
        }

        if let error = callbackComponents?.queryItems?.first(where: { $0.name == "error" })?.value {
            if error == "access_denied" {
                throw GeminiOAuthError.cancelled
            }

            let description = callbackComponents?.queryItems?.first(where: { $0.name == "error_description" })?.value ?? error
            throw GeminiOAuthError.tokenRequestFailed(description)
        }

        guard let code = callbackComponents?.queryItems?.first(where: { $0.name == "code" })?.value else {
            throw GeminiOAuthError.missingAuthorizationCode
        }

        let tokenResponse = try await exchangeCode(
            code,
            clientID: config.trimmedClientID,
            clientSecret: config.trimmedClientSecret,
            redirectURI: redirectURI,
            codeVerifier: verifier
        )
        guard let refreshToken = tokenResponse.refresh_token, !refreshToken.isEmpty else {
            throw GeminiOAuthError.missingRefreshToken
        }

        print("[OAuth] Token exchange completed successfully")
        store.token = GeminiOAuthToken(
            accessToken: tokenResponse.access_token,
            refreshToken: refreshToken,
            scope: tokenResponse.scope,
            tokenType: tokenResponse.token_type,
            expiryDate: Date().addingTimeInterval(TimeInterval(tokenResponse.expires_in))
        )
    }

    func signOut() async {
        if let refreshToken = store.token?.refreshToken, !refreshToken.isEmpty {
            try? await revoke(token: refreshToken)
        }

        store.clearToken()
    }

    func hasSignedInUser() -> Bool {
        store.token?.isUsable == true
    }

    private func makeAuthorizationURL(
        clientID: String,
        redirectURI: String,
        state: String,
        codeChallenge: String
    ) throws -> URL {
        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: SharedGeminiState.requestedScopes.joined(separator: " ")),
            URLQueryItem(name: "access_type", value: "offline"),
            URLQueryItem(name: "prompt", value: "consent"),
            URLQueryItem(name: "include_granted_scopes", value: "true"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ]

        guard let url = components?.url else {
            throw GeminiOAuthError.invalidCallback
        }

        return url
    }

    private func exchangeCode(
        _ code: String,
        clientID: String,
        clientSecret: String,
        redirectURI: String,
        codeVerifier: String
    ) async throws -> OAuthTokenResponse {
        print("[OAuth] Exchanging authorization code for tokens")
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        if #available(macOS 11.3, *) {
            request.assumesHTTP3Capable = false
        }
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = formEncodedData([
            "client_id": clientID,
            "client_secret": clientSecret,
            "code": code,
            "code_verifier": codeVerifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirectURI,
        ])

        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: request)
        } catch {
            print("[OAuth] Token request failed before response: \(error.localizedDescription)")
            throw GeminiOAuthError.tokenRequestFailed("Google token exchange failed before a response was received: \(error.localizedDescription)")
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw GeminiOAuthError.tokenRequestFailed("Google sign-in returned an invalid response.")
        }

        print("[OAuth] Token response status: \(httpResponse.statusCode)")

        let decoded = try decodeTokenResponse(from: data)
        if httpResponse.statusCode < 400 {
            let hasRefreshToken = !(decoded.refresh_token ?? "").isEmpty
            print("[OAuth] Token response parsed successfully. refresh_token_present=\(hasRefreshToken)")
        } else {
            let bodyText = String(data: data, encoding: .utf8) ?? "<non-UTF8 body>"
            print("[OAuth] Token response body: \(bodyText)")
        }

        if httpResponse.statusCode >= 400 {
            let message = decoded.error_description ?? decoded.error ?? "Google rejected the token exchange."
            throw GeminiOAuthError.tokenRequestFailed(message)
        }

        return decoded
    }

    private func revoke(token: String) async throws {
        let url = URL(string: "https://oauth2.googleapis.com/revoke")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = formEncodedData(["token": token])
        _ = try await session.data(for: request)
    }

    private func formEncodedData(_ values: [String: String]) -> Data {
        let body = values
            .map { key, value in
                "\(Self.percentEncode(key))=\(Self.percentEncode(value))"
            }
            .joined(separator: "&")

        return Data(body.utf8)
    }

    private static func percentEncode(_ value: String) -> String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "+&=")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    private static func makeCodeVerifier() -> String {
        let raw = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        let suffix = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        return (raw + suffix + "Verifier").prefix(64).description
    }

    private static func makeCodeChallenge(from verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func decodeTokenResponse(from data: Data) throws -> OAuthTokenResponse {
        if let decoded = try? JSONDecoder().decode(OAuthTokenResponse.self, from: data) {
            return decoded
        }

        if
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let error = object["error"] as? String ?? object["error_code"] as? String
        {
            let description = object["error_description"] as? String
                ?? object["errorMessage"] as? String
                ?? object["message"] as? String
            return OAuthTokenResponse(
                access_token: "",
                expires_in: 0,
                refresh_token: nil,
                scope: "",
                token_type: "",
                error: error,
                error_description: description
            )
        }

        let rawBody = String(data: data, encoding: .utf8) ?? "Unknown response body"
        throw GeminiOAuthError.tokenRequestFailed("Google returned an unreadable token response: \(rawBody)")
    }
}

private final class LoopbackCallbackServer {
    private var socketFD: Int32 = -1
    private let portValue: UInt16

    var redirectURI: String {
        "http://127.0.0.1:\(portValue)"
    }

    init() throws {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else {
            throw GeminiOAuthError.couldNotStartCallbackServer
        }
        socketFD = fd

        var reuseAddress: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuseAddress, socklen_t(MemoryLayout<Int32>.size))

        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = in_port_t(0).bigEndian
        address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))

        let bindResult = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { pointer in
                bind(fd, pointer, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }

        guard bindResult == 0 else {
            close(fd)
            throw GeminiOAuthError.couldNotStartCallbackServer
        }

        var assignedAddress = sockaddr_in()
        var assignedLength = socklen_t(MemoryLayout<sockaddr_in>.size)
        let nameResult = withUnsafeMutablePointer(to: &assignedAddress) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { pointer in
                getsockname(fd, pointer, &assignedLength)
            }
        }

        guard nameResult == 0, listen(fd, 1) == 0 else {
            close(fd)
            throw GeminiOAuthError.couldNotStartCallbackServer
        }

        portValue = UInt16(bigEndian: assignedAddress.sin_port)
    }

    deinit {
        if socketFD >= 0 {
            close(socketFD)
        }
    }

    func waitForRedirect() async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                self.acceptCallback(continuation)
            }
        }
    }

    private func acceptCallback(_ continuation: CheckedContinuation<URL, Error>) {
        var pollDescriptor = pollfd(fd: socketFD, events: Int16(POLLIN), revents: 0)
        let pollResult = withUnsafeMutablePointer(to: &pollDescriptor) {
            poll($0, 1, 120_000)
        }

        if pollResult == 0 {
            close(socketFD)
            socketFD = -1
            continuation.resume(throwing: GeminiOAuthError.callbackTimedOut)
            return
        }

        guard pollResult > 0 else {
            continuation.resume(throwing: GeminiOAuthError.invalidCallback)
            return
        }

        var address = sockaddr()
        var length = socklen_t(MemoryLayout<sockaddr>.size)
        let clientFD = accept(socketFD, &address, &length)
        guard clientFD >= 0 else {
            continuation.resume(throwing: GeminiOAuthError.invalidCallback)
            return
        }

        let requestData = readRequest(from: clientFD)
        let requestLine = String(data: requestData, encoding: .utf8)?
            .components(separatedBy: "\r\n")
            .first ?? ""

        let requestParts = requestLine.split(separator: " ")
        guard requestParts.count >= 2 else {
            writeHTMLResponse(to: clientFD, body: "The app could not read Google's callback.")
            close(clientFD)
            continuation.resume(throwing: GeminiOAuthError.invalidCallback)
            return
        }

        let pathAndQuery = String(requestParts[1])
        guard let callbackURL = URL(string: redirectURI + pathAndQuery) else {
            writeHTMLResponse(to: clientFD, body: "The app could not parse Google's callback.")
            close(clientFD)
            continuation.resume(throwing: GeminiOAuthError.invalidCallback)
            return
        }

        writeHTMLResponse(
            to: clientFD,
            body: "Google sign-in finished. You can close this tab and return to YouTube Timestamps and Summaries."
        )
        close(clientFD)
        close(socketFD)
        socketFD = -1
        continuation.resume(returning: callbackURL)
    }

    private func readRequest(from socket: Int32) -> Data {
        var collected = Data()
        var buffer = [UInt8](repeating: 0, count: 2048)

        while true {
            let bytesRead = recv(socket, &buffer, buffer.count, 0)
            guard bytesRead > 0 else {
                break
            }

            collected.append(buffer, count: bytesRead)
            if let text = String(data: collected, encoding: .utf8), text.contains("\r\n\r\n") {
                break
            }
        }

        return collected
    }

    private func writeHTMLResponse(to socket: Int32, body: String) {
        let html = """
        <html>
        <head><meta charset="utf-8"><title>Gemini Sign-In Complete</title></head>
        <body style="font-family:-apple-system;max-width:640px;margin:48px auto;padding:0 20px;line-height:1.5;">
        <h1 style="font-size:28px;">You can head back to the app</h1>
        <p>\(body)</p>
        </body>
        </html>
        """

        let response = """
        HTTP/1.1 200 OK\r
        Content-Type: text/html; charset=utf-8\r
        Content-Length: \(html.utf8.count)\r
        Connection: close\r
        \r
        \(html)
        """

        _ = response.withCString { pointer in
            send(socket, pointer, strlen(pointer), 0)
        }
    }
}
