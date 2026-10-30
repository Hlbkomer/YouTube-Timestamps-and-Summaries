import Foundation

/// One transcript-only call per result, using the same production Summary
/// prompt and timestamp validation as the existing providers.
final class GeminiGenerationService {
    private let client: GeminiAPIClient

    init(client: GeminiAPIClient = GeminiAPIClient()) {
        self.client = client
    }

    func generateTimestamps(
        transcript: String, model: String,
        languageCode: String = "", languageLabel: String = ""
    ) async -> [String: Any] {
        let language = languageLabel.isEmpty ? languageCode : languageLabel
        let languageInstruction = language.isEmpty ? "" : "The detected caption language is \(language). Write the timestamp titles in \(language)."
        return await generate(
            kind: "geminiTimestamps", transcript: transcript, model: model,
            languageCode: languageCode, languageLabel: languageLabel,
            instructions: "You create accurate YouTube chapter timestamps from transcripts.",
            prompt: """
            Create chronological YouTube chapter timestamps from this transcript.
            \(languageInstruction)

            Rules:
            - Use only the bracketed transcript timestamps as the source of truth.
            - Never invent, estimate, shift, or extrapolate times.
            - Output only timestamp-title lines.
            - Use MM:SS Title, or H:MM:SS Title after one hour.
            - Copy each timestamp exactly from a source cue, removing its brackets.
            - Do not add bullets, numbering, bold, code fences, or commentary.
            - Create useful chapter-level topic changes across the whole video.
            - Use concise natural chapter titles, not transcript quotes.
            - Prefer the earliest transcript timestamp where a topic begins.

            Transcript:
            \(transcript.trimmingCharacters(in: .whitespacesAndNewlines))
            """
        )
    }

    func generateSummary(
        transcript: String, model: String,
        languageCode: String = "", languageLabel: String = "",
        videoContext: ProviderVideoContext? = nil
    ) async -> [String: Any] {
        let request = ProviderSummaryPromptBuilder.makeRequest(
            version: .production, transcript: transcript.trimmingCharacters(in: .whitespacesAndNewlines),
            languageCode: languageCode, languageLabel: languageLabel, videoContext: videoContext ?? ProviderVideoContext()
        )
        return await generate(
            kind: "geminiSummary", transcript: transcript, model: model,
            languageCode: languageCode, languageLabel: languageLabel,
            instructions: request.instructions, prompt: request.prompt
        )
    }

    private func generate(
        kind: String, transcript: String, model: String,
        languageCode: String, languageLabel: String, instructions: String, prompt: String
    ) async -> [String: Any] {
        let started = Date()
        let requestedModel = model.trimmingCharacters(in: .whitespacesAndNewlines)
        let safeModel = requestedModel.isEmpty ? GenerationSettings.defaultGeminiModelID : requestedModel
        var debug: [String: Any] = [
            "layer": "native", "kind": kind, "provider": GenerationSettings.geminiProviderID,
            "model": safeModel, "providerModel": safeModel, "inputMode": "transcript",
            "languageCode": languageCode, "languageLabel": languageLabel,
            "reasoningEffort": GenerationSettings.geminiThinkingLevel.lowercased(),
        ]
        do {
            guard !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw GeminiAPIError.requestFailed("This video does not have an available transcript.")
            }
            let response = try await client.generate(instructions: instructions, prompt: prompt, model: safeModel)
            let returnedModel = response.modelVersion?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let resolvedModel = returnedModel.isEmpty ? safeModel : returnedModel
            let engineLabel = GenerationSettings.modelLabel(for: resolvedModel, providerID: GenerationSettings.geminiProviderID)
            debug["providerModel"] = resolvedModel
            debug["engineLabel"] = engineLabel
            debug["responseTextLength"] = response.text.count
            for (key, value) in response.metrics { debug[key] = value }
            let text = kind == "geminiTimestamps"
                ? ProviderTimestampText.cleanedGemini(response.text, transcript: transcript)
                : response.text
            if kind == "geminiTimestamps" {
                debug["acceptedChapterCount"] = text.split(whereSeparator: \.isNewline).count
            }
            guard !text.isEmpty else {
                throw GeminiAPIError.requestFailed("Gemini did not return usable \(kind == "geminiTimestamps" ? "timestamps" : "summary text").")
            }
            debug["durationMs"] = Int(Date().timeIntervalSince(started) * 1_000)
            debug["textLength"] = text.count
            return ["ok": true, "text": text, "engineLabel": engineLabel, "debug": debug]
        } catch {
            debug["durationMs"] = Int(Date().timeIntervalSince(started) * 1_000)
            // Transport errors are mapped to fixed messages before reaching here.
            let message = error is GeminiAPIError
                ? error.localizedDescription
                : "The Gemini request could not be completed. Check your connection and API key."
            debug["detail"] = message
            return ["ok": false, "error": message, "debug": debug]
        }
    }
}
