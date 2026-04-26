//
//  AppleIntelligenceService.swift
//  YouTube Timestamps and Summaries Extension
//
//  Created by Codex on 21/04/2026.
//

import Foundation
import FoundationModels
import os.log

enum AppleIntelligenceError: LocalizedError {
    case unavailable(String)
    case missingTranscript
    case generationFailed(String)

    var errorDescription: String? {
        switch self {
        case .unavailable(let reason):
            return "Apple Intelligence is not available: \(reason)"
        case .missingTranscript:
            return "This video does not have an available transcript."
        case .generationFailed(let message):
            return message
        }
    }
}

final class AppleIntelligenceService {
    private let logger = Logger(subsystem: "Matuko.YouTube-Timestamps-and-Summaries", category: "AppleIntelligence")
    private let maxTranscriptChunkCharacters = 3_500
    private let maxAnalysisChunkCharacters = 3_000
    private let maxDirectSummaryCharacters = 10_000
    private let maxFullSummaryChunkCharacters = 10_000
    private let maxParallelAnalysisRequests = 2
    private let maxParallelSummaryRequests = 3

    private struct TranscriptChunk {
        let text: String
        let startSeconds: Int
        let endSeconds: Int

        var rangeLabel: String {
            "\(AppleIntelligenceService.formatTimestamp(seconds: startSeconds))-\(AppleIntelligenceService.formatTimestamp(seconds: endSeconds))"
        }
    }

    private struct TranscriptCue {
        let time: String
        let seconds: Int
        let text: String
    }

    private struct TranscriptChunkAnalysis {
        let index: Int
        let chunk: TranscriptChunk
        let response: String?
    }

    private struct SummaryChunkResult {
        let index: Int
        let text: String?
        let error: String?
    }

    func statusPayload() -> [String: Any] {
        let model = SystemLanguageModel.default
        let availability = availabilityDescription(model.availability)

        return [
            "ok": true,
            "engine": "Apple Intelligence",
            "isConfigured": model.isAvailable,
            "availability": availability,
        ]
    }

    func generate(kind: String, transcript: String = "") async -> [String: Any] {
        let model = model(for: kind)
        let guardrailMode = guardrailMode(for: kind)
        let transcriptText = transcript.trimmingCharacters(in: .whitespacesAndNewlines)

        print("[AppleIntelligence] Starting generation. kind=\(kind)")
        logger.log("Starting local generation. kind=\(kind, privacy: .public) guardrails=\(guardrailMode, privacy: .public)")

        do {
            guard model.isAvailable else {
                throw AppleIntelligenceError.unavailable(availabilityDescription(model.availability))
            }

            guard !transcriptText.isEmpty else {
                throw AppleIntelligenceError.missingTranscript
            }

            let analysisTranscriptText = lightlyMergedTranscript(transcriptText)
            let text: String
            let chunkCount: Int
            if kind == "videoAnalysis" {
                let chunks = chunkTranscriptSections(analysisTranscriptText, maxCharacters: maxAnalysisChunkCharacters)
                chunkCount = chunks.count
                text = try await generateVideoAnalysis(from: chunks, model: model)
            } else if kind == "summaryFull" {
                let chunks = fullSummaryChunks(from: analysisTranscriptText)
                chunkCount = chunks.count
                text = try await generateFullSummary(from: chunks, model: model)
            } else if kind == "summary" {
                let chunks = chunkTranscript(transcriptText)
                chunkCount = chunks.count
                text = try await generateSummary(from: chunks, model: model)
            } else {
                let chunks = chunkTranscript(transcriptText)
                chunkCount = chunks.count
                text = try await generateTimestamps(from: chunks, model: model)
            }

            print("[AppleIntelligence] Generation succeeded. kind=\(kind) chunks=\(chunkCount) textLength=\(text.count)")
            logger.log("Local generation succeeded. kind=\(kind, privacy: .public) chunks=\(chunkCount, privacy: .public) textLength=\(text.count, privacy: .public)")

            return [
                "ok": true,
                "text": text,
                "debug": [
                    "layer": "native",
                    "kind": kind,
                    "model": "Apple Intelligence",
                    "guardrails": guardrailMode,
                    "inputMode": "transcript",
                    "chunks": chunkCount,
                    "step": "completed",
                    "textLength": text.count,
                ],
            ]
        } catch {
            let message = error.localizedDescription.isEmpty ? String(describing: error) : error.localizedDescription
            print("[AppleIntelligence] Generation failed. kind=\(kind) message=\(message)")
            logger.error("Local generation failed. kind=\(kind, privacy: .public) message=\(message, privacy: .private(mask: .hash))")

            return [
                "ok": false,
                "error": message,
                "debug": [
                    "layer": "native",
                    "kind": kind,
                    "model": "Apple Intelligence",
                    "guardrails": guardrailMode,
                    "step": "failed",
                    "detail": message,
                ],
            ]
        }
    }

    private func model(for kind: String) -> SystemLanguageModel {
        if usesPermissiveSummaryGuardrails(kind) {
            return SystemLanguageModel(useCase: .general, guardrails: .permissiveContentTransformations)
        }

        return SystemLanguageModel.default
    }

    private func guardrailMode(for kind: String) -> String {
        usesPermissiveSummaryGuardrails(kind) ? "permissiveContentTransformations" : "default"
    }

    private func usesPermissiveSummaryGuardrails(_ kind: String) -> Bool {
        // Apple recommends this official guardrail preset for content transformations
        // such as summarizing existing user-provided text. Keep timestamps on default.
        kind == "summaryFull" || kind == "summary"
    }

    private func generateTimestamps(from chunks: [String], model: SystemLanguageModel) async throws -> String {
        var allLines: [String] = []
        let transcriptTimes = transcriptCueTimes(from: chunks.joined(separator: "\n"))

        for (index, chunk) in chunks.enumerated() {
            let response = try await respond(
                model: model,
                instructions: """
                You create concise YouTube chapter timestamps from transcript text.
                Use the bracketed transcript timestamps as the source of truth.
                Never invent or shift times.
                Return only short timestamp-title lines.
                """,
                prompt: """
                Create chronological chapter timestamps for transcript section \(index + 1) of \(chunks.count).

                Rules:
                - Output one timestamp per line.
                - Use format MM:SS Title, or H:MM:SS Title after one hour.
                - Do not output a timestamp alone on its own line.
                - Use only times that appear in the bracketed transcript timestamps.
                - Create only major chapter-level topic changes.
                - Prefer evenly spaced chapters across this section.
                - Return 2 to 3 timestamp lines for this section unless there is only one clear topic.
                - Keep each title under 8 words.
                - Do not quote or continue the transcript.

                Transcript:
                \(chunk)
                """,
                maximumResponseTokens: 700
            )

            allLines.append(contentsOf: timestampLines(from: response))
        }

        let validLines = transcriptAlignedTimestampLines(allLines, transcriptTimes: transcriptTimes)
        let deduped = spacedTimestampLines(dedupeTimestampLines(validLines), videoDuration: transcriptTimes.last ?? 0)
        guard !deduped.isEmpty else {
            throw AppleIntelligenceError.generationFailed("Apple Intelligence did not return usable timestamps.")
        }

        return deduped.joined(separator: "\n")
    }

    private func generateSummary(from chunks: [String], model: SystemLanguageModel) async throws -> String {
        if chunks.count == 1 {
            return try await respond(
                model: model,
                instructions: "You summarize YouTube transcripts clearly and concisely.",
                prompt: """
                Summarize this video transcript.

                Transcript:
                \(chunks[0])
                """,
                maximumResponseTokens: 800
            )
        }

        var sectionSummaries: [String] = []
        for (index, chunk) in chunks.enumerated() {
            let sectionSummary = try await respond(
                model: model,
                instructions: "You summarize sections of YouTube transcripts clearly and concisely.",
                prompt: """
                Summarize transcript section \(index + 1) of \(chunks.count) in 3 to 5 short bullets.

                Transcript:
                \(chunk)
                """,
                maximumResponseTokens: 450
            )
            sectionSummaries.append("Section \(index + 1):\n\(sectionSummary)")
        }

        return try await respond(
            model: model,
            instructions: "You combine section summaries into a concise full-video summary.",
            prompt: """
            Create one clear summary of the full video from these section summaries.
            Avoid repeating the section labels.

            Section summaries:
            \(sectionSummaries.joined(separator: "\n\n"))
            """,
            maximumResponseTokens: 1_200
        )
    }

    private func generateFullSummary(from chunks: [String], model: SystemLanguageModel) async throws -> String {
        guard !chunks.isEmpty else {
            throw AppleIntelligenceError.missingTranscript
        }

        if chunks.count == 1 {
            return try await respond(
                model: model,
                instructions: "You summarize YouTube transcripts clearly and concisely.",
                prompt: """
                Summarize this video transcript in a useful way.

                Format:
                Overview:
                One or two sentences.

                Key points:
                - 4 to 8 concise bullets.

                Transcript:
                \(chunks[0])
                """,
                maximumResponseTokens: 1_100
            )
        }

        return try await summarizeFullSummaryChunks(chunks, model: model)
            .joined(separator: "\n\n")
    }

    private func summarizeFullSummaryChunks(_ chunks: [String], model: SystemLanguageModel) async throws -> [String] {
        let results = await withTaskGroup(of: SummaryChunkResult.self) { group in
            var results: [SummaryChunkResult] = []
            var nextIndex = 0

            func enqueueNextChunk() {
                guard nextIndex < chunks.count else {
                    return
                }

                let chunkIndex = nextIndex
                let chunk = chunks[chunkIndex]
                nextIndex += 1

                group.addTask { [self] in
                    do {
                        let summary = try await summarizeFullSummaryChunk(
                            chunk,
                            index: chunkIndex,
                            totalCount: chunks.count,
                            model: model
                        )
                        return SummaryChunkResult(index: chunkIndex, text: summary, error: nil)
                    } catch {
                        let message = error.localizedDescription.isEmpty ? String(describing: error) : error.localizedDescription
                        return SummaryChunkResult(index: chunkIndex, text: nil, error: message)
                    }
                }
            }

            for _ in 0..<min(maxParallelSummaryRequests, chunks.count) {
                enqueueNextChunk()
            }

            while let result = await group.next() {
                results.append(result)
                enqueueNextChunk()
            }

            return results.sorted { first, second in
                first.index < second.index
            }
        }

        let successfulSummaries = results.compactMap { result -> String? in
            guard let text = result.text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
                return nil
            }
            return text
        }

        guard !successfulSummaries.isEmpty else {
            let firstError = results.compactMap(\.error).first ?? "Apple Intelligence did not return usable section summaries."
            throw AppleIntelligenceError.generationFailed(firstError)
        }

        return successfulSummaries
    }

    private func summarizeFullSummaryChunk(
        _ chunk: String,
        index: Int,
        totalCount: Int,
        model: SystemLanguageModel
    ) async throws -> String {
        try await respond(
            model: model,
            instructions: "You summarize YouTube transcript parts.",
            prompt: """
            Write 3 to 5 useful bullets for part \(index + 1) of \(totalCount).
            Keep concrete claims, examples, names, numbers, and conclusions.
            Skip filler, ads, greetings, and repeated phrases.

            Transcript:
            \(chunk)
            """,
            maximumResponseTokens: 420
        )
    }

    private func generateVideoAnalysis(from chunks: [TranscriptChunk], model: SystemLanguageModel) async throws -> String {
        guard !chunks.isEmpty else {
            throw AppleIntelligenceError.missingTranscript
        }

        let transcriptText = chunks.map(\.text).joined(separator: "\n")
        let transcriptTimes = transcriptCueTimes(from: transcriptText)
        var sectionNotes: [String] = []
        var sectionSummaries: [String] = []
        var topicCandidates: [String] = []
        var skippedChunkCount = 0

        for analysis in await analyzeTranscriptChunks(chunks, model: model) {
            let index = analysis.index
            let chunk = analysis.chunk

            guard let response = analysis.response else {
                skippedChunkCount += 1
                sectionNotes.append("""
                Section \(index + 1) (\(chunk.rangeLabel))
                Summary: Skipped because Apple Intelligence could not analyze this transcript section.
                Topics:
                - No topic candidate
                """)
                continue
            }

            let summary = sectionSummary(from: response)
            let chunkTimes = transcriptCueTimes(from: chunk.text)
            let topics = transcriptAlignedTimestampLines(
                timestampLines(from: response),
                transcriptTimes: chunkTimes
            )

            if !summary.isEmpty {
                sectionSummaries.append("Section \(index + 1) (\(chunk.rangeLabel)): \(summary)")
            }

            if !topics.isEmpty {
                topicCandidates.append(contentsOf: topics)
            }

            let topicText = topics.isEmpty
                ? "- No clear topic candidate"
                : topics.map { "- \($0)" }.joined(separator: "\n")
            sectionNotes.append("""
            Section \(index + 1) (\(chunk.rangeLabel))
            Summary: \(summary.isEmpty ? "No summary returned." : summary)
            Topics:
            \(topicText)
            """)
        }

        let dedupedTopics = spacedTimestampLines(
            dedupeTimestampLines(transcriptAlignedTimestampLines(topicCandidates, transcriptTimes: transcriptTimes)),
            videoDuration: transcriptTimes.last ?? chunks.last?.endSeconds ?? 0
        )
        guard !dedupedTopics.isEmpty else {
            throw AppleIntelligenceError.generationFailed("Apple Intelligence did not return usable topic timestamps.")
        }

        let summary = try await combineSectionSummaries(sectionSummaries, model: model)
        let skippedNote = skippedChunkCount > 0
            ? "\n\nNOTE:\nSkipped \(skippedChunkCount) transcript section\(skippedChunkCount == 1 ? "" : "s") because Apple Intelligence could not analyze that content."
            : ""

        return """
        SUMMARY:
        \(summary)

        TIMESTAMPS:
        \(dedupedTopics.joined(separator: "\n"))
        \(skippedNote)

        TOPIC MAP:
        \(sectionNotes.joined(separator: "\n\n"))
        """
    }

    private func analyzeTranscriptChunks(
        _ chunks: [TranscriptChunk],
        model: SystemLanguageModel
    ) async -> [TranscriptChunkAnalysis] {
        await withTaskGroup(of: TranscriptChunkAnalysis.self) { group in
            var results: [TranscriptChunkAnalysis] = []
            var nextIndex = 0

            func enqueueNextChunk() {
                guard nextIndex < chunks.count else {
                    return
                }

                let chunkIndex = nextIndex
                let chunk = chunks[chunkIndex]
                nextIndex += 1

                group.addTask { [self] in
                    do {
                        let response = try await analyzeTranscriptChunk(
                            chunk,
                            index: chunkIndex,
                            totalCount: chunks.count,
                            model: model
                        )
                        return TranscriptChunkAnalysis(index: chunkIndex, chunk: chunk, response: response)
                    } catch {
                        return TranscriptChunkAnalysis(index: chunkIndex, chunk: chunk, response: nil)
                    }
                }
            }

            for _ in 0..<min(maxParallelAnalysisRequests, chunks.count) {
                enqueueNextChunk()
            }

            while let result = await group.next() {
                results.append(result)
                enqueueNextChunk()
            }

            return results.sorted { first, second in
                first.index < second.index
            }
        }
    }

    private func analyzeTranscriptChunk(
        _ chunk: TranscriptChunk,
        index: Int,
        totalCount: Int,
        model: SystemLanguageModel
    ) async throws -> String {
        try await respond(
            model: model,
            instructions: """
            You analyze YouTube transcript chunks.
            Find the main topics, but use only timestamps that are present in the transcript.
            Do not invent timing.
            """,
            prompt: """
            Analyze transcript chunk \(index + 1) of \(totalCount).
            Chunk time range: \(chunk.rangeLabel)

            Rules:
            - Return exactly one short Summary line.
            - Return 1 to 4 Topic lines only when the topic meaningfully changes.
            - Topic titles should be concise YouTube chapter titles, not transcript quotes.
            - Use only timestamps that appear in the input transcript.
            - Prefer the earliest timestamp where a topic begins.
            - Do not invent or shift timestamps.

            Output format:
            Summary: one sentence summary of this chunk
            Topics:
            - [MM:SS] Concise Topic Title

            Transcript:
            \(chunk.text)
            """,
            maximumResponseTokens: 450
        )
    }

    private func combineSectionSummaries(_ sectionSummaries: [String], model: SystemLanguageModel) async throws -> String {
        let joinedSummaries = sectionSummaries
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .joined(separator: "\n")

        guard !joinedSummaries.isEmpty else {
            throw AppleIntelligenceError.generationFailed("Apple Intelligence did not return usable section summaries.")
        }

        return try await respond(
            model: model,
            instructions: "You combine transcript chunk summaries into one clear video summary.",
            prompt: """
            Create a concise summary of the full video from these timestamped section summaries.
            Avoid repeating section labels.

            Section summaries:
            \(joinedSummaries)
            """,
            maximumResponseTokens: 1_000
        )
    }

    private func fullSummaryChunks(from transcript: String) -> [String] {
        let transcriptText = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !transcriptText.isEmpty else {
            return []
        }

        if transcriptText.count <= maxDirectSummaryCharacters {
            return [transcriptText]
        }

        return chunkTranscript(transcriptText, maxCharacters: maxFullSummaryChunkCharacters)
    }

    private func sectionSummary(from response: String) -> String {
        let lines = response
            .split(whereSeparator: \.isNewline)
            .map { cleanGeneratedLine(String($0)) }
            .filter { !$0.isEmpty }

        for line in lines {
            let lowercasedLine = line.lowercased()
            if lowercasedLine.hasPrefix("summary:") {
                return String(line.dropFirst("summary:".count))
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }

        return lines.first { line in
            !line.lowercased().hasPrefix("topics:")
                && line.range(of: #"^\[?\d{1,2}:\d{2}"#, options: .regularExpression) == nil
        } ?? ""
    }

    private func respond(
        model: SystemLanguageModel,
        instructions: String,
        prompt: String,
        maximumResponseTokens: Int
    ) async throws -> String {
        let session = LanguageModelSession(
            model: model,
            tools: [],
            instructions: instructions
        )
        let options = GenerationOptions(
            sampling: .greedy,
            temperature: nil,
            maximumResponseTokens: maximumResponseTokens
        )
        let response = try await session.respond(to: prompt, options: options)
        let text = response.content.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !text.isEmpty else {
            throw AppleIntelligenceError.generationFailed("Apple Intelligence returned an empty response.")
        }

        return text
    }

    private func chunkTranscript(_ transcript: String, maxCharacters: Int? = nil) -> [String] {
        var chunks: [String] = []
        var currentLines: [String] = []
        var currentLength = 0
        let characterLimit = maxCharacters ?? maxTranscriptChunkCharacters

        for line in transcript.split(separator: "\n", omittingEmptySubsequences: true) {
            let lineText = String(line)
            if currentLength + lineText.count > characterLimit, !currentLines.isEmpty {
                chunks.append(currentLines.joined(separator: "\n"))
                currentLines = []
                currentLength = 0
            }

            currentLines.append(lineText)
            currentLength += lineText.count + 1
        }

        if !currentLines.isEmpty {
            chunks.append(currentLines.joined(separator: "\n"))
        }

        return chunks
    }

    private func lightlyMergedTranscript(_ transcript: String) -> String {
        let cues = transcript
            .split(whereSeparator: \.isNewline)
            .compactMap { transcriptCue(from: String($0)) }
        guard !cues.isEmpty else {
            return transcript
        }

        var mergedLines: [String] = []
        var currentStart = cues[0]
        var currentTexts: [String] = []
        var currentCharacterCount = 0

        func flushCurrentLine() {
            guard !currentTexts.isEmpty else {
                return
            }

            let text = currentTexts
                .joined(separator: " ")
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                mergedLines.append("[\(currentStart.time)] \(text)")
            }
            currentTexts = []
            currentCharacterCount = 0
        }

        for cue in cues {
            let elapsed = cue.seconds - currentStart.seconds
            let wouldBeTooLong = currentCharacterCount + cue.text.count > 260
            let wouldBeTooLongInTime = elapsed >= 18
            let likelyNewThought = elapsed >= 8 && isLikelyNewThought(cue.text)

            if !currentTexts.isEmpty && (wouldBeTooLong || wouldBeTooLongInTime || likelyNewThought) {
                flushCurrentLine()
                currentStart = cue
            }

            currentTexts.append(cue.text)
            currentCharacterCount += cue.text.count + 1
        }

        flushCurrentLine()
        return mergedLines.joined(separator: "\n")
    }

    private func transcriptCue(from line: String) -> TranscriptCue? {
        guard let match = line.range(of: #"^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$"#, options: .regularExpression) else {
            return nil
        }

        let matched = String(line[match])
        guard let closingBracketIndex = matched.firstIndex(of: "]") else {
            return nil
        }

        let time = String(matched[matched.index(after: matched.startIndex)..<closingBracketIndex])
        let textStart = matched.index(after: closingBracketIndex)
        let text = String(matched[textStart...])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            return nil
        }

        return TranscriptCue(
            time: time,
            seconds: secondsFromTimestamp(time),
            text: text
        )
    }

    private func isLikelyNewThought(_ text: String) -> Bool {
        let lowercasedText = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let starters = [
            "so ",
            "but ",
            "and ",
            "now ",
            "then ",
            "when ",
            "what ",
            "why ",
            "how ",
            "did ",
            "do ",
            "does ",
            "is ",
            "are ",
            "was ",
            "were ",
            "well ",
            "yeah ",
            "no ",
        ]

        return starters.contains { lowercasedText.hasPrefix($0) }
    }

    private func chunkTranscriptSections(_ transcript: String, maxCharacters: Int) -> [TranscriptChunk] {
        var chunks: [TranscriptChunk] = []
        var currentLines: [String] = []
        var currentLength = 0
        var currentStartSeconds: Int?
        var currentEndSeconds: Int?

        func flushCurrentChunk() {
            guard !currentLines.isEmpty else {
                return
            }

            chunks.append(TranscriptChunk(
                text: currentLines.joined(separator: "\n"),
                startSeconds: currentStartSeconds ?? 0,
                endSeconds: currentEndSeconds ?? currentStartSeconds ?? 0
            ))
            currentLines = []
            currentLength = 0
            currentStartSeconds = nil
            currentEndSeconds = nil
        }

        for line in transcript.split(separator: "\n", omittingEmptySubsequences: true) {
            let lineText = String(line)
            let lineSeconds = transcriptTimestampSeconds(from: lineText)

            if currentLength + lineText.count > maxCharacters, !currentLines.isEmpty {
                flushCurrentChunk()
            }

            if currentStartSeconds == nil {
                currentStartSeconds = lineSeconds
            }
            if let lineSeconds {
                currentEndSeconds = lineSeconds
            }

            currentLines.append(lineText)
            currentLength += lineText.count + 1
        }

        flushCurrentChunk()
        return chunks
    }

    private func timestampLines(from text: String) -> [String] {
        var result: [String] = []
        var pendingTime: String?
        let rawLines = text
            .split(whereSeparator: \.isNewline)
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }

        for rawLine in rawLines {
            let line = cleanGeneratedLine(rawLine)
            if line.hasPrefix("["), let closingBracketIndex = line.firstIndex(of: "]") {
                let time = String(line[line.index(after: line.startIndex)..<closingBracketIndex])
                let titleStart = line.index(after: closingBracketIndex)
                let title = cleanTimestampTitle(String(line[titleStart...]))
                if isUsableTimestampTitle(title) {
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
                if isUsableTimestampTitle(title) {
                    result.append("\(currentPendingTime) \(title)")
                }
                pendingTime = nil
                continue
            }

            guard let match = line.range(of: #"^\d{1,2}:\d{2}(?::\d{2})?(?:\s*[-–—]\s*|\s+).+"#, options: .regularExpression) else {
                continue
            }

            let matched = String(line[match])
            let parts = matched.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
            guard parts.count == 2 else {
                continue
            }

            let time = normalizeTimestamp(String(parts[0]).trimmingCharacters(in: CharacterSet(charactersIn: "-–— ")))
            let title = cleanTimestampTitle(String(parts[1]))
            if isUsableTimestampTitle(title) {
                result.append("\(time) \(title)")
            }
        }

        return result
    }

    private func normalizeTimestamp(_ time: String) -> String {
        let parts = time.split(separator: ":").map(String.init)
        if parts.count == 3, parts[0] == "00" {
            return String(time.dropFirst(3))
        }

        if parts.count == 3, parts[2] == "00", (Int(parts[0]) ?? 0) < 60 {
            return "\(parts[0]):\(parts[1])"
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

    private func isUsableTimestampTitle(_ title: String) -> Bool {
        let words = title.split(whereSeparator: \.isWhitespace)
        let lowercasedTitle = title.lowercased()
        let sentenceLikeStarts = [
            "at ",
            "i ",
            "i'm ",
            "i’ve ",
            "i was ",
            "we ",
            "we're ",
            "you ",
            "he ",
            "she ",
            "they ",
            "it ",
            "this ",
            "that ",
            "there ",
            "when ",
            "where ",
            "why ",
            "how ",
            "so ",
            "and ",
            "but ",
        ]

        return !title.isEmpty
            && title.count <= 90
            && words.count <= 8
            && title.range(of: #"[.!?]"#, options: .regularExpression) == nil
            && !sentenceLikeStarts.contains { lowercasedTitle.hasPrefix($0) }
    }

    private func dedupeTimestampLines(_ lines: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []

        for line in lines {
            let time = line.split(separator: " ", maxSplits: 1).first.map(String.init) ?? line
            if seen.insert(time).inserted {
                result.append(line)
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

    private func transcriptAlignedTimestampLines(_ lines: [String], transcriptTimes: [Int]) -> [String] {
        let maxTranscriptTime = transcriptTimes.last ?? 0

        return lines.compactMap { line -> String? in
            let parts = line.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
            guard parts.count == 2 else {
                return nil
            }

            let seconds = secondsFromTimestamp(String(parts[0]))
            guard seconds <= maxTranscriptTime + 10 else {
                return nil
            }

            let alignedSeconds = nearestTranscriptTime(to: seconds, transcriptTimes: transcriptTimes) ?? seconds
            guard abs(alignedSeconds - seconds) <= 20 else {
                return nil
            }

            return "\(Self.formatTimestamp(seconds: alignedSeconds)) \(parts[1])"
        }
    }

    private func nearestTranscriptTime(to seconds: Int, transcriptTimes: [Int]) -> Int? {
        transcriptTimes.min { first, second in
            abs(first - seconds) < abs(second - seconds)
        }
    }

    private func spacedTimestampLines(_ lines: [String], videoDuration: Int) -> [String] {
        let parsed = lines.compactMap { line -> (line: String, seconds: Int)? in
            guard let time = line.split(separator: " ", maxSplits: 1).first.map(String.init) else {
                return nil
            }

            return (line, secondsFromTimestamp(time))
        }
        .sorted { first, second in
            first.seconds < second.seconds
        }

        guard parsed.count > 2 else {
            return parsed.map(\.line)
        }

        let duration = max(videoDuration, parsed.last?.seconds ?? 0)
        let minimumGap = duration < 600 ? 45 : 75
        var result: [(line: String, seconds: Int)] = []

        for item in parsed {
            if result.isEmpty || item.seconds - (result.last?.seconds ?? 0) >= minimumGap {
                result.append(item)
            }
        }

        if result.count < 3, parsed.count >= 3 {
            result = [parsed[0], parsed[parsed.count / 2], parsed[parsed.count - 1]]
        }

        return result.map(\.line)
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

    private func availabilityDescription(_ availability: SystemLanguageModel.Availability) -> String {
        switch availability {
        case .available:
            return "available"
        case .unavailable(.appleIntelligenceNotEnabled):
            return "Apple Intelligence is not enabled"
        case .unavailable(.deviceNotEligible):
            return "this Mac does not support Apple Intelligence"
        case .unavailable(.modelNotReady):
            return "the on-device model is not ready yet"
        @unknown default:
            return "unknown availability"
        }
    }

}
