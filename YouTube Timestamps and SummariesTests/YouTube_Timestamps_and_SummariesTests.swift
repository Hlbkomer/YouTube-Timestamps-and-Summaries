//
//  YouTube_Timestamps_and_SummariesTests.swift
//  YouTube Timestamps and SummariesTests
//
//  Created by Matus Vojtek on 21/04/2026.
//

import Testing
@testable import YouTube_Timestamps_and_Summaries

struct YouTube_Timestamps_and_SummariesTests {

    @Test func modelResolutionFallsBackToDefault() {
        #expect(GeminiModelOption.resolved(from: nil) == .defaultOption)
        #expect(GeminiModelOption.resolved(from: "unknown-model") == .defaultOption)
        #expect(GeminiModelOption.resolved(from: GeminiModelOption.gemini3ProPreview.rawValue) == .gemini3ProPreview)
    }

    @Test func oauthConfigRequiresTrimmedValues() {
        let incomplete = GeminiOAuthConfig(
            clientID: " client-id ",
            clientSecret: "   ",
            projectID: " project-id "
        )
        let complete = GeminiOAuthConfig(
            clientID: " client-id ",
            clientSecret: " client-secret ",
            projectID: " project-id "
        )

        #expect(incomplete.isComplete == false)
        #expect(complete.isComplete == true)
        #expect(complete.trimmedClientID == "client-id")
        #expect(complete.trimmedClientSecret == "client-secret")
        #expect(complete.trimmedProjectID == "project-id")
    }

    @Test func defaultPromptsMatchCurrentProductDefaults() {
        let prompts = GeminiPromptConfig.default

        #expect(prompts.timestamps == "Please create chronological timestamps for this video. No bullet points, one timestamp per line in the format MM:SS Title.")
        #expect(prompts.summary == "Please summarize this video.")
    }
}
