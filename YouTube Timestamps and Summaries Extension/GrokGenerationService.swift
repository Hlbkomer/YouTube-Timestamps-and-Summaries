//
//  GrokGenerationService.swift
//  Timestamps & Summaries for YT Extension
//

import Foundation
import os.log

enum GrokGenerationError: LocalizedError {
    case notConnected(String)
    case missingTranscript
    case unsupportedModel
    case invalidResponse(String)
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .notConnected(let message):
            return message.isEmpty
                ? "Grok is not connected. Open the companion app and sign in."
                : message
        case .missingTranscript:
            return "This video does not have an available transcript."
        case .unsupportedModel:
            return "The selected Grok model is not available in this app."
        case .invalidResponse(let message), .requestFailed(let message):
            return message
        }
    }
}

/// Makes direct, sandbox-safe HTTPS requests to xAI's Responses endpoint using
/// the OAuth session created in the containing app. No command-line client or
/// local background process is involved.
final class GrokGenerationService {
    static let providerID = GenerationSettings.grokProviderID

    private let logger = Logger(subsystem: "Matuko.YouTube-Timestamps-and-Summaries", category: "GrokGeneration")
    private let endpoint = URL(string: "https://api.x.ai/v1/responses")!
    private let authService = XAIAuthService()

    private struct LanguageContext {
        let code: String
        let label: String

        init(code: String, label: String) {
            self.code = code.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            self.label = label.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        var displayName: String {
            label.isEmpty ? code : label
        }
    }

    private struct TextResponse {
        let text: String
        let timeToFirstOutputMs: Int?
        let metrics: XAIResponseMetrics
    }

    func statusPayload() async -> [String: Any] {
        await authService.statusPayload(refresh: true)
    }

    func generateTimestamps(
        transcript: String,
        model: String,
        languageCode: String = "",
        languageLabel: String = ""
    ) async -> [String: Any] {
        await generate(
            kind: "grokTimestamps",
            transcript: transcript,
            model: model,
            languageCode: languageCode,
            languageLabel: languageLabel,
            instructions: "You create accurate YouTube chapter timestamps from transcripts.",
            prompt: { transcript, languageContext in
                """
                Create chronological YouTube chapter timestamps from this transcript.
                \(Self.outputLanguageInstruction(languageContext: languageContext, outputName: "timestamp titles"))

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
            },
            normalize: { rawText, transcript in
                Self.cleanTimestamps(rawText, transcript: transcript)
            },
            emptyResponseMessage: "Grok did not return usable timestamps."
        )
    }

    func generateSummary(
        transcript: String,
        model: String,
        languageCode: String = "",
        languageLabel: String = ""
    ) async -> [String: Any] {
        await generate(
            kind: "grokSummary",
            transcript: transcript,
            model: model,
            languageCode: languageCode,
            languageLabel: languageLabel,
            instructions: "You summarize YouTube transcripts clearly and concisely.",
            prompt: { transcript, languageContext in
                """
                Summarize this video transcript clearly and concisely.
                \(Self.outputLanguageInstruction(languageContext: languageContext, outputName: "summary"))
                Start with a short overview paragraph.
                Then use bold section labels like **Main Topic** with useful bullet points.
                Use one nested bullet level only when it adds helpful detail.

                Transcript:
                \(transcript)
                """
            },
            normalize: { rawText, _ in
                rawText.trimmingCharacters(in: .whitespacesAndNewlines)
            },
            emptyResponseMessage: "Grok returned an empty summary response."
        )
    }

    private func generate(
        kind: String,
        transcript: String,
        model: String,
        languageCode: String,
        languageLabel: String,
        instructions: String,
        prompt: (String, LanguageContext) -> String,
        normalize: (String, String) -> String,
        emptyResponseMessage: String
    ) async -> [String: Any] {
        let startedAt = Date()
        let transcriptText = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        let requestedModel = model.trimmingCharacters(in: .whitespacesAndNewlines)
        let safeModel = requestedModel.isEmpty
            ? GenerationSettings.defaultModelID(for: Self.providerID)
            : requestedModel
        let languageContext = LanguageContext(code: languageCode, label: languageLabel)

        do {
            guard !transcriptText.isEmpty else {
                throw GrokGenerationError.missingTranscript
            }
            guard GenerationSettings.isUsableModelID(safeModel, providerID: Self.providerID) else {
                throw GrokGenerationError.unsupportedModel
            }

            let accessToken = try await authService.accessToken()
            logger.log("Starting Grok generation. kind=\(kind, privacy: .public) model=\(safeModel, privacy: .public) transcriptLength=\(transcriptText.count, privacy: .public)")
            let response = try await requestText(
                instructions: instructions,
                prompt: prompt(transcriptText, languageContext),
                accessToken: accessToken,
                model: safeModel,
                emptyResponseMessage: emptyResponseMessage
            )
            let text = normalize(response.text, transcriptText)
            guard !text.isEmpty else {
                throw GrokGenerationError.invalidResponse(emptyResponseMessage)
            }

            logger.log("Grok generation succeeded. kind=\(kind, privacy: .public) model=\(safeModel, privacy: .public) textLength=\(text.count, privacy: .public)")
            return successPayload(
                kind: kind,
                model: safeModel,
                languageContext: languageContext,
                startedAt: startedAt,
                text: text,
                response: response
            )
        } catch {
            let message = userFacingErrorMessage(error)
            logger.error("Grok generation failed. kind=\(kind, privacy: .public) model=\(safeModel, privacy: .public) message=\(message, privacy: .private(mask: .hash))")
            return failurePayload(
                kind: kind,
                model: safeModel,
                languageContext: languageContext,
                startedAt: startedAt,
                message: message
            )
        }
    }

    private func requestText(
        instructions: String,
        prompt: String,
        accessToken: String,
        model: String,
        emptyResponseMessage: String
    ) async throws -> TextResponse {
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 10 * 60
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("TimestampsSummariesForYT/1.0", forHTTPHeaderField: "User-Agent")

        var body: [String: Any] = [
            "model": model,
            "instructions": instructions,
            "input": [
                [
                    "role": "user",
                    "content": [
                        [
                            "type": "input_text",
                            "text": prompt,
                        ],
                    ],
                ],
            ],
            "stream": true,
            "store": false,
        ]
        if let reasoningEffort = GenerationSettings.grokReasoningEffort(for: model) {
            body["reasoning"] = ["effort": reasoningEffort]
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

        let requestStartedAt = Date()
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw GrokGenerationError.invalidResponse("Grok returned an invalid network response.")
        }

        var output = ""
        var fallbackOutput = ""
        var errorBody = ""
        var firstOutputAt: Date?
        var responseMetrics = XAIResponseMetrics()

        for try await line in bytes.lines {
            if httpResponse.statusCode != 200 {
                if errorBody.count < 4_000 {
                    errorBody += line
                }
                continue
            }

            guard line.hasPrefix("data:") else {
                continue
            }
            let jsonText = String(line.dropFirst("data:".count))
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !jsonText.isEmpty, jsonText != "[DONE]" else {
                continue
            }
            guard
                let data = jsonText.data(using: .utf8),
                let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else {
                continue
            }

            let eventType = event["type"] as? String ?? ""
            if eventType.contains("output_text.delta"), let delta = event["delta"] as? String {
                if firstOutputAt == nil, delta.contains(where: { !$0.isWhitespace }) {
                    firstOutputAt = Date()
                }
                output += delta
            } else if eventType == "response.output_item.done", let item = event["item"] as? [String: Any] {
                let itemText = Self.outputText(from: item)
                if firstOutputAt == nil, !itemText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    firstOutputAt = Date()
                }
                fallbackOutput += itemText
            } else if eventType == "response.completed", let response = event["response"] as? [String: Any] {
                let responseText = Self.outputText(fromResponse: response)
                if firstOutputAt == nil, !responseText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    firstOutputAt = Date()
                }
                fallbackOutput += responseText
                responseMetrics = XAIResponseMetrics.parse(response)
            } else if eventType == "response.failed" {
                throw GrokGenerationError.requestFailed(errorMessage(from: event) ?? "Grok failed to generate a response.")
            }
        }

        if httpResponse.statusCode == 401 {
            authService.signOut()
            throw GrokGenerationError.notConnected("Grok sign-in expired. Open the companion app and sign in again.")
        }
        if httpResponse.statusCode != 200 {
            throw GrokGenerationError.requestFailed(errorMessage(from: errorBody) ?? "Grok request failed with status \(httpResponse.statusCode).")
        }

        let text = output.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty {
            return TextResponse(
                text: text,
                timeToFirstOutputMs: firstOutputAt.map { Int($0.timeIntervalSince(requestStartedAt) * 1_000) },
                metrics: responseMetrics
            )
        }
        let fallback = fallbackOutput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !fallback.isEmpty else {
            throw GrokGenerationError.invalidResponse(emptyResponseMessage)
        }
        return TextResponse(
            text: fallback,
            timeToFirstOutputMs: firstOutputAt.map { Int($0.timeIntervalSince(requestStartedAt) * 1_000) },
            metrics: responseMetrics
        )
    }

    private func userFacingErrorMessage(_ error: Error) -> String {
        let message = error.localizedDescription.isEmpty ? String(describing: error) : error.localizedDescription
        return message
    }

    private func successPayload(
        kind: String,
        model: String,
        languageContext: LanguageContext,
        startedAt: Date,
        text: String,
        response: TextResponse
    ) -> [String: Any] {
        var debug: [String: Any] = [
            "layer": "native",
            "kind": kind,
            "provider": Self.providerID,
            "model": model,
            "inputMode": "transcript",
            "languageCode": languageContext.code,
            "languageLabel": languageContext.label,
            "step": "completed",
            "durationMs": Int(Date().timeIntervalSince(startedAt) * 1_000),
            "textLength": text.count,
        ]
        if let reasoningEffort = GenerationSettings.grokReasoningEffort(for: model) {
            debug["reasoningEffort"] = reasoningEffort
        }
        if let timeToFirstOutputMs = response.timeToFirstOutputMs {
            debug["timeToFirstOutputMs"] = timeToFirstOutputMs
        }
        for (key, value) in response.metrics.debugPayload {
            debug[key] = value
        }

        return [
            "ok": true,
            "text": text,
            "debug": debug,
        ]
    }

    private func failurePayload(
        kind: String,
        model: String,
        languageContext: LanguageContext,
        startedAt: Date,
        message: String
    ) -> [String: Any] {
        var debug: [String: Any] = [
            "layer": "native",
            "kind": kind,
            "provider": Self.providerID,
            "model": model,
            "languageCode": languageContext.code,
            "languageLabel": languageContext.label,
            "step": "failed",
            "durationMs": Int(Date().timeIntervalSince(startedAt) * 1_000),
            "detail": message,
        ]
        if let reasoningEffort = GenerationSettings.grokReasoningEffort(for: model) {
            debug["reasoningEffort"] = reasoningEffort
        }

        return [
            "ok": false,
            "error": message,
            "debug": debug,
        ]
    }

    private static func outputLanguageInstruction(languageContext: LanguageContext, outputName: String) -> String {
        guard !languageContext.displayName.isEmpty else {
            return ""
        }
        return "The detected caption language is \(languageContext.displayName). Write the \(outputName) in \(languageContext.displayName)."
    }

    private static func outputText(fromResponse response: [String: Any]) -> String {
        guard let outputItems = response["output"] as? [[String: Any]] else {
            return ""
        }
        return outputItems.map(outputText(from:)).joined()
    }

    private static func outputText(from item: [String: Any]) -> String {
        guard let content = item["content"] as? [[String: Any]] else {
            return ""
        }
        return content.compactMap { part in
            (part["text"] as? String) ?? (part["content"] as? String)
        }.joined()
    }

    private func errorMessage(from value: Any) -> String? {
        let json: [String: Any]?
        if let data = value as? Data {
            json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        } else if let string = value as? String, let data = string.data(using: .utf8) {
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
        return (json["error_description"] as? String)
            ?? (json["message"] as? String)
            ?? (json["error"] as? String)
    }

    private static func cleanTimestamps(_ text: String, transcript: String) -> String {
        let validTimes = Set(
            transcript
                .split(whereSeparator: \.isNewline)
                .compactMap { line -> String? in
                    let prefix = line.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard let closingBracket = prefix.firstIndex(of: "]"), prefix.hasPrefix("[") else {
                        return nil
                    }
                    return String(prefix[prefix.index(after: prefix.startIndex)..<closingBracket])
                }
        )
        let timestampPattern = try? NSRegularExpression(pattern: "^(\\d{1,2}:\\d{2}(?::\\d{2})?)\\s+(.+?)\\s*$")

        return text
            .split(whereSeparator: \.isNewline)
            .compactMap { line -> String? in
                let value = String(line).trimmingCharacters(in: .whitespacesAndNewlines)
                let range = NSRange(value.startIndex..<value.endIndex, in: value)
                guard let match = timestampPattern?.firstMatch(in: value, range: range), match.numberOfRanges == 3,
                      let timeRange = Range(match.range(at: 1), in: value),
                      let titleRange = Range(match.range(at: 2), in: value)
                else {
                    return nil
                }

                let time = String(value[timeRange])
                let title = String(value[titleRange]).trimmingCharacters(in: .whitespacesAndNewlines)
                guard !title.isEmpty, validTimes.contains(time) else {
                    return nil
                }
                return "\(time) \(title)"
            }
            .joined(separator: "\n")
    }
}
