//
//  ProviderPromptComparisonTests.swift
//  Timestamps & Summaries for YT Tests
//
//  The network comparison is opt-in. Set
//  YTS_PROVIDER_PROMPT_COMPARISON_MANIFEST in the signed Debug test
//  environment, then run this suite. Results stage in the app container and
//  are exported as Xcode result attachments.
//

import Foundation
import Testing
@testable import Timestamps___Summaries_for_YT

@MainActor
struct ProviderPromptComparisonTests {
    private enum Provider: String, CaseIterable, Codable {
        case chatGPT = "chatgpt"
        case grok = "grok"

        var model: String {
            switch self {
            case .chatGPT:
                return GenerationSettings.chatGPTSolModelID
            case .grok:
                return GenerationSettings.defaultGrokModelID
            }
        }

        var endpoint: URL {
            switch self {
            case .chatGPT:
                return URL(string: "https://chatgpt.com/backend-api/codex/responses")!
            case .grok:
                return URL(string: "https://api.x.ai/v1/responses")!
            }
        }
    }

    private struct Manifest: Decodable {
        let name: String
        let videos: [Video]
    }

    private struct Video: Decodable {
        let ordinal: Int
        let slug: String
        let videoID: String
        let url: String
        let title: String
        let channelName: String
        let description: String
        let durationSeconds: Int
        let captionKind: String
        let languageCode: String
        let languageLabel: String
        let transcriptPath: String

        var directoryName: String {
            "\(String(format: "%02d", ordinal))-\(slug)-\(videoID)"
        }

        @MainActor var context: ProviderVideoContext {
            ProviderVideoContext(
                title: title,
                channelName: channelName,
                description: description,
                durationSeconds: durationSeconds,
                captionKind: captionKind
            )
        }
    }

    private struct StoredMetadata: Encodable {
        let videoID: String
        let url: String
        let title: String
        let channelName: String
        let rawDescription: String
        let cleanedDescription: String
        let durationSeconds: Int
        let captionKind: String
        let languageCode: String
        let languageLabel: String
        let inputCharacters: Int
    }

    private struct StreamResult {
        let text: String
        let responseModel: String?
        let timeToFirstOutputMs: Int?
        let inputTokens: Int?
        let outputTokens: Int?
        let cachedInputTokens: Int?
        let reasoningTokens: Int?
        let totalTokens: Int?
        let serviceTier: String?
    }

    private struct StoredResult: Codable {
        let videoID: String
        let provider: String
        let model: String
        let promptVersion: String
        let status: String
        let startedAt: String
        let durationMs: Int
        let timeToFirstOutputMs: Int?
        let inputTokens: Int?
        let outputTokens: Int?
        let cachedInputTokens: Int?
        let reasoningTokens: Int?
        let totalTokens: Int?
        let serviceTier: String?
        let inputCharacters: Int
        let outputCharacters: Int
        let outputWords: Int
        let text: String
        let error: String
    }

    private struct ProviderTokens {
        let chatGPT: String?
        let grok: String?
        let chatGPTError: String
        let grokError: String

        func token(for provider: Provider) throws -> String {
            switch provider {
            case .chatGPT:
                guard let chatGPT else {
                    throw ComparisonError.requestFailed(chatGPTError)
                }
                return chatGPT
            case .grok:
                guard let grok else {
                    throw ComparisonError.requestFailed(grokError)
                }
                return grok
            }
        }
    }

    private enum ComparisonError: LocalizedError {
        case invalidManifest(String)
        case requestFailed(String)
        case invalidResponse(String)

        var errorDescription: String? {
            switch self {
            case .invalidManifest(let message),
                 .requestFailed(let message),
                 .invalidResponse(let message):
                return message
            }
        }
    }

    /// Opt-in backend compatibility check, separate from historical comparisons.
    /// Uses the signed host's existing OAuth session; never exports credentials.
    @Test func runChatGPTModelSmokeWhenRequested() async throws {
        guard ProcessInfo.processInfo.environment["YTS_CHATGPT_MODEL_SMOKE"] == "1" else {
            return
        }
        let model = GenerationSettings.chatGPTSolModelID
        let token = try await CodexAuthService().accessToken()
        let transcript = """
        [00:00] Today we are growing basil from seed on a sunny windowsill.
        [00:20] Fill a shallow tray with moist seed compost and sow the seeds lightly.
        [00:40] Cover the tray loosely until germination, keeping the compost damp.
        [01:00] Once seedlings appear, remove the cover and move them into bright light.
        [01:20] Rotate the tray daily so the seedlings do not lean toward the window.
        [01:40] Water from below to avoid damaging the delicate stems.
        [02:00] When the seedlings have two sets of true leaves, transplant them into pots.
        [02:20] Pinch the growing tips to encourage a bushy plant rather than tall stems.
        [02:40] Harvest leaves regularly, but leave enough foliage for continued growth.
        """
        let chapterRequest = ProviderSummaryRequest(
            version: .production,
            instructions: "You create accurate YouTube chapter timestamps from transcripts.",
            prompt: """
            Create chronological YouTube chapter timestamps from this transcript.
            The detected caption language is English. Write the timestamp titles in English.

            Rules:
            - Use only the bracketed transcript timestamps as the source of truth.
            - Never invent, estimate, shift, or extrapolate times.
            - Output only timestamp-title lines.
            - Use MM:SS Title, or H:MM:SS Title after one hour.
            - Create useful chapter-level topic changes across the whole video.
            - Use concise natural chapter titles, not transcript quotes.
            - Prefer the earliest transcript timestamp where a topic begins.

            Transcript:
            \(transcript)
            """
        )
        let summaryRequest = ProviderSummaryPromptBuilder.makeRequest(
            version: .production,
            transcript: stripTranscriptTimestamps(transcript),
            languageCode: "en",
            languageLabel: "English"
        )
        for (kind, prompt) in [("chapters", chapterRequest), ("summary", summaryRequest)] {
            let startedAt = Date()
            let result = try await requestSummary(
                provider: .chatGPT,
                token: token,
                request: prompt,
                model: model
            )
            #expect(result.responseModel == model)
            if kind == "chapters" {
                let allowedTimes = Set(["00:00", "00:20", "00:40", "01:00", "01:20", "01:40", "02:00", "02:20", "02:40"])
                let times = result.text.split(whereSeparator: \.isNewline).compactMap {
                    $0.split(separator: " ", maxSplits: 1).first.map(String.init)
                }
                #expect(times.count >= 3)
                #expect(times.allSatisfy { allowedTimes.contains($0) })
                #expect(times == times.sorted())
                #expect(Set(times).count == times.count)
            } else {
                #expect(result.text.lowercased().contains("basil"))
                #expect(result.text.lowercased().contains("seed"))
            }
            let metrics: [String: Any] = [
                "kind": kind,
                "requestedModel": model,
                "responseModel": result.responseModel ?? "unknown",
                "reasoningEffort": "providerDefault",
                "durationMs": Int(Date().timeIntervalSince(startedAt) * 1_000),
                "timeToFirstOutputMs": result.timeToFirstOutputMs ?? -1,
                "inputTokens": result.inputTokens ?? -1,
                "outputTokens": result.outputTokens ?? -1,
                "reasoningTokens": result.reasoningTokens ?? -1,
            ]
            let json = try JSONSerialization.data(withJSONObject: metrics, options: [.prettyPrinted, .sortedKeys])
            Attachment.record(String(decoding: json, as: UTF8.self), named: "\(model)-\(kind)-metrics.json")
            Attachment.record(result.text, named: "\(model)-\(kind).txt")
            print("CHATGPT_MODEL_SMOKE \(String(decoding: json, as: UTF8.self))")
        }
    }

    /// Opt-in Grok compatibility check using the signed host's existing OAuth
    /// session. Credentials remain in Keychain and are never exported.
    @Test func runGrokModelSmokeWhenRequested() async throws {
        guard ProcessInfo.processInfo.environment["YTS_GROK_MODEL_SMOKE"] == "1" else {
            return
        }
        let model = GenerationSettings.grok47ModelID
        let token = try await XAITokenSession().accessToken()
        let transcript = """
        [00:00] Today we are growing basil from seed on a sunny windowsill.
        [00:20] Fill a shallow tray with moist seed compost and sow the seeds lightly.
        [00:40] Cover the tray loosely until germination, keeping the compost damp.
        [01:00] Once seedlings appear, remove the cover and move them into bright light.
        [01:20] Rotate the tray daily so the seedlings do not lean toward the window.
        [01:40] Water from below to avoid damaging the delicate stems.
        [02:00] When the seedlings have two sets of true leaves, transplant them into pots.
        [02:20] Pinch the growing tips to encourage a bushy plant rather than tall stems.
        [02:40] Harvest leaves regularly, but leave enough foliage for continued growth.
        """
        let chapterRequest = ProviderSummaryRequest(
            version: .production,
            instructions: "You create accurate YouTube chapter timestamps from transcripts.",
            prompt: """
            Create chronological YouTube chapter timestamps from this transcript.
            The detected caption language is English. Write the timestamp titles in English.

            Rules:
            - Use only the bracketed transcript timestamps as the source of truth.
            - Never invent, estimate, shift, or extrapolate times.
            - Output only timestamp-title lines.
            - Use MM:SS Title, or H:MM:SS Title after one hour.
            - Create useful chapter-level topic changes across the whole video.
            - Use concise natural chapter titles, not transcript quotes.
            - Prefer the earliest transcript timestamp where a topic begins.

            Transcript:
            \(transcript)
            """
        )
        let summaryRequest = ProviderSummaryPromptBuilder.makeRequest(
            version: .production,
            transcript: stripTranscriptTimestamps(transcript),
            languageCode: "en",
            languageLabel: "English"
        )
        for (kind, prompt) in [("chapters", chapterRequest), ("summary", summaryRequest)] {
            let startedAt = Date()
            let result = try await requestSummary(
                provider: .grok,
                token: token,
                request: prompt,
                model: model
            )
            #expect(result.responseModel == model)
            if kind == "chapters" {
                let allowedTimes = Set(["00:00", "00:20", "00:40", "01:00", "01:20", "01:40", "02:00", "02:20", "02:40"])
                let times = result.text.split(whereSeparator: \.isNewline).compactMap {
                    $0.split(separator: " ", maxSplits: 1).first.map(String.init)
                }
                #expect(times.count >= 3)
                #expect(times.allSatisfy { allowedTimes.contains($0) })
                #expect(times == times.sorted())
                #expect(Set(times).count == times.count)
            } else {
                #expect(result.text.lowercased().contains("basil"))
                #expect(result.text.lowercased().contains("seed"))
            }
            let metrics: [String: Any] = [
                "kind": kind,
                "requestedModel": model,
                "responseModel": result.responseModel ?? "unknown",
                "reasoningEffort": "low",
                "durationMs": Int(Date().timeIntervalSince(startedAt) * 1_000),
                "timeToFirstOutputMs": result.timeToFirstOutputMs ?? -1,
                "inputTokens": result.inputTokens ?? -1,
                "outputTokens": result.outputTokens ?? -1,
                "reasoningTokens": result.reasoningTokens ?? -1,
            ]
            let json = try JSONSerialization.data(withJSONObject: metrics, options: [.prettyPrinted, .sortedKeys])
            Attachment.record(String(decoding: json, as: UTF8.self), named: "\(model)-\(kind)-metrics.json")
            Attachment.record(result.text, named: "\(model)-\(kind).txt")
            print("GROK_MODEL_SMOKE \(String(decoding: json, as: UTF8.self))")
        }
    }

    @Test func runProviderPromptComparisonWhenRequested() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard
            let manifestPath = environment["YTS_PROVIDER_PROMPT_COMPARISON_MANIFEST"],
            !manifestPath.isEmpty
        else {
            return
        }

        let manifestURL = URL(fileURLWithPath: manifestPath)
        let sourceRootURL = manifestURL.deletingLastPathComponent()
        let stagesInAppContainer =
            environment["YTS_PROVIDER_PROMPT_COMPARISON_STAGE_IN_APP_CONTAINER"] != "0"
        let rootURL = stagesInAppContainer
            ? FileManager.default.temporaryDirectory
                .appending(path: "provider-prompt-comparisons")
                .appending(path: sourceRootURL.lastPathComponent)
            : sourceRootURL
        let manifest = try JSONDecoder().decode(
            Manifest.self,
            from: Data(contentsOf: manifestURL)
        )
        guard !manifest.videos.isEmpty else {
            throw ComparisonError.invalidManifest("Comparison manifest has no videos.")
        }

        try FileManager.default.createDirectory(
            at: rootURL,
            withIntermediateDirectories: true
        )
        let force = environment["YTS_PROVIDER_PROMPT_COMPARISON_FORCE"] == "1"
        let tokens = await loadProviderTokens()
        var allResults: [StoredResult] = []
        var failures: [String] = []

        print("PROVIDER_COMPARISON START \(manifest.name), \(manifest.videos.count) videos")
        print("PROVIDER_COMPARISON OUTPUT \(rootURL.path)")

        for video in manifest.videos.sorted(by: { $0.ordinal < $1.ordinal }) {
            let videoURL = rootURL.appending(path: video.directoryName)
            try FileManager.default.createDirectory(
                at: videoURL,
                withIntermediateDirectories: true
            )

            let transcriptURL = sourceRootURL.appending(path: video.transcriptPath)
            let sourceTranscript = try String(
                contentsOf: transcriptURL,
                encoding: .utf8
            )
            let transcript = stripTranscriptTimestamps(sourceTranscript)
            try transcript.write(
                to: videoURL.appending(path: "input-transcript.txt"),
                atomically: true,
                encoding: .utf8
            )
            try writeJSON(
                StoredMetadata(
                    videoID: video.videoID,
                    url: video.url,
                    title: video.context.title,
                    channelName: video.context.channelName,
                    rawDescription: video.description,
                    cleanedDescription: video.context.description,
                    durationSeconds: video.context.durationSeconds,
                    captionKind: video.context.captionKind,
                    languageCode: video.languageCode,
                    languageLabel: video.languageLabel,
                    inputCharacters: transcript.count
                ),
                to: videoURL.appending(path: "metadata.json")
            )

            for provider in Provider.allCases {
                for version in ProviderSummaryPromptVersion.allCases {
                    let baseName = "\(provider.model)-\(version.rawValue)"
                    let rawURL = videoURL.appending(path: "\(baseName).json")
                    let outputURL = videoURL.appending(path: "\(baseName).md")

                    if !force,
                       let existing = try? readStoredResult(from: rawURL),
                       existing.status == "succeeded" {
                        allResults.append(existing)
                        print("PROVIDER_COMPARISON SKIP \(video.videoID) \(baseName)")
                        continue
                    }

                    let prompt = ProviderSummaryPromptBuilder.makeRequest(
                        version: version,
                        transcript: transcript,
                        languageCode: video.languageCode,
                        languageLabel: video.languageLabel,
                        videoContext: video.context
                    )
                    let startedAt = Date()
                    let startedAtText = ISO8601DateFormatter().string(from: startedAt)
                    print("PROVIDER_COMPARISON RUN \(video.videoID) \(baseName)")

                    let storedResult: StoredResult
                    do {
                        let token = try tokens.token(for: provider)
                        let response = try await requestSummary(
                            provider: provider,
                            token: token,
                            request: prompt
                        )
                        storedResult = StoredResult(
                            videoID: video.videoID,
                            provider: provider.rawValue,
                            model: provider.model,
                            promptVersion: version.rawValue,
                            status: "succeeded",
                            startedAt: startedAtText,
                            durationMs: Int(Date().timeIntervalSince(startedAt) * 1_000),
                            timeToFirstOutputMs: response.timeToFirstOutputMs,
                            inputTokens: response.inputTokens,
                            outputTokens: response.outputTokens,
                            cachedInputTokens: response.cachedInputTokens,
                            reasoningTokens: response.reasoningTokens,
                            totalTokens: response.totalTokens,
                            serviceTier: response.serviceTier,
                            inputCharacters: transcript.count,
                            outputCharacters: response.text.count,
                            outputWords: wordCount(response.text),
                            text: response.text,
                            error: ""
                        )
                    } catch {
                        let message = error.localizedDescription.isEmpty
                            ? String(describing: error)
                            : error.localizedDescription
                        storedResult = StoredResult(
                            videoID: video.videoID,
                            provider: provider.rawValue,
                            model: provider.model,
                            promptVersion: version.rawValue,
                            status: "failed",
                            startedAt: startedAtText,
                            durationMs: Int(Date().timeIntervalSince(startedAt) * 1_000),
                            timeToFirstOutputMs: nil,
                            inputTokens: nil,
                            outputTokens: nil,
                            cachedInputTokens: nil,
                            reasoningTokens: nil,
                            totalTokens: nil,
                            serviceTier: nil,
                            inputCharacters: transcript.count,
                            outputCharacters: 0,
                            outputWords: 0,
                            text: "",
                            error: message
                        )
                        failures.append("\(video.videoID) \(baseName): \(message)")
                    }

                    try writeJSON(storedResult, to: rawURL)
                    let readerOutput = storedResult.status == "succeeded"
                        ? storedResult.text
                        : "ERROR: \(storedResult.error)"
                    try readerOutput.write(
                        to: outputURL,
                        atomically: true,
                        encoding: .utf8
                    )
                    allResults.append(storedResult)
                    try writeMetricsCSV(
                        allResults,
                        to: rootURL.appending(path: "metrics.csv")
                    )
                    print(
                        "PROVIDER_COMPARISON \(storedResult.status.uppercased()) "
                            + "\(video.videoID) \(baseName) "
                            + "\(storedResult.durationMs)ms \(storedResult.outputCharacters) chars"
                    )
                }
            }
        }

        try writeMetricsCSV(
            allResults,
            to: rootURL.appending(path: "metrics.csv")
        )
        try recordResultAttachments(
            results: allResults,
            metricsURL: rootURL.appending(path: "metrics.csv")
        )
        print(
            "PROVIDER_COMPARISON FINISHED "
                + "\(allResults.filter { $0.status == "succeeded" }.count)/\(allResults.count) succeeded"
        )

        if !failures.isEmpty {
            Issue.record("Provider comparison failures:\n\(failures.joined(separator: "\n"))")
        }
    }

    private func loadProviderTokens() async -> ProviderTokens {
        var chatGPT: String?
        var grok: String?
        var chatGPTError = "ChatGPT is not connected."
        var grokError = "Grok is not connected."

        do {
            chatGPT = try await CodexAuthService().accessToken()
        } catch {
            chatGPTError = error.localizedDescription
        }
        do {
            grok = try await XAITokenSession().accessToken()
        } catch {
            grokError = error.localizedDescription
        }

        return ProviderTokens(
            chatGPT: chatGPT,
            grok: grok,
            chatGPTError: chatGPTError,
            grokError: grokError
        )
    }

    private func requestSummary(
        provider: Provider,
        token: String,
        request summaryRequest: ProviderSummaryRequest,
        model requestedModel: String? = nil
    ) async throws -> StreamResult {
        let model = requestedModel ?? provider.model
        var request = URLRequest(url: provider.endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 10 * 60
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        switch provider {
        case .chatGPT:
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue(
                "codex_cli_rs/0.0.0 (Timestamps & Summaries for YT)",
                forHTTPHeaderField: "User-Agent"
            )
            request.setValue("codex_cli_rs", forHTTPHeaderField: "originator")
            if let accountID = chatGPTAccountID(from: token) {
                request.setValue(accountID, forHTTPHeaderField: "ChatGPT-Account-ID")
            }
        case .grok:
            request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
            request.setValue(
                GenerationSettings.providerUserAgent,
                forHTTPHeaderField: "User-Agent"
            )
        }

        var body: [String: Any] = [
            "model": model,
            "instructions": summaryRequest.instructions,
            "input": [
                [
                    "role": "user",
                    "content": [
                        [
                            "type": "input_text",
                            "text": summaryRequest.prompt,
                        ],
                    ],
                ],
            ],
            "stream": true,
            "store": false,
        ]
        if provider == .grok {
            let reasoning = GenerationSettings.grokReasoningRequestValue(for: model)
            guard reasoning == ["effort": "low"] else {
                throw ComparisonError.requestFailed(
                    "The configured Grok comparison model did not resolve to low reasoning."
                )
            }
            body["reasoning"] = reasoning
        } else if let reasoning = GenerationSettings.chatGPTReasoningRequestValue(for: model) {
            body["reasoning"] = reasoning
        }
        request.httpBody = try JSONSerialization.data(
            withJSONObject: body,
            options: []
        )

        let requestStartedAt = Date()
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ComparisonError.invalidResponse(
                "\(provider.rawValue) returned an invalid network response."
            )
        }

        var output = ""
        var fallbackOutput = ""
        var errorBody = ""
        var firstOutputAt: Date?
        var terminalResponse: [String: Any]?
        var receivedTerminalEvent = false

        for try await line in bytes.lines {
            if httpResponse.statusCode != 200 {
                if errorBody.count < 8_000 {
                    errorBody += line + "\n"
                }
                continue
            }

            guard line.hasPrefix("data:") else { continue }
            let jsonText = String(line.dropFirst("data:".count))
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !jsonText.isEmpty else { continue }
            if jsonText == "[DONE]" {
                receivedTerminalEvent = true
                continue
            }
            guard
                let data = jsonText.data(using: .utf8),
                let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else {
                continue
            }

            let eventType = event["type"] as? String ?? ""
            if eventType.contains("output_text.delta"),
               let delta = event["delta"] as? String {
                if firstOutputAt == nil,
                   delta.contains(where: { !$0.isWhitespace }) {
                    firstOutputAt = Date()
                }
                output += delta
            } else if eventType == "response.output_item.done",
                      let item = event["item"] as? [String: Any] {
                let itemText = outputText(from: item)
                if firstOutputAt == nil,
                   !itemText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    firstOutputAt = Date()
                }
                fallbackOutput += itemText
            } else if eventType == "response.completed",
                      let completedResponse = event["response"] as? [String: Any] {
                receivedTerminalEvent = true
                terminalResponse = completedResponse
                let responseText = outputText(fromResponse: completedResponse)
                if firstOutputAt == nil,
                   !responseText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    firstOutputAt = Date()
                }
                fallbackOutput += responseText
            } else if eventType == "response.failed"
                        || eventType == "response.incomplete" {
                throw ComparisonError.requestFailed(
                    errorMessage(from: event)
                        ?? "\(provider.rawValue) failed to generate a response."
                )
            }
        }

        guard httpResponse.statusCode == 200 else {
            throw ComparisonError.requestFailed(
                errorMessage(from: errorBody)
                    ?? "\(provider.rawValue) request failed with status \(httpResponse.statusCode)."
            )
        }
        guard receivedTerminalEvent else {
            throw ComparisonError.invalidResponse(
                "\(provider.rawValue) response stream ended before completion."
            )
        }

        let text = output.trimmingCharacters(in: .whitespacesAndNewlines)
        let fallback = fallbackOutput.trimmingCharacters(in: .whitespacesAndNewlines)
        let finalText = text.isEmpty ? fallback : text
        guard !finalText.isEmpty else {
            throw ComparisonError.invalidResponse(
                "\(provider.rawValue) returned an empty summary."
            )
        }

        let usage = terminalResponse?["usage"] as? [String: Any]
        let inputDetails = usage?["input_tokens_details"] as? [String: Any]
        let outputDetails = usage?["output_tokens_details"] as? [String: Any]

        return StreamResult(
            text: finalText,
            responseModel: terminalResponse?["model"] as? String,
            timeToFirstOutputMs: firstOutputAt.map {
                Int($0.timeIntervalSince(requestStartedAt) * 1_000)
            },
            inputTokens: integer(usage?["input_tokens"]),
            outputTokens: integer(usage?["output_tokens"]),
            cachedInputTokens: integer(inputDetails?["cached_tokens"]),
            reasoningTokens: integer(outputDetails?["reasoning_tokens"]),
            totalTokens: integer(usage?["total_tokens"]),
            serviceTier: terminalResponse?["service_tier"] as? String
        )
    }

    private func stripTranscriptTimestamps(_ transcript: String) -> String {
        transcript
            .split(whereSeparator: \.isNewline)
            .map { line in
                String(line)
                    .replacingOccurrences(
                        of: #"^\s*\[\d{1,2}:\d{2}(?::\d{2})?\]\s*"#,
                        with: "",
                        options: .regularExpression
                    )
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
    }

    private func readStoredResult(from url: URL) throws -> StoredResult {
        try JSONDecoder().decode(
            StoredResult.self,
            from: Data(contentsOf: url)
        )
    }

    private func writeJSON<T: Encodable>(_ value: T, to url: URL) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        try encoder.encode(value).write(to: url, options: .atomic)
    }

    private func recordResultAttachments(
        results: [StoredResult],
        metricsURL: URL
    ) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let aggregate = String(decoding: try encoder.encode(results), as: UTF8.self)
        let metrics = try String(contentsOf: metricsURL, encoding: .utf8)
        Attachment.record(
            aggregate,
            named: "provider-prompt-comparison-results.json"
        )
        Attachment.record(metrics, named: "provider-prompt-comparison-metrics.csv")
    }

    private func writeMetricsCSV(_ results: [StoredResult], to url: URL) throws {
        var lines = [
            "video_id,provider,model,prompt_version,status,duration_ms,time_to_first_output_ms,input_tokens,output_tokens,cached_input_tokens,reasoning_tokens,total_tokens,output_characters,output_words,error"
        ]
        let sortedResults = results.sorted { left, right in
            let leftKey = "\(left.videoID)|\(left.provider)|\(left.promptVersion)"
            let rightKey = "\(right.videoID)|\(right.provider)|\(right.promptVersion)"
            return leftKey < rightKey
        }
        for result in sortedResults {
            let fields: [String] = [
                result.videoID,
                result.provider,
                result.model,
                result.promptVersion,
                result.status,
                String(result.durationMs),
                result.timeToFirstOutputMs.map(String.init) ?? "",
                result.inputTokens.map(String.init) ?? "",
                result.outputTokens.map(String.init) ?? "",
                result.cachedInputTokens.map(String.init) ?? "",
                result.reasoningTokens.map(String.init) ?? "",
                result.totalTokens.map(String.init) ?? "",
                String(result.outputCharacters),
                String(result.outputWords),
                result.error,
            ]
            let row = fields.map { csvField($0) }.joined(separator: ",")
            lines.append(row)
        }
        try (lines.joined(separator: "\n") + "\n").write(
            to: url,
            atomically: true,
            encoding: .utf8
        )
    }

    private func csvField(_ value: String) -> String {
        guard value.contains(where: { $0 == "," || $0 == "\"" || $0.isNewline }) else {
            return value
        }
        return "\"\(value.replacingOccurrences(of: "\"", with: "\"\""))\""
    }

    private func wordCount(_ text: String) -> Int {
        text.split(whereSeparator: \.isWhitespace).count
    }

    private func integer(_ value: Any?) -> Int? {
        if let value = value as? Int {
            return value
        }
        if let value = value as? NSNumber {
            return value.intValue
        }
        if let value = value as? String {
            return Int(value)
        }
        return nil
    }

    private func outputText(fromResponse response: [String: Any]) -> String {
        guard let outputItems = response["output"] as? [[String: Any]] else {
            return ""
        }
        return outputItems.map(outputText(from:)).joined()
    }

    private func outputText(from item: [String: Any]) -> String {
        guard let content = item["content"] as? [[String: Any]] else {
            return ""
        }
        return content.compactMap { part in
            (part["text"] as? String) ?? (part["content"] as? String)
        }.joined()
    }

    private func errorMessage(from text: String) -> String? {
        guard let data = text.data(using: .utf8) else { return nil }
        return errorMessage(from: data)
    }

    private func errorMessage(from value: Any) -> String? {
        let json: [String: Any]?
        if let data = value as? Data {
            json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        } else {
            json = value as? [String: Any]
        }
        guard let json else { return nil }
        if let error = json["error"] as? [String: Any] {
            return (error["message"] as? String)
                ?? (error["error_description"] as? String)
                ?? (error["code"] as? String)
        }
        if let response = json["response"] as? [String: Any],
           let error = response["error"] as? [String: Any] {
            return (error["message"] as? String)
                ?? (error["code"] as? String)
        }
        return (json["error_description"] as? String)
            ?? (json["message"] as? String)
            ?? (json["error"] as? String)
    }

    private func chatGPTAccountID(from accessToken: String) -> String? {
        let parts = accessToken.split(separator: ".")
        guard parts.count >= 2 else { return nil }

        var payload = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while payload.count % 4 != 0 {
            payload.append("=")
        }

        guard
            let data = Data(base64Encoded: payload),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let auth = json["https://api.openai.com/auth"] as? [String: Any],
            let accountID = auth["chatgpt_account_id"] as? String,
            !accountID.isEmpty
        else {
            return nil
        }
        return accountID
    }
}
