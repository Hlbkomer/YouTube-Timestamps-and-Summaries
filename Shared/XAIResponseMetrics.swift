//
//  XAIResponseMetrics.swift
//  Timestamps & Summaries for YT (Shared)
//

import Foundation

/// Provider-reported diagnostics from a completed xAI Responses API request.
/// Keep this parser independent from the streaming transport so it can be
/// covered with stable response fixtures.
nonisolated struct XAIResponseMetrics: Equatable {
    let inputTokens: Int?
    let outputTokens: Int?
    let totalTokens: Int?
    let cachedInputTokens: Int?
    let reasoningTokens: Int?
    let serviceTier: String?

    init(
        inputTokens: Int? = nil,
        outputTokens: Int? = nil,
        totalTokens: Int? = nil,
        cachedInputTokens: Int? = nil,
        reasoningTokens: Int? = nil,
        serviceTier: String? = nil
    ) {
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.totalTokens = totalTokens
        self.cachedInputTokens = cachedInputTokens
        self.reasoningTokens = reasoningTokens
        self.serviceTier = serviceTier
    }

    static func parse(_ response: [String: Any]) -> XAIResponseMetrics {
        let usage = response["usage"] as? [String: Any]
        let inputDetails = usage?["input_tokens_details"] as? [String: Any]
        let outputDetails = usage?["output_tokens_details"] as? [String: Any]

        return XAIResponseMetrics(
            inputTokens: integer(usage?["input_tokens"]),
            outputTokens: integer(usage?["output_tokens"]),
            totalTokens: integer(usage?["total_tokens"]),
            cachedInputTokens: integer(inputDetails?["cached_tokens"]),
            reasoningTokens: integer(outputDetails?["reasoning_tokens"]),
            serviceTier: nonemptyString(response["service_tier"])
        )
    }

    var debugPayload: [String: Any] {
        var payload: [String: Any] = [:]
        if let inputTokens { payload["inputTokens"] = inputTokens }
        if let outputTokens { payload["outputTokens"] = outputTokens }
        if let totalTokens { payload["totalTokens"] = totalTokens }
        if let cachedInputTokens { payload["cachedInputTokens"] = cachedInputTokens }
        if let reasoningTokens { payload["reasoningTokens"] = reasoningTokens }
        if let serviceTier { payload["serviceTier"] = serviceTier }
        return payload
    }

    private static func integer(_ value: Any?) -> Int? {
        if let integer = value as? Int {
            return integer
        }
        if let number = value as? NSNumber {
            return number.intValue
        }
        if let string = value as? String {
            return Int(string)
        }
        return nil
    }

    private static func nonemptyString(_ value: Any?) -> String? {
        guard let string = value as? String else { return nil }
        let candidate = string.trimmingCharacters(in: .whitespacesAndNewlines)
        return candidate.isEmpty ? nil : candidate
    }
}
