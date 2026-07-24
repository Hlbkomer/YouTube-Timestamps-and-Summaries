import Foundation

/// Serializes refresh-token exchanges per provider within the current process.
/// Callers must re-read shared credentials after acquiring the gate because the
/// containing app and Safari extension can still refresh in separate processes.
actor OAuthTokenRefreshGate {
    static let shared = OAuthTokenRefreshGate()

    private var heldProviders = Set<String>()
    private var waiters: [String: [CheckedContinuation<Void, Never>]] = [:]

    func acquire(provider: String) async {
        if heldProviders.insert(provider).inserted {
            return
        }

        await withCheckedContinuation { continuation in
            waiters[provider, default: []].append(continuation)
        }
    }

    func release(provider: String) {
        if var providerWaiters = waiters[provider], !providerWaiters.isEmpty {
            let next = providerWaiters.removeFirst()
            waiters[provider] = providerWaiters.isEmpty ? nil : providerWaiters
            next.resume()
            return
        }

        heldProviders.remove(provider)
    }
}

nonisolated enum OAuthRefreshFailurePolicy {
    static func shouldInvalidateCredentials(
        statusCode: Int,
        message: String?
    ) -> Bool {
        if statusCode == 401 {
            return true
        }

        let normalized = (message ?? "").lowercased()
        return normalized.contains("invalid_grant")
            || (
                normalized.contains("refresh token")
                && (
                    normalized.contains("invalid")
                    || normalized.contains("expired")
                    || normalized.contains("revoked")
                )
            )
    }
}
