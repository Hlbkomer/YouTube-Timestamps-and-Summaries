//
//  AppleIntelligenceService.swift
//  Timestamps & Summaries for YT Extension
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
    private let maxUnsupportedLanguageDirectSummaryCharacters = 6_000
    private let maxUnsupportedLanguageFullSummaryChunkCharacters = 6_000
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

    private struct SummaryGenerationResult {
        let text: String
        let chunkCount: Int
        let debugPayload: [String: Any]
    }

    private struct TimestampGenerationResult {
        let text: String
        let chunkCount: Int
        let debugPayload: [String: Any]
    }

    private struct SummaryChunkPlan {
        let chunks: [String]
        let strategy: String
        let contextSize: Int?
        let inputTokenBudget: Int?
        let fallbackReason: String?

        var debugPayload: [String: Any] {
            var payload: [String: Any] = [
                "chunkStrategy": strategy,
            ]

            if let contextSize {
                payload["contextSize"] = contextSize
            }

            if let inputTokenBudget {
                payload["inputTokenBudget"] = inputTokenBudget
            }

            if let fallbackReason {
                payload["chunkFallbackReason"] = fallbackReason
            }

            return payload
        }
    }

    private struct LanguageContext {
        let code: String
        let label: String

        init(code: String, label: String) {
            self.code = code
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            self.label = label.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        var baseCode: String {
            code.split(separator: "-").first.map(String.init) ?? ""
        }

        var displayName: String {
            if !label.isEmpty {
                return label
            }

            return code
        }

        var debugLabel: String {
            if !displayName.isEmpty, !code.isEmpty {
                return "\(displayName) (\(code))"
            }

            if !displayName.isEmpty {
                return displayName
            }

            return "unknown"
        }

        func isAppleSupported(by model: SystemLanguageModel) -> Bool {
            guard !code.isEmpty else {
                return true
            }

            return model.supportsLocale(Locale(identifier: code))
        }

    }

    func statusPayload() -> [String: Any] {
        let model = SystemLanguageModel.default
        let availability = availabilityDescription(model.availability)
        let payload: [String: Any] = [
            "ok": true,
            "engine": "Apple Intelligence",
            "isConfigured": model.isAvailable,
            "availability": availability,
        ]

        return payload
    }

    func generate(
        kind: String,
        transcript: String = "",
        languageCode: String = "",
        languageLabel: String = ""
    ) async -> [String: Any] {
        let model = SystemLanguageModel(useCase: .general, guardrails: .permissiveContentTransformations)
        let guardrailMode = "permissiveContentTransformations"
        let transcriptText = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        let languageContext = LanguageContext(code: languageCode, label: languageLabel)

        print("[AppleIntelligence] Starting generation. kind=\(kind) language=\(languageContext.debugLabel)")
        logger.log("Starting local generation. kind=\(kind, privacy: .public) guardrails=\(guardrailMode, privacy: .public) language=\(languageContext.debugLabel, privacy: .public)")

        do {
            guard kind == "summaryFull" else {
                throw AppleIntelligenceError.generationFailed("Unsupported Apple Intelligence request: \(kind)")
            }

            guard model.isAvailable else {
                throw AppleIntelligenceError.unavailable(availabilityDescription(model.availability))
            }

            guard !transcriptText.isEmpty else {
                throw AppleIntelligenceError.missingTranscript
            }

            let analysisTranscriptText = lightlyMergedTranscript(transcriptText)
            let text: String
            let chunkCount: Int
            var summaryChunkDebug: [String: Any] = [:]
            #if compiler(>=6.4)
            if #available(macOS 27.0, *) {
                let result = try await generateMacOS27FullSummary(
                    from: analysisTranscriptText,
                    localModel: model,
                    languageContext: languageContext
                )
                chunkCount = result.chunkCount
                summaryChunkDebug = result.debugPayload
                text = result.text
            } else {
                let plan = legacyFullSummaryChunkPlan(
                    from: analysisTranscriptText,
                    languageContext: languageContext,
                    model: model,
                    fallbackReason: nil
                )
                chunkCount = plan.chunks.count
                summaryChunkDebug = plan.debugPayload
                text = try await generateFullSummary(from: plan.chunks, model: model, languageContext: languageContext)
            }
            #else
            let plan = legacyFullSummaryChunkPlan(
                from: analysisTranscriptText,
                languageContext: languageContext,
                model: model,
                fallbackReason: nil
            )
            chunkCount = plan.chunks.count
            summaryChunkDebug = plan.debugPayload
            text = try await generateFullSummary(from: plan.chunks, model: model, languageContext: languageContext)
            #endif

            print("[AppleIntelligence] Generation succeeded. kind=\(kind) chunks=\(chunkCount) textLength=\(text.count)")
            logger.log("Local generation succeeded. kind=\(kind, privacy: .public) chunks=\(chunkCount, privacy: .public) textLength=\(text.count, privacy: .public)")

            var debug: [String: Any] = [
                "layer": "native",
                "kind": kind,
                "model": "Apple Intelligence",
                "guardrails": guardrailMode,
                "inputMode": "transcript",
                "languageCode": languageContext.code,
                "languageLabel": languageContext.label,
                "languageIsAppleSupported": languageContext.isAppleSupported(by: model),
                "chunks": chunkCount,
                "step": "completed",
                "textLength": text.count,
            ]
            debug.merge(summaryChunkDebug) { _, new in new }

            return [
                "ok": true,
                "text": text,
                "debug": debug,
            ]
        } catch {
            let message = readableErrorMessage(error)
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
                    "languageCode": languageContext.code,
                    "languageLabel": languageContext.label,
                    "languageIsAppleSupported": languageContext.isAppleSupported(by: model),
                    "step": "failed",
                    "detail": message,
                ],
            ]
        }
    }

    #if false // Retired local timestamp and short-summary paths; excluded from the shipping target.
    private func generateTimestamps(
        from chunks: [String],
        model: SystemLanguageModel,
        languageContext: LanguageContext
    ) async throws -> String {
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
                \(outputLanguageInstruction(languageContext: languageContext, model: model, outputName: "timestamp titles"))

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

    #if compiler(>=6.4)
    @available(macOS 27.0, *)
    private func generateBetaTimestamps(
        from transcript: String,
        localModel: SystemLanguageModel,
        languageContext: LanguageContext
    ) async throws -> TimestampGenerationResult {
        let cloudModel = PrivateCloudComputeLanguageModel()
        guard cloudModel.isAvailable else {
            throw AppleIntelligenceError.unavailable("T27 requires Private Cloud Compute: \(privateCloudAvailabilityDescription(cloudModel.availability))")
        }

        let outputInstruction = outputLanguageInstruction(
            languageContext: languageContext,
            model: localModel,
            outputName: "timestamp titles"
        )
        let plan = try await privateCloudTimestampChunkPlan(
            from: transcript,
            cloudModel: cloudModel,
            localModel: localModel,
            outputInstruction: outputInstruction
        )
        var debug = plan.debugPayload
        debug["betaModel"] = "Private Cloud Compute"
        debug["privateCloudAvailable"] = true
        debug["reasoningLevel"] = "default"
        debug.merge(privateCloudQuotaDebugPayload(cloudModel.quotaUsage)) { _, new in new }
        let text: String
        do {
            text = try await generatePrivateCloudTimestamps(
                from: plan.chunks,
                model: cloudModel,
                outputInstruction: outputInstruction
            )
        } catch {
            let message = readableErrorMessage(error)
            throw AppleIntelligenceError.generationFailed(
                """
                T27 cloud request failed: \(message) \
                chunks=\(plan.chunks.count), \
                strategy=\(plan.strategy), \
                contextSize=\(plan.contextSize.map(String.init) ?? "unknown"), \
                inputTokenBudget=\(plan.inputTokenBudget.map(String.init) ?? "unknown"), \
                quota=\(privateCloudQuotaStatusDescription(cloudModel.quotaUsage.status))
                """
            )
        }

        return TimestampGenerationResult(
            text: text,
            chunkCount: plan.chunks.count,
            debugPayload: debug
        )
    }

    @available(macOS 27.0, *)
    private func privateCloudTimestampChunkPlan(
        from transcript: String,
        cloudModel: PrivateCloudComputeLanguageModel,
        localModel: SystemLanguageModel,
        outputInstruction: String
    ) async throws -> SummaryChunkPlan {
        let transcriptText = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        let contextSize = try await cloudModel.contextSize
        guard !transcriptText.isEmpty else {
            return SummaryChunkPlan(
                chunks: [],
                strategy: "private-cloud-timestamps",
                contextSize: contextSize,
                inputTokenBudget: nil,
                fallbackReason: nil
            )
        }

        let maximumResponseTokens = 1_400
        let inputTokenBudget = summaryInputTokenBudget(
            contextSize: contextSize,
            maximumResponseTokens: maximumResponseTokens
        )
        let fullRequestTokens = try await privateCloudRequestTokenCount(
            model: localModel,
            instructions: privateCloudTimestampInstructions(),
            prompt: privateCloudTimestampPrompt(
                for: transcriptText,
                outputInstruction: outputInstruction,
                index: 0,
                totalCount: 1
            )
        )

        if fullRequestTokens <= inputTokenBudget {
            return SummaryChunkPlan(
                chunks: [transcriptText],
                strategy: "private-cloud-timestamps-single",
                contextSize: contextSize,
                inputTokenBudget: inputTokenBudget,
                fallbackReason: nil
            )
        }

        let chunks = try await privateCloudTimestampChunks(
            transcriptText,
            inputTokenBudget: inputTokenBudget,
            cloudModel: cloudModel,
            localModel: localModel,
            outputInstruction: outputInstruction
        )

        return SummaryChunkPlan(
            chunks: chunks,
            strategy: "private-cloud-timestamps",
            contextSize: contextSize,
            inputTokenBudget: inputTokenBudget,
            fallbackReason: nil
        )
    }

    @available(macOS 27.0, *)
    private func privateCloudTimestampChunks(
        _ transcript: String,
        inputTokenBudget: Int,
        cloudModel: PrivateCloudComputeLanguageModel,
        localModel: SystemLanguageModel,
        outputInstruction: String
    ) async throws -> [String] {
        let lines = transcript
            .split(separator: "\n", omittingEmptySubsequences: true)
            .map(String.init)
        guard !lines.isEmpty else {
            return []
        }

        var chunks: [String] = []
        var startIndex = 0

        while startIndex < lines.count {
            var low = startIndex + 1
            var high = lines.count
            var bestEndIndex = startIndex + 1

            while low <= high {
                let mid = (low + high) / 2
                let candidate = lines[startIndex..<mid].joined(separator: "\n")
                let tokenCount = try await privateCloudRequestTokenCount(
                    model: localModel,
                    instructions: privateCloudTimestampInstructions(),
                    prompt: privateCloudTimestampPrompt(
                        for: candidate,
                        outputInstruction: outputInstruction,
                        index: chunks.count,
                        totalCount: 1
                    )
                )

                if tokenCount <= inputTokenBudget {
                    bestEndIndex = mid
                    low = mid + 1
                } else {
                    high = mid - 1
                }
            }

            chunks.append(lines[startIndex..<bestEndIndex].joined(separator: "\n"))
            startIndex = bestEndIndex
        }

        return chunks
    }

    @available(macOS 27.0, *)
    private func generatePrivateCloudTimestamps(
        from chunks: [String],
        model: PrivateCloudComputeLanguageModel,
        outputInstruction: String
    ) async throws -> String {
        guard !chunks.isEmpty else {
            throw AppleIntelligenceError.missingTranscript
        }

        var allLines: [String] = []
        let transcriptTimes = transcriptCueTimes(from: chunks.joined(separator: "\n"))

        for (index, chunk) in chunks.enumerated() {
            let response = try await respondPrivateCloud(
                model: model,
                instructions: privateCloudTimestampInstructions(),
                prompt: privateCloudTimestampPrompt(
                    for: chunk,
                    outputInstruction: outputInstruction,
                    index: index,
                    totalCount: chunks.count
                ),
                maximumResponseTokens: chunks.count == 1 ? 1_400 : 900,
                reasoningLevel: nil
            )

            allLines.append(contentsOf: timestampLines(from: response))
        }

        let validLines = transcriptAlignedTimestampLines(allLines, transcriptTimes: transcriptTimes)
        let deduped = spacedTimestampLines(dedupeTimestampLines(validLines), videoDuration: transcriptTimes.last ?? 0)
        guard !deduped.isEmpty else {
            throw AppleIntelligenceError.generationFailed("Apple Intelligence Cloud 27 did not return usable timestamps.")
        }

        return deduped.joined(separator: "\n")
    }

    private func privateCloudTimestampInstructions() -> String {
        """
        You create concise YouTube chapter timestamps from transcript text.
        Use the bracketed transcript timestamps as the source of truth.
        Never invent, estimate, or shift times.
        Return only timestamp-title lines.
        """
    }

    private func privateCloudTimestampPrompt(
        for transcript: String,
        outputInstruction: String,
        index: Int,
        totalCount: Int
    ) -> String {
        let scope = totalCount == 1
            ? "Create chronological chapter timestamps for this full transcript."
            : "Create chronological chapter timestamps for transcript section \(index + 1) of \(totalCount)."

        return """
        \(scope)
        \(outputInstruction)

        Rules:
        - Output one timestamp per line.
        - Use format MM:SS Title, or H:MM:SS Title after one hour.
        - Do not output a timestamp alone on its own line.
        - Use only timestamps that appear in the bracketed transcript.
        - Create only major chapter-level topic changes.
        - Prefer the earliest timestamp where a topic begins.
        - Keep each title short and useful.
        - Do not quote or continue the transcript.

        Transcript:
        \(transcript)
        """
    }
    #endif

    private func generateSummary(
        from chunks: [String],
        model: SystemLanguageModel,
        languageContext: LanguageContext
    ) async throws -> String {
        if chunks.count == 1 {
            return try await respond(
                model: model,
                instructions: "You summarize YouTube transcripts clearly and concisely.",
                prompt: """
                Summarize this video transcript.
                \(outputLanguageInstruction(languageContext: languageContext, model: model, outputName: "summary"))
                Start with a short overview paragraph.
                Then use bold section labels like **Main Topic** with useful bullet points.
                Use one nested bullet level only when it adds helpful detail.

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
                \(outputLanguageInstruction(languageContext: languageContext, model: model, outputName: "summary"))

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
            \(outputLanguageInstruction(languageContext: languageContext, model: model, outputName: "summary"))
            Avoid repeating the section labels.
            Start with a short overview paragraph.
            Then use bold section labels like **Main Topic** with useful bullet points.
            Use one nested bullet level only when it adds helpful detail.

            Section summaries:
            \(sectionSummaries.joined(separator: "\n\n"))
            """,
            maximumResponseTokens: 1_200
        )
    }
    #endif

    private func generateFullSummary(
        from chunks: [String],
        model: SystemLanguageModel,
        languageContext: LanguageContext
    ) async throws -> String {
        guard !chunks.isEmpty else {
            throw AppleIntelligenceError.missingTranscript
        }

        if chunks.count == 1 {
            let text = try await respond(
                model: model,
                instructions: fullSummaryInstructions(languageContext: languageContext),
                prompt: fullSummaryPrompt(for: chunks[0], languageContext: languageContext, model: model),
                maximumResponseTokens: 1_100
            )
            return cleanedSummaryText(text)
        }

        let text = try await summarizeFullSummaryChunks(chunks, model: model, languageContext: languageContext)
            .joined(separator: "\n\n")
        return cleanedSummaryText(text)
    }

    private func summarizeFullSummaryChunks(
        _ chunks: [String],
        model: SystemLanguageModel,
        languageContext: LanguageContext
    ) async throws -> [String] {
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
                            model: model,
                            languageContext: languageContext
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
        model: SystemLanguageModel,
        languageContext: LanguageContext
    ) async throws -> String {
        let response: String

        if index == 0 {
            response = try await respond(
                model: model,
                instructions: fullSummaryInstructions(languageContext: languageContext),
                prompt: fullSummaryPrompt(for: chunk, languageContext: languageContext, model: model),
                maximumResponseTokens: 1_100
            )
        } else {
            response = try await respond(
                model: model,
                instructions: laterSummaryInstructions(languageContext: languageContext),
                prompt: laterSummaryPrompt(for: chunk, languageContext: languageContext, model: model),
                maximumResponseTokens: 420
            )
        }

        return response
    }

    #if compiler(>=6.4)
    @available(macOS 27.0, *)
    private func generateMacOS27FullSummary(
        from transcript: String,
        localModel: SystemLanguageModel,
        languageContext: LanguageContext
    ) async throws -> SummaryGenerationResult {
        let plan = try await tokenAwareFullSummaryChunkPlan(
            from: transcript,
            languageContext: languageContext,
            model: localModel
        )
        let text = try await generateFullSummary(
            from: plan.chunks,
            model: localModel,
            languageContext: languageContext
        )
        var debug = plan.debugPayload
        debug["summaryPath"] = "macos27-on-device"
        debug["summaryEngine"] = "Apple Intelligence (macOS 27)"
        return SummaryGenerationResult(
            text: text,
            chunkCount: plan.chunks.count,
            debugPayload: debug
        )
    }

    #if false // Deferred Private Cloud Compute experiment; no production entitlement or route.
    @available(macOS 27.0, *)
    private func generateBetaFullSummary(
        from transcript: String,
        localModel: SystemLanguageModel,
        languageContext: LanguageContext
    ) async throws -> SummaryGenerationResult {
        let cloudModel = PrivateCloudComputeLanguageModel()
        if cloudModel.isAvailable {
            do {
                let plan = try await privateCloudFullSummaryChunkPlan(
                    from: transcript,
                    cloudModel: cloudModel
                )
                let text = try await generatePrivateCloudFullSummary(
                    from: plan.chunks,
                    model: cloudModel,
                    localModel: localModel,
                    languageContext: languageContext
                )
                var debug = plan.debugPayload
                debug["betaModel"] = "Private Cloud Compute"
                debug["privateCloudAvailable"] = true
                return SummaryGenerationResult(
                    text: text,
                    chunkCount: plan.chunks.count,
                    debugPayload: debug
                )
            } catch {
                let message = readableErrorMessage(error)
                logger.log("Private Cloud summary failed; falling back to local token-aware summary. reason=\(message, privacy: .private(mask: .hash))")
                return try await generateLocalBetaFullSummary(
                    from: transcript,
                    localModel: localModel,
                    languageContext: languageContext,
                    privateCloudAvailable: true,
                    privateCloudFallbackReason: "Private Cloud Compute failed: \(message)"
                )
            }
        }

        let privateCloudReason = privateCloudAvailabilityDescription(cloudModel.availability)
        return try await generateLocalBetaFullSummary(
            from: transcript,
            localModel: localModel,
            languageContext: languageContext,
            privateCloudAvailable: false,
            privateCloudFallbackReason: privateCloudReason
        )
    }

    @available(macOS 27.0, *)
    private func generateLocalBetaFullSummary(
        from transcript: String,
        localModel: SystemLanguageModel,
        languageContext: LanguageContext,
        privateCloudAvailable: Bool,
        privateCloudFallbackReason: String
    ) async throws -> SummaryGenerationResult {
        let plan = try await tokenAwareFullSummaryChunkPlan(
            from: transcript,
            languageContext: languageContext,
            model: localModel
        )
        let text = try await generateFullSummary(
            from: plan.chunks,
            model: localModel,
            languageContext: languageContext
        )
        var debug = plan.debugPayload
        debug["betaModel"] = "Local Apple Intelligence"
        debug["privateCloudAvailable"] = privateCloudAvailable
        debug["privateCloudFallbackReason"] = privateCloudFallbackReason
        return SummaryGenerationResult(
            text: text,
            chunkCount: plan.chunks.count,
            debugPayload: debug
        )
    }

    @available(macOS 27.0, *)
    private func privateCloudFullSummaryChunkPlan(
        from transcript: String,
        cloudModel: PrivateCloudComputeLanguageModel
    ) async throws -> SummaryChunkPlan {
        let contextSize = try await cloudModel.contextSize
        let transcriptText = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !transcriptText.isEmpty else {
            return SummaryChunkPlan(
                chunks: [],
                strategy: "private-cloud",
                contextSize: contextSize,
                inputTokenBudget: nil,
                fallbackReason: nil
            )
        }

        let chunkLimit = max(
            maxFullSummaryChunkCharacters,
            min(90_000, max(12_000, (contextSize - 1_600) * 3))
        )
        let chunks = transcriptText.count <= chunkLimit
            ? [transcriptText]
            : chunkTranscript(transcriptText, maxCharacters: chunkLimit)

        return SummaryChunkPlan(
            chunks: chunks,
            strategy: chunks.count == 1 ? "private-cloud-single" : "private-cloud",
            contextSize: contextSize,
            inputTokenBudget: chunkLimit,
            fallbackReason: nil
        )
    }

    @available(macOS 27.0, *)
    private func generatePrivateCloudFullSummary(
        from chunks: [String],
        model: PrivateCloudComputeLanguageModel,
        localModel: SystemLanguageModel,
        languageContext: LanguageContext
    ) async throws -> String {
        guard !chunks.isEmpty else {
            throw AppleIntelligenceError.missingTranscript
        }

        let outputInstruction = outputLanguageInstruction(
            languageContext: languageContext,
            model: localModel,
            outputName: "summary"
        )

        if chunks.count == 1 {
            let text = try await respondPrivateCloud(
                model: model,
                instructions: fullSummaryInstructions(languageContext: languageContext),
                prompt: fullSummaryPrompt(for: chunks[0], outputInstruction: outputInstruction),
                maximumResponseTokens: 1_100
            )
            return cleanedSummaryText(text)
        }

        let summaries = try await summarizePrivateCloudFullSummaryChunks(
            chunks,
            model: model,
            outputInstruction: outputInstruction,
            languageContext: languageContext
        )
        return cleanedSummaryText(summaries.joined(separator: "\n\n"))
    }

    @available(macOS 27.0, *)
    private func summarizePrivateCloudFullSummaryChunks(
        _ chunks: [String],
        model: PrivateCloudComputeLanguageModel,
        outputInstruction: String,
        languageContext: LanguageContext
    ) async throws -> [String] {
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
                        let response: String
                        if chunkIndex == 0 {
                            response = try await respondPrivateCloud(
                                model: model,
                                instructions: fullSummaryInstructions(languageContext: languageContext),
                                prompt: fullSummaryPrompt(for: chunk, outputInstruction: outputInstruction),
                                maximumResponseTokens: 1_100
                            )
                        } else {
                            response = try await respondPrivateCloud(
                                model: model,
                                instructions: laterSummaryInstructions(languageContext: languageContext),
                                prompt: laterSummaryPrompt(for: chunk, outputInstruction: outputInstruction),
                                maximumResponseTokens: 420
                            )
                        }
                        return SummaryChunkResult(index: chunkIndex, text: response, error: nil)
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
            let firstError = results.compactMap(\.error).first ?? "Apple Intelligence 27 did not return usable section summaries."
            throw AppleIntelligenceError.generationFailed(firstError)
        }

        return successfulSummaries
    }
    #endif
    #endif

    private func fullSummaryInstructions(languageContext: LanguageContext) -> String {
        return "You summarize YouTube transcripts clearly and concisely."
    }

    private func fullSummaryPrompt(
        for chunk: String,
        languageContext: LanguageContext,
        model: SystemLanguageModel
    ) -> String {
        fullSummaryPrompt(
            for: chunk,
            outputInstruction: outputLanguageInstruction(
                languageContext: languageContext,
                model: model,
                outputName: "summary"
            )
        )
    }

    private func fullSummaryPrompt(
        for chunk: String,
        outputInstruction: String
    ) -> String {
        return """
        Summarize this video transcript clearly and concisely.
        \(outputInstruction)
        Start with a short overview paragraph.
        Then use bold section labels like **Main Topic** with useful bullet points.
        Use one nested bullet level only when it adds helpful detail.

        Transcript:
        \(chunk)
        """
    }

    private func laterSummaryInstructions(languageContext: LanguageContext) -> String {
        return "You summarize YouTube transcript parts."
    }

    private func laterSummaryPrompt(
        for chunk: String,
        languageContext: LanguageContext,
        model: SystemLanguageModel
    ) -> String {
        laterSummaryPrompt(
            for: chunk,
            outputInstruction: outputLanguageInstruction(
                languageContext: languageContext,
                model: model,
                outputName: "summary"
            )
        )
    }

    private func laterSummaryPrompt(
        for chunk: String,
        outputInstruction: String
    ) -> String {
        return """
        Write useful bullet points for this later transcript excerpt.
        \(outputInstruction)

        Transcript:
        \(chunk)
        """
    }

    private func outputLanguageInstruction(
        languageContext: LanguageContext,
        model: SystemLanguageModel,
        outputName: String
    ) -> String {
        guard !languageContext.displayName.isEmpty else {
            return ""
        }

        let outputLanguage = languageContext.isAppleSupported(by: model) ? languageContext.displayName : "English"
        return "The detected caption language is \(languageContext.displayName). Write the \(outputName) in \(outputLanguage)."
    }

    #if false // Retired local video-analysis pipeline; current UI requests only full summaries.
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
            Start with a short overview paragraph.
            Then use bold section labels like **Main Topic** with useful bullet points.
            Use one nested bullet level only when it adds helpful detail.

            Section summaries:
            \(joinedSummaries)
            """,
            maximumResponseTokens: 1_000
        )
    }
    #endif

    private func legacyFullSummaryChunkPlan(
        from transcript: String,
        languageContext: LanguageContext,
        model: SystemLanguageModel,
        fallbackReason: String?
    ) -> SummaryChunkPlan {
        let transcriptText = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !transcriptText.isEmpty else {
            return SummaryChunkPlan(
                chunks: [],
                strategy: "character",
                contextSize: nil,
                inputTokenBudget: nil,
                fallbackReason: fallbackReason
            )
        }

        let directLimit = summaryDirectCharacterLimit(languageContext: languageContext, model: model)
        let chunkLimit = summaryChunkCharacterLimit(languageContext: languageContext, model: model)
        let chunks: [String]

        if transcriptText.count <= directLimit {
            chunks = [transcriptText]
        } else {
            chunks = chunkTranscript(transcriptText, maxCharacters: chunkLimit)
        }

        return SummaryChunkPlan(
            chunks: chunks,
            strategy: "character",
            contextSize: nil,
            inputTokenBudget: nil,
            fallbackReason: fallbackReason
        )
    }

    #if compiler(>=6.4)
    @available(macOS 27.0, *)
    private func tokenAwareFullSummaryChunkPlan(
        from transcript: String,
        languageContext: LanguageContext,
        model: SystemLanguageModel
    ) async throws -> SummaryChunkPlan {
        let transcriptText = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !transcriptText.isEmpty else {
            return SummaryChunkPlan(
                chunks: [],
                strategy: "token-aware",
                contextSize: model.contextSize,
                inputTokenBudget: nil,
                fallbackReason: nil
            )
        }

        let contextSize = model.contextSize
        let maximumResponseTokens = 1_100
        let inputTokenBudget = summaryInputTokenBudget(
            contextSize: contextSize,
            maximumResponseTokens: maximumResponseTokens
        )
        let fullRequestTokens = try await requestTokenCount(
            model: model,
            instructions: fullSummaryInstructions(languageContext: languageContext),
            prompt: fullSummaryPrompt(for: transcriptText, languageContext: languageContext, model: model)
        )

        if fullRequestTokens <= inputTokenBudget {
            return SummaryChunkPlan(
                chunks: [transcriptText],
                strategy: "token-aware-single",
                contextSize: contextSize,
                inputTokenBudget: inputTokenBudget,
                fallbackReason: nil
            )
        }

        let chunks = try await tokenAwareTranscriptChunks(
            transcriptText,
            inputTokenBudget: inputTokenBudget,
            languageContext: languageContext,
            model: model
        )

        return SummaryChunkPlan(
            chunks: chunks,
            strategy: "token-aware",
            contextSize: contextSize,
            inputTokenBudget: inputTokenBudget,
            fallbackReason: nil
        )
    }

    @available(macOS 27.0, *)
    private func tokenAwareTranscriptChunks(
        _ transcript: String,
        inputTokenBudget: Int,
        languageContext: LanguageContext,
        model: SystemLanguageModel
    ) async throws -> [String] {
        let lines = transcript
            .split(separator: "\n", omittingEmptySubsequences: true)
            .map(String.init)
        guard !lines.isEmpty else {
            return []
        }

        var chunks: [String] = []
        var startIndex = 0

        while startIndex < lines.count {
            var low = startIndex + 1
            var high = lines.count
            var bestEndIndex = startIndex + 1

            while low <= high {
                let mid = (low + high) / 2
                let candidate = lines[startIndex..<mid].joined(separator: "\n")
                let tokenCount = try await requestTokenCount(
                    model: model,
                    instructions: fullSummaryInstructions(languageContext: languageContext),
                    prompt: fullSummaryPrompt(for: candidate, languageContext: languageContext, model: model)
                )

                if tokenCount <= inputTokenBudget {
                    bestEndIndex = mid
                    low = mid + 1
                } else {
                    high = mid - 1
                }
            }

            chunks.append(lines[startIndex..<bestEndIndex].joined(separator: "\n"))
            startIndex = bestEndIndex
        }

        return chunks
    }

    @available(macOS 27.0, *)
    private func requestTokenCount(
        model: SystemLanguageModel,
        instructions: String,
        prompt: String
    ) async throws -> Int {
        let instructionTokens = try await model.tokenCount(for: Instructions(instructions))
        let promptTokens = try await model.tokenCount(for: prompt)
        return instructionTokens + promptTokens
    }

    #if false // Used only by the deferred Private Cloud Compute experiment.
    @available(macOS 27.0, *)
    private func privateCloudRequestTokenCount(
        model: SystemLanguageModel,
        instructions: String,
        prompt: String
    ) async throws -> Int {
        let instructionTokens = try await model.tokenCount(for: Instructions(instructions))
        let promptTokens = try await model.tokenCount(for: prompt)
        return instructionTokens + promptTokens
    }
    #endif

    @available(macOS 27.0, *)
    private func summaryInputTokenBudget(contextSize: Int, maximumResponseTokens: Int) -> Int {
        let safetyMargin = min(max(contextSize / 8, 256), 1_024)
        return max(512, contextSize - maximumResponseTokens - safetyMargin)
    }
    #endif

    private func summaryDirectCharacterLimit(languageContext: LanguageContext, model: SystemLanguageModel) -> Int {
        languageContext.isAppleSupported(by: model)
            ? maxDirectSummaryCharacters
            : maxUnsupportedLanguageDirectSummaryCharacters
    }

    private func summaryChunkCharacterLimit(languageContext: LanguageContext, model: SystemLanguageModel) -> Int {
        languageContext.isAppleSupported(by: model)
            ? maxFullSummaryChunkCharacters
            : maxUnsupportedLanguageFullSummaryChunkCharacters
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
        #if compiler(>=6.4)
        if #available(macOS 27.0, *) {
            session.prewarm(promptPrefix: Prompt(prewarmPrefix(from: prompt)))
        }
        #endif

        let options = GenerationOptions(
            samplingMode: .greedy,
            temperature: nil,
            maximumResponseTokens: maximumResponseTokens
        )
        let response = try await session.respond(to: prompt, options: options)
        #if compiler(>=6.4)
        if #available(macOS 27.0, *) {
            logTokenUsage(response.usage)
        }
        #endif

        let text = response.content.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !text.isEmpty else {
            throw AppleIntelligenceError.generationFailed("Apple Intelligence returned an empty response.")
        }

        return text
    }

    #if compiler(>=6.4)
    #if false // Used only by the deferred Private Cloud Compute experiment.
    @available(macOS 27.0, *)
    private func respondPrivateCloud(
        model: PrivateCloudComputeLanguageModel,
        instructions: String,
        prompt: String,
        maximumResponseTokens: Int,
        reasoningLevel: ContextOptions.ReasoningLevel? = nil
    ) async throws -> String {
        let session = LanguageModelSession(
            model: model,
            tools: [],
            instructions: instructions
        )

        let options = GenerationOptions(
            samplingMode: .greedy,
            temperature: nil,
            maximumResponseTokens: maximumResponseTokens
        )
        let response: LanguageModelSession.Response<String>
        if let reasoningLevel {
            let contextOptions = ContextOptions(reasoningLevel: reasoningLevel)
            response = try await session.respond(to: prompt, options: options, contextOptions: contextOptions)
        } else {
            response = try await session.respond(to: prompt, options: options)
        }
        logTokenUsage(response.usage)

        let text = response.content.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !text.isEmpty else {
            throw AppleIntelligenceError.generationFailed("Apple Intelligence 27 returned an empty response.")
        }

        return text
    }
    #endif
    #endif

    private func prewarmPrefix(from prompt: String) -> String {
        if let transcriptRange = prompt.range(of: "Transcript:") {
            return String(prompt[..<transcriptRange.upperBound])
        }

        return String(prompt.prefix(500))
    }

    #if compiler(>=6.4)
    @available(macOS 27.0, *)
    private func logTokenUsage(_ usage: LanguageModelSession.Usage) {
        logger.log(
            """
            Local generation token usage. \
            input=\(usage.input.totalTokenCount, privacy: .public) \
            cached=\(usage.input.cachedTokenCount, privacy: .public) \
            output=\(usage.output.totalTokenCount, privacy: .public) \
            reasoning=\(usage.output.reasoningTokenCount, privacy: .public) \
            total=\(usage.totalTokenCount, privacy: .public)
            """
        )
    }

    #if false // Deferred Private Cloud Compute diagnostics.
    @available(macOS 27.0, *)
    private func privateCloudAvailabilityDescription(_ availability: PrivateCloudComputeLanguageModel.Availability) -> String {
        switch availability {
        case .available:
            return "Private Cloud Compute is available."
        case .unavailable(let reason):
            return "Private Cloud Compute is not available: \(String(describing: reason))."
        @unknown default:
            return "Private Cloud Compute is not available."
        }
    }

    @available(macOS 27.0, *)
    private func privateCloudStatusPayload() -> [String: Any] {
        let model = PrivateCloudComputeLanguageModel()
        var payload: [String: Any] = [
            "isConfigured": model.isAvailable,
            "availability": privateCloudAvailabilityDescription(model.availability),
        ]

        payload.merge(privateCloudQuotaDebugPayload(model.quotaUsage)) { _, new in new }
        return payload
    }

    @available(macOS 27.0, *)
    private func privateCloudQuotaDebugPayload(_ quotaUsage: PrivateCloudComputeLanguageModel.QuotaUsage) -> [String: Any] {
        var payload: [String: Any] = [
            "quotaLimitReached": quotaUsage.isLimitReached,
            "quotaStatus": privateCloudQuotaStatusDescription(quotaUsage.status),
        ]

        if let resetDate = quotaUsage.resetDate {
            payload["quotaResetDate"] = ISO8601DateFormatter().string(from: resetDate)
        }

        return payload
    }

    @available(macOS 27.0, *)
    private func privateCloudQuotaStatusDescription(_ status: PrivateCloudComputeLanguageModel.QuotaUsage.Status) -> String {
        switch status {
        case .belowLimit(let info):
            return info.isApproachingLimit ? "approaching limit" : "below limit"
        case .limitReached:
            return "limit reached"
        @unknown default:
            return "unknown"
        }
    }
    #endif
    #endif

    private func readableErrorMessage(_ error: Error) -> String {
        #if compiler(>=6.4)
        if #available(macOS 27.0, *) {
            if let languageModelError = error as? LanguageModelError {
                return readableErrorMessage(
                    primary: languageModelError.debugDescription,
                    error: error
                )
            }

        }
        #endif

        return readableErrorMessage(
            primary: error.localizedDescription.isEmpty ? String(describing: error) : error.localizedDescription,
            error: error
        )
    }

    private func readableErrorMessage(primary: String, error: Error) -> String {
        let trimmedPrimary = primary.trimmingCharacters(in: .whitespacesAndNewlines)
        let baseMessage = trimmedPrimary.isEmpty ? String(describing: error) : trimmedPrimary
        let underlying = underlyingErrorSummary(from: error)

        guard let underlying, !baseMessage.contains(underlying) else {
            return baseMessage
        }

        return "\(baseMessage) Underlying error: \(underlying)."
    }

    private func underlyingErrorSummary(from error: Error) -> String? {
        let nsError = error as NSError
        var summaries: [String] = []
        collectUnderlyingErrorSummaries(from: nsError, into: &summaries)
        return summaries.first
    }

    private func collectUnderlyingErrorSummaries(from error: NSError, into summaries: inout [String]) {
        if isUsefulUnderlyingErrorDomain(error.domain) {
            summaries.append("\(error.domain) code \(error.code)")
        }

        if let underlying = error.userInfo[NSUnderlyingErrorKey] as? NSError {
            collectUnderlyingErrorSummaries(from: underlying, into: &summaries)
        }

        if let underlyingErrors = error.userInfo[NSMultipleUnderlyingErrorsKey] as? [NSError] {
            for underlying in underlyingErrors {
                collectUnderlyingErrorSummaries(from: underlying, into: &summaries)
            }
        }
    }

    private func isUsefulUnderlyingErrorDomain(_ domain: String) -> Bool {
        domain != NSCocoaErrorDomain
            && domain != "FoundationModels.LanguageModelError"
            && !domain.hasSuffix(".AppleIntelligenceError")
    }

    private func cleanedSummaryText(_ text: String) -> String {
        var lines: [String] = []
        var seenLines = Set<String>()

        for rawLine in text.components(separatedBy: .newlines) {
            let line = rawLine
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)

            if line.isEmpty {
                if !lines.isEmpty, lines.last != "" {
                    lines.append("")
                }
                continue
            }

            if line.range(of: #"^(?:part|section)\s+\d+(?:\s+of\s+\d+)?[:.]?$"#, options: [.regularExpression, .caseInsensitive]) != nil {
                continue
            }

            let normalized = normalizedSummaryLine(line)
            guard !normalized.isEmpty else {
                continue
            }

            if seenLines.insert(normalized).inserted {
                lines.append(line)
            }
        }

        while lines.last == "" {
            lines.removeLast()
        }

        return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func normalizedSummaryLine(_ line: String) -> String {
        line
            .replacingOccurrences(of: #"^[-*]\s+"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(.punctuationCharacters))
            .lowercased()
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
