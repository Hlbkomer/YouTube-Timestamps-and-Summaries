//
//  XAIAuthService.swift
//  Timestamps & Summaries for YT Extension
//

import Foundation

/// The extension-only xAI boundary. Interactive browser sign-in remains in the
/// containing app; credential storage, discovery, refresh, and HTTP behavior
/// are owned by the shared token session.
final class XAIAuthService {
    private let tokenSession = XAITokenSession()

    func statusPayload(refresh: Bool = false) async -> [String: Any] {
        await tokenSession.statusPayload(refresh: refresh)
    }

    func accessToken() async throws -> String {
        try await tokenSession.accessToken()
    }

    func signOut() {
        tokenSession.signOut()
    }
}
