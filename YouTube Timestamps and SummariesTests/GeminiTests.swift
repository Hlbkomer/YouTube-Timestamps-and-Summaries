import Foundation
import Testing
@testable import Timestamps___Summaries_for_YT

@Suite(.serialized)
@MainActor
struct GeminiTests {
    @Test func settingsKeepGeminiSeparateFromSubscriptionProviders() {
        let settings = GenerationSettings(
            providerID: GenerationSettings.geminiProviderID, modelID: "grok-4.7",
            summaryEngine: "appleIntelligence", summaryModelID: "appleIntelligence"
        )
        #expect(settings.providerID == "googleGemini")
        #expect(settings.modelID == "gemini-flash-latest")
        #expect(settings.summaryModelID == "appleIntelligence")
        #expect(GenerationSettings.providerLabel(for: settings.providerID) == "Gemini")
        #expect(GenerationSettings.normalizedModelID(" GEMINI-FLASH-LATEST ", providerID: settings.providerID) == settings.modelID)
        for model in GenerationSettings.supportedModelIDs(for: settings.providerID) {
            let selected = GenerationSettings(
                providerID: settings.providerID, modelID: model,
                summaryEngine: "selectedModel", summaryModelID: model
            )
            #expect(selected.modelID == model)
            #expect(selected.summaryModelID == model)
            #expect(GenerationSettings.normalizedModelID(" \(model.uppercased()) ", providerID: settings.providerID) == model)
        }
        #expect(GenerationSettings.sortedModelOptions(
            Array(GenerationSettings.modelOptions(for: settings.providerID).reversed())
        ).compactMap { $0["id"] } == ["gemini-4-argon", "gemini-flash-latest", "gemini-3.5-flash-lite"])
        for model in ["gpt-6-luna", "gemini-image", "gemini-flash-latest/../../other", "gemini-future"] {
            #expect(!GenerationSettings.isUsableModelID(model, providerID: settings.providerID))
        }
    }

    @Test(arguments: ["gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-4-argon"])
    func requestUsesNativeHeaderAuthenticationAndExplicitLowThinking(model: String) throws {
        let request = try GeminiAPIClient.generationRequest(
            apiKey: " fake-key ", model: model,
            instructions: "System instruction", prompt: "Transcript"
        )
        #expect(request.url?.absoluteString == "https://generativelanguage.googleapis.com/v1beta/models/\(model):generateContent")
        #expect(request.url?.query == nil)
        #expect(request.value(forHTTPHeaderField: "x-goog-api-key") == "fake-key")
        #expect(request.httpMethod == "POST")
        let requestData = try #require(request.httpBody)
        let body = try #require(JSONSerialization.jsonObject(with: requestData) as? [String: Any])
        let config = try #require(body["generationConfig"] as? [String: Any])
        let thinking = try #require(config["thinkingConfig"] as? [String: Any])
        #expect(thinking["thinkingLevel"] as? String == "LOW")
        #expect(thinking["includeThoughts"] as? Bool == false)
        #expect(config["candidateCount"] == nil)
        #expect(config["maxOutputTokens"] as? Int == (model == "gemini-4-argon" ? 32_768 : 16_384))
        for key in ["temperature", "topP", "topK"] {
            #expect(config[key] == nil)
        }
        #expect(body["tools"] == nil)
        #expect(body["temperature"] == nil)
        #expect(throws: GeminiAPIError.self) { try GeminiAPIClient.normalizedKey("fake\r\nInjected: header") }
        #expect(throws: GeminiAPIError.self) {
            try GeminiAPIClient.generationRequest(apiKey: "fake", model: "../other", instructions: "", prompt: "")
        }
    }

    @Test func parserExcludesThoughtsAndAccountsForThinkingTokens() throws {
        var json = Self.response(text: "Reader-facing summary")
        json["candidates"] = [[
            "finishReason": "STOP",
            "content": ["parts": [
                ["text": "Hidden reasoning", "thought": true],
                ["text": "Reader-facing summary"],
            ]],
        ]]
        json["modelVersion"] = "gemini-3.8-flash"
        json["usageMetadata"] = [
            "promptTokenCount": 100, "cachedContentTokenCount": 20,
            "candidatesTokenCount": 30, "thoughtsTokenCount": 40, "totalTokenCount": 170,
        ]
        let result = try GeminiAPIClient.parseResponse(json)
        #expect(result.text == "Reader-facing summary")
        #expect(result.modelVersion == "gemini-3.8-flash")
        #expect(result.metrics == [
            "inputTokens": 100, "cachedInputTokens": 20, "outputTokens": 70,
            "reasoningTokens": 40, "totalTokens": 170,
        ])
    }

    @Test func parserRejectsBlockedTruncatedMissingAndThoughtOnlyResponses() {
        for reason in ["MAX_TOKENS", "SAFETY", "RECITATION", "OTHER", "FINISH_REASON_UNSPECIFIED"] {
            #expect(throws: GeminiAPIError.self) {
                try GeminiAPIClient.parseResponse([
                    "candidates": [["finishReason": reason, "content": ["parts": [["text": "Partial text"]]]]],
                ])
            }
        }
        for json: [String: Any] in [
            [:], ["promptFeedback": ["blockReason": "SAFETY"]],
            ["candidates": [["finishReason": "STOP", "content": ["parts": [["text": "Thought", "thought": true]]]]]],
            ["candidates": [["content": ["parts": [["text": "Unfinished"]]]]]],
        ] {
            #expect(throws: GeminiAPIError.self) { try GeminiAPIClient.parseResponse(json) }
        }
    }

    @Test func providerErrorsNeverEchoRawMessagesOrKeys() {
        for status in [400, 401, 402, 403, 404, 429, 500, 302] {
            let error = GeminiAPIClient.responseError(statusCode: status, json: ["error": ["message": "secret-key-echo"]])
            #expect(!error.localizedDescription.contains("secret-key-echo"))
        }
        #expect(GeminiAPIClient.responseError(statusCode: 429, json: [:]).localizedDescription.contains("quota"))
        #expect(GeminiAPIClient.responseError(statusCode: 402, json: [:]).localizedDescription.contains("billing"))
        let invalid = GeminiAPIClient.responseError(statusCode: 400, json: [
            "error": ["details": [["reason": "API_KEY_INVALID"]]],
        ])
        #expect(invalid.localizedDescription == GeminiAPIError.invalidKey.localizedDescription)
    }

    @Test func chapterValidationDiscardsInventedTimesWithoutChangingGrokContract() {
        let transcript = "[00:00] Introduction\n[02:30] Real topic\n[10:00] Conclusion"
        let output = "00:00 Introduction\n01:00 Invented\n02:30 Real topic\n11:00 Beyond video\nExtra prose"
        #expect(ProviderTimestampText.cleaned(output, transcript: transcript) == "00:00 Introduction\n02:30 Real topic")
    }

    @Test func geminiChapterFormattingKeepsOnlyExactSourceCueTimes() {
        let transcript = "[00:00] Introduction\n[02:30] Real topic\n[1:01:05] Later topic"
        let output = """
        Here are the chapters:
        ```text
        - **[0:00]** Introduction
        2. **02:30** — Real topic
        • `01:01:05` Later topic
        [01:00] Invented
        - 02:31 Almost a real cue
        02:99 Invalid seconds
        1:61:05 Invalid minutes
        ```
        """
        #expect(ProviderTimestampText.cleanedGemini(output, transcript: transcript) == "00:00 Introduction\n02:30 Real topic\n1:01:05 Later topic")
        // Grok retains the original strict output contract.
        #expect(ProviderTimestampText.cleaned(output, transcript: transcript).isEmpty)
        #expect(ProviderTimestampText.cleanedGemini("00:01 Invented\n[99:59] Invented", transcript: transcript).isEmpty)
    }

    @Test func connectValidatesAndRequiresRemovalBeforeChangingKey() async throws {
        let (client, store) = Self.testClient()
        defer { try? store.remove("gemini.apiKey") }
        #expect(client.statusPayload()["connected"] as? Bool == false)
        GeminiMockProtocol.fixture.configure(status: 403, json: ["error": ["message": "fake-first-key"]])
        await #expect(throws: GeminiAPIError.self) { try await client.connect(apiKey: "fake-first-key") }
        #expect(try client.savedKey() == nil)
        GeminiMockProtocol.fixture.configure(status: 200, json: ["name": "models/unexpected"])
        await #expect(throws: GeminiAPIError.self) { try await client.connect(apiKey: "fake-first-key") }
        #expect(try client.savedKey() == nil)
        GeminiMockProtocol.fixture.configure(status: 200, json: [
            "name": "models/gemini-3.8-flash", "supportedGenerationMethods": ["generateContent"],
        ])
        try await client.connect(apiKey: "fake-first-key")
        #expect(try client.savedKey() == "fake-first-key")
        #expect(client.statusPayload()["connected"] as? Bool == true)
        #expect(!String(describing: client.statusPayload()).contains("fake-first-key"))
        #expect(GeminiMockProtocol.fixture.lastRequest?.httpMethod == "GET")

        GeminiMockProtocol.fixture.configure(status: 200, json: [
            "name": "models/gemini-flash-latest", "supportedGenerationMethods": ["generateContent"],
        ])
        await #expect(throws: GeminiAPIError.self) { try await client.connect(apiKey: "fake-second-key") }
        #expect(try client.savedKey() == "fake-first-key")
        #expect(GeminiMockProtocol.fixture.lastRequest == nil)
        try client.disconnect()
        #expect(client.statusPayload()["connected"] as? Bool == false)
        try await client.connect(apiKey: "fake-second-key")
        #expect(try client.savedKey() == "fake-second-key")
    }

    @Test(arguments: ["gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-4-argon"])
    func productionGenerationUsesSharedPromptsAndPreservesKeyAfterQuotaFailure(model: String) async throws {
        let (client, store) = Self.testClient()
        defer { try? store.remove("gemini.apiKey") }
        try store.set("fake-test-key", for: "gemini.apiKey")
        let service = GeminiGenerationService(client: client)
        var chapterResponse = Self.response(text: "- **[0:00]** Start\n- [02:30] Topic\n- [01:00] Invented")
        if model == "gemini-flash-latest" { chapterResponse["modelVersion"] = "gemini-3.8-flash" }
        GeminiMockProtocol.fixture.configure(status: 200, json: chapterResponse)
        let chapters = await service.generateTimestamps(
            transcript: "[00:00] Start\n[02:30] Topic", model: model
        )
        #expect(chapters["ok"] as? Bool == true)
        #expect(chapters["text"] as? String == "00:00 Start\n02:30 Topic")
        #expect(chapters["engineLabel"] as? String == (model == "gemini-flash-latest" ? "Gemini 3.8 Flash" : GenerationSettings.modelLabel(for: model, providerID: GenerationSettings.geminiProviderID)))
        #expect((chapters["debug"] as? [String: Any])?["acceptedChapterCount"] as? Int == 2)
        #expect((chapters["debug"] as? [String: Any])?["reasoningEffort"] as? String == "low")
        #expect(GeminiMockProtocol.fixture.lastRequest?.url?.lastPathComponent == "\(model):generateContent")

        var summaryResponse = Self.response(text: "Summary text")
        let resolvedModel = model == "gemini-flash-latest" ? "gemini-3.8-flash" : model
        summaryResponse["modelVersion"] = resolvedModel
        GeminiMockProtocol.fixture.configure(status: 200, json: summaryResponse)
        let summary = await service.generateSummary(transcript: "Transcript", model: model, languageCode: "sk", languageLabel: "Slovak")
        #expect(summary["ok"] as? Bool == true)
        #expect((summary["debug"] as? [String: Any])?["model"] as? String == model)
        #expect((summary["debug"] as? [String: Any])?["providerModel"] as? String == resolvedModel)
        #expect(summary["engineLabel"] as? String == (model == "gemini-flash-latest" ? "Gemini 3.8 Flash" : GenerationSettings.modelLabel(for: model, providerID: GenerationSettings.geminiProviderID)))
        #expect((summary["debug"] as? [String: Any])?["reasoningEffort"] as? String == "low")
        let request = try #require(GeminiMockProtocol.fixture.lastRequest)
        #expect(request.url?.lastPathComponent == "\(model):generateContent")
        let requestData = try #require(request.httpBody)
        let body = try #require(JSONSerialization.jsonObject(with: requestData) as? [String: Any])
        let expected = ProviderSummaryPromptBuilder.makeRequest(version: .production, transcript: "Transcript", languageCode: "sk", languageLabel: "Slovak", videoContext: ProviderVideoContext())
        let instructions = try #require(body["systemInstruction"] as? [String: Any])
        #expect((instructions["parts"] as? [[String: String]])?.first?["text"] == expected.instructions)
        let contents = try #require(body["contents"] as? [[String: Any]])
        #expect((contents.first?["parts"] as? [[String: String]])?.first?["text"] == expected.prompt)

        var invalidChapters = Self.response(text: "[00:01] Invented time")
        invalidChapters["modelVersion"] = resolvedModel
        GeminiMockProtocol.fixture.configure(status: 200, json: invalidChapters)
        let rejected = await service.generateTimestamps(transcript: "[00:00] Start", model: model)
        #expect(rejected["ok"] as? Bool == false)
        let rejectedDebug = try #require(rejected["debug"] as? [String: Any])
        #expect(rejectedDebug["acceptedChapterCount"] as? Int == 0)
        #expect(rejectedDebug["providerModel"] as? String == resolvedModel)
        #expect(rejectedDebug["responseTextLength"] as? Int == "[00:01] Invented time".count)

        GeminiMockProtocol.fixture.configure(status: 429, json: ["error": ["message": "fake-test-key"]])
        let failed = await service.generateSummary(transcript: "Transcript", model: model)
        #expect(failed["ok"] as? Bool == false)
        #expect((failed["error"] as? String)?.contains("quota") == true)
        #expect(!String(describing: failed).contains("fake-test-key"))
        #expect(try client.savedKey() == "fake-test-key")
    }

    @Test func resultLabelsFollowReturnedVersionAndFallBackWhenMissing() async throws {
        let (client, store) = Self.testClient()
        defer { try? store.remove("gemini.apiKey") }
        try store.set("fake-test-key", for: "gemini.apiKey")
        let service = GeminiGenerationService(client: client)
        for version: String? in ["gemini-9.2-flash", nil, "  "] {
            var response = Self.response(text: "Summary text")
            response["modelVersion"] = version
            GeminiMockProtocol.fixture.configure(status: 200, json: response)
            let result = await service.generateSummary(transcript: "Transcript", model: "gemini-flash-latest")
            #expect(result["ok"] as? Bool == true)
            #expect(result["engineLabel"] as? String == (version == "gemini-9.2-flash" ? "Gemini 9.2 Flash" : "Gemini Flash (latest)"))
            #expect((result["debug"] as? [String: Any])?["model"] as? String == "gemini-flash-latest")
        }
    }

    @Test func liveGeminiChaptersAndSummarySmoke() async throws {
        guard ProcessInfo.processInfo.environment["YTS_GEMINI_SMOKE"] == "1" else { return }
        let client = GeminiAPIClient()
        #expect(client.statusPayload()["connected"] as? Bool == true)
        let service = GeminiGenerationService(client: client)
        let transcript = """
        [00:00] Today we explain how solar panels generate electricity from sunlight.
        [00:20] Photovoltaic cells convert incoming light to direct current electricity.
        [01:00] An inverter converts direct current to alternating current for home appliances.
        [02:00] Batteries store excess electricity for use after sunset.
        [03:00] Installing panels requires evaluating roof orientation and shading.
        [04:00] To conclude, panels, inverters, and batteries work together to supply a home.
        """
        let chapters = await service.generateTimestamps(transcript: transcript, model: "gemini-flash-latest", languageCode: "en", languageLabel: "English")
        #expect(chapters["ok"] as? Bool == true, "\(chapters["error"] ?? "")")
        #expect(!(chapters["text"] as? String ?? "").isEmpty)
        let summary = await service.generateSummary(transcript: transcript.replacingOccurrences(of: #"\[\d{2}:\d{2}\] "#, with: "", options: .regularExpression), model: "gemini-flash-latest", languageCode: "en", languageLabel: "English")
        #expect(summary["ok"] as? Bool == true, "\(summary["error"] ?? "")")
        #expect((summary["text"] as? String ?? "").lowercased().contains("solar"))
        for result in [chapters, summary] {
            let json = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
            Attachment.record(json, named: "gemini-smoke.json")
        }
    }

    private static func response(text: String) -> [String: Any] {
        ["candidates": [["finishReason": "STOP", "content": ["parts": [["text": text]]]]]]
    }

    private static func testClient() -> (GeminiAPIClient, SharedCredentialStore) {
        let store = SharedCredentialStore(service: "Matuko.YouTube-Timestamps-and-Summaries.gemini.tests.\(UUID().uuidString)")
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [GeminiMockProtocol.self]
        return (GeminiAPIClient(session: URLSession(configuration: config), credentials: store), store)
    }
}

private nonisolated final class GeminiHTTPFixture: @unchecked Sendable {
    private let lock = NSLock()
    private var status = 200
    private var body = Data()
    private var request: URLRequest?

    func configure(status: Int, json: [String: Any]) {
        lock.lock()
        defer { lock.unlock() }
        self.status = status
        self.body = try! JSONSerialization.data(withJSONObject: json)
        self.request = nil
    }

    func response(to request: URLRequest) -> (Int, Data) {
        var recordedRequest = request
        if recordedRequest.httpBody == nil, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4_096)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                guard count > 0 else { break }
                data.append(contentsOf: buffer.prefix(count))
            }
            recordedRequest.httpBody = data
        }
        lock.lock()
        defer { lock.unlock() }
        self.request = recordedRequest
        return (status, body)
    }

    var lastRequest: URLRequest? {
        lock.lock()
        defer { lock.unlock() }
        return request
    }
}

private nonisolated final class GeminiMockProtocol: URLProtocol, @unchecked Sendable {
    static let fixture = GeminiHTTPFixture()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, data) = Self.fixture.response(to: request)
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
