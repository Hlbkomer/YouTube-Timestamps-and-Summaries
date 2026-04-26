//
//  CodexGenerationService.swift
//  YouTube Timestamps and Summaries Extension
//
//  Created by Codex on 26/04/2026.
//

import Foundation
import os.log

enum CodexGenerationError: LocalizedError {
    case missingAccessToken
    case missingTranscript
    case invalidResponse(String)
    case generationFailed(String)

    var errorDescription: String? {
        switch self {
        case .missingAccessToken:
            return "ChatGPT is not connected."
        case .missingTranscript:
            return "This video does not have an available transcript."
        case .invalidResponse(let message), .generationFailed(let message):
            return message
        }
    }
}

final class CodexGenerationService {
    private let logger = Logger(subsystem: "Matuko.YouTube-Timestamps-and-Summaries", category: "CodexGeneration")
    private let endpoint = URL(string: "https://chatgpt.com/backend-api/codex/responses")!
    private let authService = CodexAuthService()

    func generateTimestamps(transcript: String, model: String) async -> [String: Any] {
        let startedAt = Date()
        let transcriptText = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        let requestedModel = model.trimmingCharacters(in: .whitespacesAndNewlines)
        let safeModel = requestedModel.isEmpty ? GenerationSettings.defaultModelID : requestedModel

        do {
            guard !transcriptText.isEmpty else {
                throw CodexGenerationError.missingTranscript
            }

            let accessToken = try await authService.accessToken()
            logger.log("Starting Codex timestamp generation. model=\(safeModel, privacy: .public) transcriptLength=\(transcriptText.count, privacy: .public)")
            let rawText = try await requestTimestamps(
                transcript: transcriptText,
                accessToken: accessToken,
                model: safeModel
            )
            let cleanedText = cleanTimestamps(rawText, transcript: transcriptText)
            guard !cleanedText.isEmpty else {
                throw CodexGenerationError.generationFailed("ChatGPT did not return usable timestamps.")
            }

            logger.log("Codex timestamp generation succeeded. model=\(safeModel, privacy: .public) textLength=\(cleanedText.count, privacy: .public)")
            return [
                "ok": true,
                "text": cleanedText,
                "debug": [
                    "layer": "native",
                    "kind": "codexTimestamps",
                    "model": safeModel,
                    "inputMode": "transcript",
                    "step": "completed",
                    "durationMs": Int(Date().timeIntervalSince(startedAt) * 1000),
                    "textLength": cleanedText.count,
                ],
            ]
        } catch {
            let message = error.localizedDescription.isEmpty ? String(describing: error) : error.localizedDescription
            logger.error("Codex timestamp generation failed. model=\(safeModel, privacy: .public) message=\(message, privacy: .private(mask: .hash))")
            return [
                "ok": false,
                "error": message,
                "debug": [
                    "layer": "native",
                    "kind": "codexTimestamps",
                    "model": safeModel,
                    "step": "failed",
                    "durationMs": Int(Date().timeIntervalSince(startedAt) * 1000),
                    "detail": message,
                ],
            ]
        }
    }

    func generateSummary(transcript: String, model: String) async -> [String: Any] {
        let startedAt = Date()
        let transcriptText = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        let requestedModel = model.trimmingCharacters(in: .whitespacesAndNewlines)
        let safeModel = requestedModel.isEmpty ? GenerationSettings.defaultModelID : requestedModel

        do {
            guard !transcriptText.isEmpty else {
                throw CodexGenerationError.missingTranscript
            }

            let accessToken = try await authService.accessToken()
            logger.log("Starting Codex summary generation. model=\(safeModel, privacy: .public) transcriptLength=\(transcriptText.count, privacy: .public)")
            let text = try await requestCodexText(
                instructions: "You summarize YouTube transcripts clearly and concisely.",
                prompt: """
                Summarize this video transcript clearly and concisely.

                Transcript:
                \(transcriptText)
                """,
                accessToken: accessToken,
                model: safeModel,
                emptyResponseMessage: "ChatGPT returned an empty summary response."
            )
            guard !text.isEmpty else {
                throw CodexGenerationError.generationFailed("ChatGPT did not return a usable summary.")
            }

            logger.log("Codex summary generation succeeded. model=\(safeModel, privacy: .public) textLength=\(text.count, privacy: .public)")
            return [
                "ok": true,
                "text": text,
                "debug": [
                    "layer": "native",
                    "kind": "codexSummary",
                    "model": safeModel,
                    "inputMode": "transcript",
                    "step": "completed",
                    "durationMs": Int(Date().timeIntervalSince(startedAt) * 1000),
                    "textLength": text.count,
                ],
            ]
        } catch {
            let message = error.localizedDescription.isEmpty ? String(describing: error) : error.localizedDescription
            logger.error("Codex summary generation failed. model=\(safeModel, privacy: .public) message=\(message, privacy: .private(mask: .hash))")
            return [
                "ok": false,
                "error": message,
                "debug": [
                    "layer": "native",
                    "kind": "codexSummary",
                    "model": safeModel,
                    "step": "failed",
                    "durationMs": Int(Date().timeIntervalSince(startedAt) * 1000),
                    "detail": message,
                ],
            ]
        }
    }

    private func requestTimestamps(transcript: String, accessToken: String, model: String) async throws -> String {
        let rawText = try await requestCodexText(
            instructions: "You create accurate YouTube chapter timestamps from transcripts.",
            prompt: """
            Create chronological YouTube chapter timestamps from this transcript.

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
            """,
            accessToken: accessToken,
            model: model,
            emptyResponseMessage: "ChatGPT returned an empty timestamp response."
        )
        return rawText
    }

    private func requestCodexText(
        instructions: String,
        prompt: String,
        accessToken: String,
        model: String,
        emptyResponseMessage: String
    ) async throws -> String {
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 10 * 60
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("codex_cli_rs/0.0.0 (YouTube Timestamps and Summaries)", forHTTPHeaderField: "User-Agent")
        request.setValue("codex_cli_rs", forHTTPHeaderField: "originator")

        if let accountID = chatGPTAccountID(from: accessToken) {
            request.setValue(accountID, forHTTPHeaderField: "ChatGPT-Account-ID")
        }

        let body: [String: Any] = [
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
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw CodexGenerationError.invalidResponse("ChatGPT returned an invalid network response.")
        }

        var output = ""
        var fallbackOutput = ""
        var errorBody = ""

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
                output += delta
            } else if eventType == "response.output_item.done", let item = event["item"] as? [String: Any] {
                fallbackOutput += outputText(from: item)
            } else if eventType == "response.completed", let response = event["response"] as? [String: Any] {
                fallbackOutput += outputText(fromResponse: response)
            } else if eventType == "response.failed" {
                throw CodexGenerationError.generationFailed(errorMessage(from: event) ?? "ChatGPT failed to generate a response.")
            }
        }

        if httpResponse.statusCode != 200 {
            throw CodexGenerationError.generationFailed(errorMessage(from: errorBody) ?? "ChatGPT request failed with status \(httpResponse.statusCode).")
        }

        let text = output.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty {
            return text
        }

        let fallback = fallbackOutput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !fallback.isEmpty else {
            throw CodexGenerationError.generationFailed(emptyResponseMessage)
        }
        return fallback
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

    private func cleanTimestamps(_ text: String, transcript: String) -> String {
        let transcriptTimes = transcriptCueTimes(from: transcript)
        let maxTranscriptTime = transcriptTimes.last ?? 0
        let lines = timestampLines(from: text).compactMap { line -> (seconds: Int, title: String)? in
            let parts = line.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
            guard parts.count == 2 else {
                return nil
            }

            let generatedSeconds = secondsFromTimestamp(String(parts[0]))
            guard generatedSeconds <= maxTranscriptTime + 10 else {
                return nil
            }

            let alignedSeconds = nearestTranscriptTime(to: generatedSeconds, transcriptTimes: transcriptTimes) ?? generatedSeconds
            guard abs(alignedSeconds - generatedSeconds) <= 20 else {
                return nil
            }

            let title = cleanTimestampTitle(String(parts[1]))
            guard !title.isEmpty, title.count <= 120 else {
                return nil
            }

            return (alignedSeconds, title)
        }

        var seen = Set<Int>()
        return lines
            .sorted { $0.seconds < $1.seconds }
            .compactMap { item -> String? in
                guard seen.insert(item.seconds).inserted else {
                    return nil
                }
                return "\(Self.formatTimestamp(seconds: item.seconds)) \(item.title)"
            }
            .joined(separator: "\n")
    }

    private func timestampLines(from text: String) -> [String] {
        var result: [String] = []
        var pendingTime: String?

        for rawLine in text.split(whereSeparator: \.isNewline) {
            let line = cleanGeneratedLine(String(rawLine))
            if line.isEmpty {
                continue
            }

            if line.hasPrefix("["), let closingBracketIndex = line.firstIndex(of: "]") {
                let time = String(line[line.index(after: line.startIndex)..<closingBracketIndex])
                let titleStart = line.index(after: closingBracketIndex)
                let title = cleanTimestampTitle(String(line[titleStart...]))
                if !title.isEmpty {
                    result.append("\(normalizeTimestamp(time)) \(title)")
                }
                pendingTime = nil
                continue
            }

            if line.range(of: #"^\d{1,2}:\d{2}(?::\d{2})?$"#, options: .regularExpression) != nil {
                pendingTime = normalizeTimestamp(line)
                continue
            }

            if let currentPendingTime = pendingTime {
                let title = cleanTimestampTitle(line)
                if !title.isEmpty {
                    result.append("\(currentPendingTime) \(title)")
                }
                pendingTime = nil
                continue
            }

            guard line.range(of: #"^\d{1,2}:\d{2}(?::\d{2})?(?:\s*[-–—]\s*|\s+).+"#, options: .regularExpression) != nil else {
                continue
            }

            let parts = line.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
            guard parts.count == 2 else {
                continue
            }

            let time = normalizeTimestamp(String(parts[0]).trimmingCharacters(in: CharacterSet(charactersIn: "-–— ")))
            let title = cleanTimestampTitle(String(parts[1]))
            if !title.isEmpty {
                result.append("\(time) \(title)")
            }
        }

        return result
    }

    private func transcriptCueTimes(from transcript: String) -> [Int] {
        transcript
            .split(whereSeparator: \.isNewline)
            .compactMap { transcriptTimestampSeconds(from: String($0)) }
            .sorted()
    }

    private func transcriptTimestampSeconds(from line: String) -> Int? {
        guard let match = line.range(of: #"^\[(\d{1,2}:\d{2}(?::\d{2})?)\]"#, options: .regularExpression) else {
            return nil
        }

        let matched = String(line[match])
            .trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        return secondsFromTimestamp(matched)
    }

    private func nearestTranscriptTime(to seconds: Int, transcriptTimes: [Int]) -> Int? {
        transcriptTimes.min { first, second in
            abs(first - seconds) < abs(second - seconds)
        }
    }

    private func normalizeTimestamp(_ time: String) -> String {
        let parts = time.split(separator: ":").map(String.init)
        if parts.count == 3, parts[0] == "00" {
            return String(time.dropFirst(3))
        }
        return time
    }

    private func cleanGeneratedLine(_ line: String) -> String {
        line
            .replacingOccurrences(of: #"^[\-\*•]\s*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"^\d+[\.\)]\s+"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func cleanTimestampTitle(_ title: String) -> String {
        title
            .replacingOccurrences(of: #"^[\-\*•–—]\s*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"^\d+[\.\)]\s+"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func secondsFromTimestamp(_ time: String) -> Int {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        if parts.count == 2 {
            return parts[0] * 60 + parts[1]
        }

        if parts.count == 3 {
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        }

        return 0
    }

    private static func formatTimestamp(seconds: Int) -> String {
        let safeSeconds = max(0, seconds)
        let hours = safeSeconds / 3600
        let minutes = (safeSeconds % 3600) / 60
        let remainingSeconds = safeSeconds % 60

        if hours > 0 {
            return "\(hours):\(String(format: "%02d", minutes)):\(String(format: "%02d", remainingSeconds))"
        }

        return "\(String(format: "%02d", minutes)):\(String(format: "%02d", remainingSeconds))"
    }

    private func chatGPTAccountID(from accessToken: String) -> String? {
        let parts = accessToken.split(separator: ".")
        guard parts.count >= 2 else {
            return nil
        }

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

    private func errorMessage(from text: String) -> String? {
        guard let data = text.data(using: .utf8) else {
            return nil
        }
        return errorMessage(from: data)
    }

    private func errorMessage(from event: [String: Any]) -> String? {
        if let error = event["error"] as? [String: Any] {
            return (error["message"] as? String) ?? (error["code"] as? String)
        }
        return event["message"] as? String
    }

    private func errorMessage(from data: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
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
