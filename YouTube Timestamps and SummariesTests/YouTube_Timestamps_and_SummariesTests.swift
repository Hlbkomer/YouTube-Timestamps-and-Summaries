//
//  YouTube_Timestamps_and_SummariesTests.swift
//  Timestamps & Summaries for YT Tests
//

import Foundation
import Network
import Testing
@testable import Timestamps___Summaries_for_YT

@MainActor
struct YouTube_Timestamps_and_SummariesTests {

    @Test func generationDefaultsAndIndependentSummarySelectionBehaveCorrectly() {
        #expect(GenerationSettings.defaultModelID == "gpt-5.6-terra")

        let defaults = GenerationSettings(
            providerID: "",
            modelID: "",
            summaryEngine: "",
            chapterPreference: "invalid"
        )
        #expect(defaults.providerID == GenerationSettings.chatGPTProviderID)
        #expect(defaults.modelID == GenerationSettings.defaultModelID)
        #expect(defaults.summaryModelID == GenerationSettings.defaultModelID)
        #expect(defaults.summaryEngine == GenerationSettings.defaultSummaryEngine)
        #expect(defaults.chapterPreference == GenerationSettings.preferNativeChapters)

        let appleSummary = GenerationSettings(
            providerID: GenerationSettings.grokProviderID,
            modelID: "grok-4.3",
            summaryEngine: GenerationSettings.appleIntelligenceModelID,
            summaryModelID: GenerationSettings.appleIntelligenceModelID,
            chapterPreference: GenerationSettings.alwaysGenerateChapters
        )
        #expect(appleSummary.modelID == "grok-4.3")
        #expect(appleSummary.summaryModelID == GenerationSettings.appleIntelligenceModelID)
        #expect(appleSummary.summaryEngine == GenerationSettings.appleIntelligenceModelID)
        #expect(appleSummary.chapterPreference == GenerationSettings.alwaysGenerateChapters)
    }

    @Test func providerAndModelNormalizationHandlesAliasesAndFutureModels() {
        #expect(GenerationSettings.normalizedProviderID("grokBuild") == GenerationSettings.grokProviderID)
        #expect(GenerationSettings.normalizedProviderID("unknown") == GenerationSettings.chatGPTProviderID)
        #expect(GenerationSettings.normalizedModelID(
            "gpt-5.6",
            providerID: GenerationSettings.chatGPTProviderID
        ) == GenerationSettings.chatGPTSolModelID)
        #expect(GenerationSettings.isUsableModelID(
            "gpt-6.0-future",
            providerID: GenerationSettings.chatGPTProviderID
        ))
        #expect(GenerationSettings.isUsableModelID(
            "grok-5.0-future",
            providerID: GenerationSettings.grokProviderID
        ))
        #expect(!GenerationSettings.isUsableModelID(
            "grok-4.20-beta",
            providerID: GenerationSettings.grokProviderID
        ))
        #expect(!GenerationSettings.isUsableModelID(
            "grok-build-0.1",
            providerID: GenerationSettings.grokProviderID
        ))
        #expect(!GenerationSettings.isUsableModelID(
            "grok-imagine-1",
            providerID: GenerationSettings.grokProviderID
        ))
    }

    @Test func localModelOptionsContainUniqueUsableFallbacks() throws {
        for providerID in [GenerationSettings.chatGPTProviderID, GenerationSettings.grokProviderID] {
            let options = GenerationSettings.modelOptions(for: providerID)
            let ids = try options.map { try #require($0["id"]) }
            #expect(!ids.isEmpty)
            #expect(Set(ids).count == ids.count)
            #expect(ids.allSatisfy {
                GenerationSettings.isUsableModelID($0, providerID: providerID)
            })
        }
        #expect(GenerationSettings.supportedModelIDs(
            for: GenerationSettings.chatGPTProviderID
        ).contains(GenerationSettings.chatGPTSolModelID))
        #expect(GenerationSettings.supportedModelIDs(
            for: GenerationSettings.grokProviderID
        ).contains(GenerationSettings.defaultGrokModelID))
    }

    @Test func modelOptionsSortHigherVersionsBeforeLowerVersions() throws {
        let grokOptions = GenerationSettings.sortedModelOptions([
            ["id": "grok-4.3", "label": "Grok 4.3"],
            ["id": "grok-4.5", "label": "Grok 4.5"],
            ["id": "grok-4.4", "label": "Grok 4.4"],
        ])
        #expect(grokOptions.compactMap { $0["id"] } == [
            "grok-4.5",
            "grok-4.4",
            "grok-4.3",
        ])

        let chatGPTOptions = GenerationSettings.sortedModelOptions([
            ["id": "gpt-5.6-sol", "label": "GPT-5.6 Sol"],
            ["id": "gpt-5.6-terra", "label": "GPT-5.6 Terra"],
            ["id": "gpt-5.5", "label": "GPT-5.5 Thinking"],
        ])
        #expect(chatGPTOptions.compactMap { $0["id"] } == [
            "gpt-5.6-sol",
            "gpt-5.6-terra",
            "gpt-5.5",
        ])
    }

    @Test func grok45UsesLowReasoningWhileOtherModelsKeepProviderDefaults() {
        #expect(GenerationSettings.grokReasoningEffort(for: "grok-4.5") == "low")
        #expect(GenerationSettings.grokReasoningEffort(for: "grok-4.5-latest") == "low")
        #expect(GenerationSettings.grokReasoningEffort(for: "grok-4.3") == nil)
        #expect(GenerationSettings.grokReasoningEffort(for: "grok-5.0-future") == nil)
    }

    @Test func publishedModelCatalogContainsUniqueUsableEntries() throws {
        let data = try Data(contentsOf: repositoryURL("docs/model-catalog.json"))
        let root = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let providers = try #require(root["providers"] as? [String: Any])

        for providerID in [GenerationSettings.chatGPTProviderID, GenerationSettings.grokProviderID] {
            guard
                let provider = providers[providerID] as? [String: Any],
                let entries = provider["models"] as? [[String: Any]]
            else {
                if providerID == GenerationSettings.grokProviderID {
                    continue
                }
                Issue.record("Published catalog is missing \(providerID)")
                continue
            }
            let ids = entries.compactMap { $0["id"] as? String }
            #expect(ids.count == entries.count)
            #expect(Set(ids).count == ids.count)
            #expect(ids.allSatisfy {
                GenerationSettings.isUsableModelID($0, providerID: providerID)
            })
        }
    }

    @Test func xAITokenResponseUsesRefreshFallbackAndExplicitExpiry() throws {
        let now = Date(timeIntervalSince1970: 1_000)
        let data = try JSONSerialization.data(withJSONObject: [
            "access_token": "access",
            "expires_in": 90,
        ])
        let tokens = try XAITokenResponseParser.parse(
            data,
            existingRefreshToken: "refresh",
            now: now
        )

        #expect(tokens.accessToken == "access")
        #expect(tokens.refreshToken == "refresh")
        #expect(tokens.expiresAt == Date(timeIntervalSince1970: 1_090))
    }

    @Test func xAITokenResponsePrefersJWTExpiryAndParsesProviderErrors() throws {
        let payload = try JSONSerialization.data(withJSONObject: ["exp": 9_999])
        let encodedPayload = payload.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        let data = try JSONSerialization.data(withJSONObject: [
            "access_token": "header.\(encodedPayload).signature",
            "refresh_token": "refresh",
            "expires_in": 1,
        ])
        let tokens = try XAITokenResponseParser.parse(data, now: .distantPast)
        #expect(tokens.expiresAt == Date(timeIntervalSince1970: 9_999))

        let errorData = try JSONSerialization.data(withJSONObject: [
            "error": ["message": "provider rejected request"],
        ])
        #expect(XAITokenResponseParser.errorMessage(from: errorData) == "provider rejected request")
        #expect(XAITokenResponseParser.errorMessage(from: Data("plain failure".utf8)) == "plain failure")
    }

    @Test func xAIResponseMetricsParseUsageDetailsAndServiceTier() {
        let metrics = XAIResponseMetrics.parse([
            "service_tier": "default",
            "usage": [
                "input_tokens": 40_030,
                "output_tokens": 420,
                "total_tokens": 40_450,
                "input_tokens_details": ["cached_tokens": 12_000],
                "output_tokens_details": ["reasoning_tokens": 120],
            ],
        ])

        #expect(metrics.inputTokens == 40_030)
        #expect(metrics.outputTokens == 420)
        #expect(metrics.totalTokens == 40_450)
        #expect(metrics.cachedInputTokens == 12_000)
        #expect(metrics.reasoningTokens == 120)
        #expect(metrics.serviceTier == "default")
        #expect(metrics.debugPayload["reasoningTokens"] as? Int == 120)
    }

    @Test func xAITrustBoundaryAcceptsOnlyHTTPSXAIHosts() throws {
        #expect(XAITokenSession.isTrustedXAIURL(try #require(URL(string: "https://auth.x.ai/oauth/token"))))
        #expect(XAITokenSession.isTrustedXAIURL(try #require(URL(string: "https://x.ai/oauth/token"))))
        #expect(!XAITokenSession.isTrustedXAIURL(try #require(URL(string: "http://auth.x.ai/oauth/token"))))
        #expect(!XAITokenSession.isTrustedXAIURL(try #require(URL(string: "https://evilx.ai/oauth/token"))))
        #expect(!XAITokenSession.isTrustedXAIURL(try #require(URL(string: "https://example.com/oauth/token"))))
    }

    @Test func xAILoopbackCallbackSurvivesBrowserProbeAndReturnsACompleteHTTPResponse() async throws {
        let server = try XAILoopbackCallbackServer(port: nil, expectedState: "test-state")
        try server.start()
        defer { server.stop() }

        let port = try #require(server.listeningPort)
        try await connectAndCloseWithoutSendingHTTP(port: port)

        let wrongStateURL = try #require(URL(string: "http://127.0.0.1:\(port)/callback?state=wrong-state&code=wrong-code"))
        let callbackURL = try #require(URL(string: "http://127.0.0.1:\(port)/callback?state=test-state&code=test-code"))

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 5
        let session = URLSession(configuration: configuration)
        let (_, wrongStateResponse) = try await session.data(from: wrongStateURL)
        #expect((wrongStateResponse as? HTTPURLResponse)?.statusCode == 400)

        var request = URLRequest(url: callbackURL)
        request.setValue(String(repeating: "a", count: 5_000), forHTTPHeaderField: "X-Fragmentation-Test")
        let (data, response) = try await session.data(for: request)
        // A callback can finish before the UI task registers its waiter.
        // The server must retain that single terminal result for the waiter.
        let components = try await server.waitForCallback()
        let queryItems = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })

        #expect((response as? HTTPURLResponse)?.statusCode == 200)
        #expect(String(decoding: data, as: UTF8.self).contains("Grok sign-in is complete."))
        #expect(queryItems["state"] == "test-state")
        #expect(queryItems["code"] == "test-code")
    }

    private func connectAndCloseWithoutSendingHTTP(port: UInt16) async throws {
        let endpointPort = try #require(NWEndpoint.Port(rawValue: port))
        let connection = NWConnection(host: "127.0.0.1", port: endpointPort, using: .tcp)
        let queue = DispatchQueue(label: "app.timestamps-summaries.tests.empty-oauth-probe")

        try await withCheckedThrowingContinuation { continuation in
            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    connection.stateUpdateHandler = nil
                    connection.cancel()
                    continuation.resume()
                case .failed(let error):
                    connection.stateUpdateHandler = nil
                    connection.cancel()
                    continuation.resume(throwing: error)
                default:
                    break
                }
            }
            connection.start(queue: queue)
        }

        try await Task.sleep(nanoseconds: 100_000_000)
    }

    @Test func sharedCredentialStoreUsesDataProtectionAndMigratesACompleteLegacyPairTransactionally() throws {
        let identifier = UUID().uuidString
        let suiteName = "Matuko.YouTube-Timestamps-and-Summaries.tests.\(identifier)"
        let service = "Matuko.YouTube-Timestamps-and-Summaries.tests.\(identifier)"
        let accessKey = "test.access"
        let refreshKey = "test.refresh"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        let store = SharedCredentialStore(service: service)
        defaults.set("legacy-access", forKey: accessKey)
        defaults.set("legacy-refresh", forKey: refreshKey)

        defer {
            try? store.remove(accessKey)
            try? store.remove(refreshKey)
            defaults.removePersistentDomain(forName: suiteName)
        }

        try store.migrateLegacyPair(
            from: defaults,
            accessTokenKey: accessKey,
            refreshTokenKey: refreshKey
        )
        #expect(try store.string(for: accessKey) == "legacy-access")
        #expect(try store.string(for: refreshKey) == "legacy-refresh")
        #expect(defaults.string(forKey: accessKey) == nil)
        #expect(defaults.string(forKey: refreshKey) == nil)
        #expect(SharedCredentialStore.usesDataProtectionKeychain)

        try store.set("updated-access", for: accessKey)
        #expect(try store.string(for: accessKey) == "updated-access")
        try store.remove(accessKey)
        #expect(try store.string(for: accessKey) == nil)
    }

    @Test func appAndExtensionDeclareTheSameSharingEntitlements() throws {
        let expectedKeychainGroup = "$(AppIdentifierPrefix)Matuko.YouTube-Timestamps-and-Summaries.shared"
        let expectedAppGroup = GenerationSettings.appGroupIdentifier
        for path in [
            "YouTube Timestamps and Summaries/App.entitlements",
            "YouTube Timestamps and Summaries Extension/Extension.entitlements",
        ] {
            let data = try Data(contentsOf: repositoryURL(path))
            let entitlements = try #require(
                PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
            )
            #expect((entitlements["keychain-access-groups"] as? [String]) == [expectedKeychainGroup])
            #expect((entitlements["com.apple.security.application-groups"] as? [String])?.contains(expectedAppGroup) == true)
        }
        #expect(SharedCredentialStore.accessGroup == "3PHWBNH53Z.Matuko.YouTube-Timestamps-and-Summaries.shared")
        #expect(SharedCredentialStore.usesDataProtectionKeychain)
    }

    @Test func hostAppEmbedsTheExpectedSafariExtension() throws {
        let pluginsURL = try #require(Bundle.main.builtInPlugInsURL)
        let extensionURL = pluginsURL.appending(path: "YouTube Timestamps and Summaries Extension.appex")
        let extensionBundle = try #require(Bundle(url: extensionURL))
        #expect(extensionBundle.bundleIdentifier == "Matuko.YouTube-Timestamps-and-Summaries.Extension")
    }

    private func repositoryURL(_ path: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: path)
    }
}
