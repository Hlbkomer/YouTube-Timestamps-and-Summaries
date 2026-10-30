import Foundation

enum GeminiAPIError: LocalizedError {
    case missingKey
    case invalidKey
    case unsupportedModel
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .missingKey: return "Gemini is not connected. Open the companion app and add your API key."
        case .invalidKey: return "Google rejected this API key. Create a current Gemini API key in Google AI Studio and try again."
        case .unsupportedModel: return "The selected Gemini model is not supported in this app."
        case .requestFailed(let message): return message
        }
    }
}

/// Never forward a user's API key to a redirect destination.
private nonisolated final class GeminiRedirectDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

/// Shared native transport. Keys never appear in request URLs, status payloads,
/// WebExtension messages, or provider error text returned to the page.
final class GeminiAPIClient {
    private let session: URLSession
    private let ownsSession: Bool
    private let credentials: SharedCredentialStore
    private let keyAccount = "gemini.apiKey"

    init(
        session: URLSession? = nil,
        credentials: SharedCredentialStore = SharedCredentialStore(service: "Matuko.YouTube-Timestamps-and-Summaries.gemini")
    ) {
        self.credentials = credentials
        self.ownsSession = session == nil
        self.session = session ?? URLSession(
            configuration: .ephemeral,
            delegate: GeminiRedirectDelegate(),
            delegateQueue: nil
        )
    }

    deinit {
        if ownsSession { session.invalidateAndCancel() }
    }

    func statusPayload() -> [String: Any] {
        do {
            return ["connected": try savedKey() != nil, "error": ""]
        } catch {
            return ["connected": false, "error": "The Gemini API key could not be read from Keychain."]
        }
    }

    func savedKey() throws -> String? {
        try credentials.string(for: keyAccount)
    }

    func connect(apiKey: String) async throws {
        guard try savedKey() == nil else {
            throw GeminiAPIError.requestFailed("Remove the saved Gemini API key before adding a new one.")
        }
        let key = try Self.normalizedKey(apiKey)
        // Check authentication and model access without a billed generation.
        let request = try Self.modelRequest(apiKey: key)
        let json = try await send(request)
        // Google may return the concrete model name behind the latest alias.
        guard let name = json["name"] as? String, name.hasPrefix("models/gemini-"),
              let methods = json["supportedGenerationMethods"] as? [String],
              methods.contains("generateContent") else {
            throw GeminiAPIError.requestFailed("Google did not confirm access to Gemini Flash (latest) text generation.")
        }
        try credentials.set(key, for: keyAccount)
    }

    func disconnect() throws {
        try credentials.remove(keyAccount)
    }

    func generate(instructions: String, prompt: String, model: String) async throws -> GeminiTextResponse {
        guard let key = try savedKey() else { throw GeminiAPIError.missingKey }
        let request = try Self.generationRequest(
            apiKey: key, model: model, instructions: instructions, prompt: prompt
        )
        return try Self.parseResponse(await send(request))
    }

    static func normalizedKey(_ apiKey: String) throws -> String {
        let key = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { throw GeminiAPIError.missingKey }
        guard key.utf8.count <= 512,
              key.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_").contains($0) }) else {
            throw GeminiAPIError.invalidKey
        }
        return key
    }

    static func modelRequest(apiKey: String) throws -> URLRequest {
        try request(apiKey: apiKey, model: GenerationSettings.defaultGeminiModelID, operation: "")
    }

    static func generationRequest(
        apiKey: String, model: String, instructions: String, prompt: String
    ) throws -> URLRequest {
        var request = try request(apiKey: apiKey, model: model, operation: ":generateContent")
        request.httpMethod = "POST"
        request.timeoutInterval = 10 * 60
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "systemInstruction": ["parts": [["text": instructions]]],
            "contents": [["role": "user", "parts": [["text": prompt]]]],
            "generationConfig": [
                // Argon needs room for thinking as well as reader-facing text.
                "maxOutputTokens": model == GenerationSettings.geminiArgonModelID ? 32_768 : 16_384,
                "thinkingConfig": [
                    "thinkingLevel": GenerationSettings.geminiThinkingLevel,
                    "includeThoughts": false,
                ],
            ],
        ])
        return request
    }

    private static func request(apiKey: String, model: String, operation: String) throws -> URLRequest {
        guard GenerationSettings.supportedModelIDs(for: GenerationSettings.geminiProviderID).contains(model) else {
            throw GeminiAPIError.unsupportedModel
        }
        let key = try normalizedKey(apiKey)
        let url = URL(string: "https://generativelanguage.googleapis.com/v1beta/models/\(model)\(operation)")!
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        request.setValue(key, forHTTPHeaderField: "x-goog-api-key")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(GenerationSettings.providerUserAgent, forHTTPHeaderField: "User-Agent")
        return request
    }

    private func send(_ request: URLRequest) async throws -> [String: Any] {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            // Network errors can contain request details. Return fixed text.
            if (error as? URLError)?.code == .timedOut {
                throw GeminiAPIError.requestFailed("Gemini timed out. Please try again.")
            }
            throw GeminiAPIError.requestFailed("Could not reach Gemini. Check your connection and try again.")
        }
        guard let http = response as? HTTPURLResponse else {
            throw GeminiAPIError.requestFailed("Google returned an invalid network response.")
        }
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard http.statusCode == 200 else {
            throw Self.responseError(statusCode: http.statusCode, json: json)
        }
        guard !json.isEmpty else {
            throw GeminiAPIError.requestFailed("Google returned an invalid response.")
        }
        return json
    }

    static func responseError(statusCode: Int, json: [String: Any]) -> GeminiAPIError {
        let error = json["error"] as? [String: Any] ?? [:]
        let reasons = (error["details"] as? [[String: Any]] ?? []).compactMap { $0["reason"] as? String }
        if statusCode == 401 || reasons.contains("API_KEY_INVALID") || reasons.contains("API_KEY_EXPIRED") {
            return .invalidKey
        }
        switch statusCode {
        case 400:
            return .requestFailed("Google rejected the Gemini request. Check the API key and whether Gemini API is available for your account and region.")
        case 402:
            return .requestFailed("Gemini API billing needs attention. Check your credits and billing status in Google AI Studio.")
        case 403:
            return .requestFailed("This API key does not have permission to use Gemini. Check its API restrictions, project, and access in Google AI Studio.")
        case 404:
            return .requestFailed("The selected Gemini model is not available for this API key or project.")
        case 429:
            return .requestFailed("Gemini's quota or rate limit was reached. Check your quota and billing in Google AI Studio, or try again later.")
        case 500...599:
            return .requestFailed("Gemini is temporarily unavailable. Please try again later.")
        default:
            return .requestFailed("Gemini request failed (HTTP \(statusCode)).")
        }
    }

    static func parseResponse(_ json: [String: Any]) throws -> GeminiTextResponse {
        if let feedback = json["promptFeedback"] as? [String: Any],
           let reason = feedback["blockReason"] as? String,
           reason != "BLOCK_REASON_UNSPECIFIED" {
            throw GeminiAPIError.requestFailed("Google blocked this transcript under its content policy.")
        }
        guard let candidates = json["candidates"] as? [[String: Any]],
              let candidate = candidates.first else {
            throw GeminiAPIError.requestFailed("Gemini returned no usable response.")
        }
        guard let finishReason = candidate["finishReason"] as? String, finishReason == "STOP" else {
            if candidate["finishReason"] as? String == "MAX_TOKENS" {
                throw GeminiAPIError.requestFailed("Gemini reached its output limit before completing. No partial result was saved.")
            }
            throw GeminiAPIError.requestFailed("Gemini did not complete the response, or blocked it under its content policy.")
        }
        let content = candidate["content"] as? [String: Any] ?? [:]
        let parts = content["parts"] as? [[String: Any]] ?? []
        // Thought parts are never reader-facing output, even if returned despite
        // includeThoughts=false. Never accept tool-only or empty responses.
        let text = parts.filter { ($0["thought"] as? Bool) != true }
            .compactMap { $0["text"] as? String }.joined()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            throw GeminiAPIError.requestFailed("Gemini returned an empty response.")
        }
        let usage = json["usageMetadata"] as? [String: Any] ?? [:]
        var metrics: [String: Int] = [:]
        for (source, destination) in [
            "promptTokenCount": "inputTokens", "cachedContentTokenCount": "cachedInputTokens",
            "thoughtsTokenCount": "reasoningTokens", "totalTokenCount": "totalTokens",
        ] {
            if let value = usage[source] as? Int, value >= 0 { metrics[destination] = value }
        }
        if let output = usage["candidatesTokenCount"] as? Int, output >= 0 {
            metrics["outputTokens"] = output + (metrics["reasoningTokens"] ?? 0)
        }
        return GeminiTextResponse(text: text, metrics: metrics, modelVersion: json["modelVersion"] as? String)
    }
}

struct GeminiTextResponse {
    let text: String
    let metrics: [String: Int]
    let modelVersion: String?
}
