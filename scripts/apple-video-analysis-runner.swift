import Foundation

private struct ManifestVideo: Decodable {
    let id: String
    let folderName: String
    let title: String
    let channel: String
    let durationSeconds: Int
    let duration: String
    let cueCount: Int
    let transcriptCharacters: Int
    let transcriptPath: String
    let sourceURL: String
}

@main
struct AppleVideoAnalysisRunner {
    private static let allApproaches = [
        "separate",
        "leanChaptersOnly",
        "chaptersOnly",
        "sharedChaptersSummary",
    ]

    static func main() async throws {
        guard (3...5).contains(CommandLine.arguments.count) else {
            writeProgress(
                "usage: apple-video-analysis-runner MANIFEST_PATH OUTPUT_DIRECTORY [VIDEO_IDS] [APPROACHES]"
            )
            Foundation.exit(2)
        }

        let manifestURL = URL(
            fileURLWithPath: CommandLine.arguments[1]
        ).standardizedFileURL
        let manifestDirectoryURL = manifestURL.deletingLastPathComponent()
        let outputRootURL = URL(
            fileURLWithPath: CommandLine.arguments[2],
            isDirectory: true
        ).standardizedFileURL
        var videos = try JSONDecoder().decode(
            [ManifestVideo].self,
            from: Data(contentsOf: manifestURL)
        )
        if CommandLine.arguments.count >= 4, CommandLine.arguments[3] != "all" {
            let requestedIDs = Set(
                CommandLine.arguments[3].split(separator: ",").map(String.init)
            )
            videos = videos.filter { requestedIDs.contains($0.id) }
        }

        let approaches: [String]
        if CommandLine.arguments.count == 5 {
            approaches = CommandLine.arguments[4]
                .split(separator: ",")
                .map(String.init)
            guard approaches.allSatisfy(allApproaches.contains) else {
                writeProgress("unknown approach: \(CommandLine.arguments[4])")
                Foundation.exit(2)
            }
        } else {
            approaches = allApproaches
        }
        guard !videos.isEmpty, !approaches.isEmpty else {
            writeProgress("no matching videos or approaches")
            Foundation.exit(2)
        }

        try FileManager.default.createDirectory(
            at: outputRootURL,
            withIntermediateDirectories: true
        )

        for (videoIndex, video) in videos.enumerated() {
            let transcriptURL = URL(
                fileURLWithPath: video.transcriptPath,
                relativeTo: manifestDirectoryURL
            ).standardizedFileURL
            let transcript = try String(
                contentsOf: transcriptURL,
                encoding: .utf8
            )
            let videoOutputURL = outputRootURL.appendingPathComponent(
                video.folderName,
                isDirectory: true
            )
            try FileManager.default.createDirectory(
                at: videoOutputURL,
                withIntermediateDirectories: true
            )
            writeProgress(
                "VIDEO_START\t\(videoIndex + 1)/\(videos.count)\t\(video.id)\t\(video.duration)\t\(video.title)"
            )

            var chapterRun: TimedResponse?
            if approaches.contains("leanChaptersOnly") {
                let leanChapterRun = await runVideoMap(
                    mode: "leanChaptersOnly",
                    transcript: transcript,
                    video: video
                )
                try writePayload(
                    video: video,
                    approach: "leanChaptersOnly",
                    elapsedSeconds: leanChapterRun.elapsedSeconds,
                    response: leanChapterRun.response,
                    to: videoOutputURL.appendingPathComponent(
                        "leanChaptersOnly.json"
                    )
                )
                report(
                    videoID: video.id,
                    approach: "leanChaptersOnly",
                    run: leanChapterRun
                )
            }

            if approaches.contains("chaptersOnly") || approaches.contains("separate") {
                let savedChapterURL = videoOutputURL.appendingPathComponent(
                    "chaptersOnly.json"
                )
                if
                    approaches.contains("separate"),
                    !approaches.contains("chaptersOnly"),
                    let savedRun = loadTimedResponse(from: savedChapterURL)
                {
                    chapterRun = savedRun
                    writeProgress(
                        "REUSE\t\(video.id)\tchaptersOnly\t\(String(format: "%.3fs", savedRun.elapsedSeconds))"
                    )
                } else {
                    chapterRun = await runVideoMap(
                        mode: "chaptersOnly",
                        transcript: transcript,
                        video: video
                    )
                }
                if approaches.contains("chaptersOnly"), let chapterRun {
                    try writePayload(
                        video: video,
                        approach: "chaptersOnly",
                        elapsedSeconds: chapterRun.elapsedSeconds,
                        response: chapterRun.response,
                        to: videoOutputURL.appendingPathComponent(
                            "chaptersOnly.json"
                        )
                    )
                    report(
                        videoID: video.id,
                        approach: "chaptersOnly",
                        run: chapterRun
                    )
                }
            }

            if approaches.contains("separate"), let chapterRun {
                let summaryRun = await runCurrentSummary(
                    transcript: transcript
                )
                let combinedResponse: [String: Any] = [
                    "ok": responseSucceeded(chapterRun.response)
                        && responseSucceeded(summaryRun.response),
                    "chapters": chapterRun.response,
                    "summary": summaryRun.response,
                    "debug": [
                        "rawTranscriptPasses": 2,
                        "chapterElapsedSeconds": chapterRun.elapsedSeconds,
                        "summaryElapsedSeconds": summaryRun.elapsedSeconds,
                        "chapterModelCalls": modelCalls(chapterRun.response),
                        "summaryModelCalls": modelCalls(summaryRun.response),
                        "modelCalls": modelCalls(chapterRun.response)
                            + modelCalls(summaryRun.response),
                    ],
                ]
                let combinedRun = TimedResponse(
                    elapsedSeconds: chapterRun.elapsedSeconds
                        + summaryRun.elapsedSeconds,
                    response: combinedResponse
                )
                try writePayload(
                    video: video,
                    approach: "separate",
                    elapsedSeconds: combinedRun.elapsedSeconds,
                    response: combinedResponse,
                    to: videoOutputURL.appendingPathComponent("separate.json")
                )
                report(
                    videoID: video.id,
                    approach: "separate",
                    run: combinedRun
                )
            }

            if approaches.contains("sharedChaptersSummary") {
                let sharedRun = await runVideoMap(
                    mode: "sharedChaptersSummary",
                    transcript: transcript,
                    video: video
                )
                try writePayload(
                    video: video,
                    approach: "sharedChaptersSummary",
                    elapsedSeconds: sharedRun.elapsedSeconds,
                    response: sharedRun.response,
                    to: videoOutputURL.appendingPathComponent(
                        "sharedChaptersSummary.json"
                    )
                )
                report(
                    videoID: video.id,
                    approach: "sharedChaptersSummary",
                    run: sharedRun
                )
            }

            writeProgress(
                "VIDEO_END\t\(videoIndex + 1)/\(videos.count)\t\(video.id)"
            )
        }
        writeProgress("BATCH_END")
    }

    private struct TimedResponse {
        let elapsedSeconds: Double
        let response: [String: Any]
    }

    private static func runVideoMap(
        mode: String,
        transcript: String,
        video: ManifestVideo
    ) async -> TimedResponse {
        writeProgress("RUN_START\t\(video.id)\t\(mode)")
        let startedAt = ContinuousClock.now
        let response = await AppleIntelligenceService()
            .generateVideoAnalysisForTesting(
                mode: mode,
                transcript: transcript,
                languageCode: "en",
                languageLabel: "English",
                videoTitle: video.title,
                channelName: video.channel
            )
        return TimedResponse(
            elapsedSeconds: durationSeconds(startedAt.duration(to: .now)),
            response: response
        )
    }

    private static func runCurrentSummary(
        transcript: String
    ) async -> TimedResponse {
        writeProgress("RUN_START\tcurrent-summary")
        let startedAt = ContinuousClock.now
        let response = await AppleIntelligenceService().generate(
            kind: "summaryFull",
            transcript: transcript,
            languageCode: "en",
            languageLabel: "English",
            strategy: GenerationSettings.appleSummaryStrategyAdaptiveGrounded
        )
        return TimedResponse(
            elapsedSeconds: durationSeconds(startedAt.duration(to: .now)),
            response: response
        )
    }

    private static func writePayload(
        video: ManifestVideo,
        approach: String,
        elapsedSeconds: Double,
        response: [String: Any],
        to url: URL
    ) throws {
        let payload: [String: Any] = [
            "video": [
                "id": video.id,
                "title": video.title,
                "channel": video.channel,
                "duration": video.duration,
                "durationSeconds": video.durationSeconds,
                "cueCount": video.cueCount,
                "transcriptCharacters": video.transcriptCharacters,
                "sourceURL": video.sourceURL,
            ],
            "approach": approach,
            "elapsedSeconds": elapsedSeconds,
            "response": response,
        ]
        let data = try JSONSerialization.data(
            withJSONObject: payload,
            options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        )
        try data.write(to: url, options: .atomic)
    }

    private static func loadTimedResponse(from url: URL) -> TimedResponse? {
        guard
            let data = try? Data(contentsOf: url),
            let payload = try? JSONSerialization.jsonObject(with: data)
                as? [String: Any],
            let elapsedSeconds = payload["elapsedSeconds"] as? Double,
            let response = payload["response"] as? [String: Any],
            responseSucceeded(response)
        else {
            return nil
        }
        return TimedResponse(
            elapsedSeconds: elapsedSeconds,
            response: response
        )
    }

    private static func report(
        videoID: String,
        approach: String,
        run: TimedResponse
    ) {
        let debug = run.response["debug"] as? [String: Any] ?? [:]
        let chaptersText = run.response["chaptersText"] as? String
            ?? ((run.response["chapters"] as? [String: Any])?["chaptersText"] as? String)
            ?? ""
        let summaryText = run.response["summaryText"] as? String
            ?? ((run.response["summary"] as? [String: Any])?["text"] as? String)
            ?? ""
        let chapterCount = chaptersText
            .split(whereSeparator: \.isNewline)
            .count
        writeProgress(
            String(
                format: "RUN_END\t%@\t%@\t%@\t%.3fs\tcalls=%d\tchapters=%d\tsummaryChars=%d",
                videoID,
                approach,
                responseSucceeded(run.response) ? "ok" : "failed",
                run.elapsedSeconds,
                (debug["modelCalls"] as? Int) ?? modelCalls(run.response),
                chapterCount,
                summaryText.count
            )
        )
    }

    private static func responseSucceeded(_ response: [String: Any]) -> Bool {
        response["ok"] as? Bool == true
    }

    private static func modelCalls(_ response: [String: Any]) -> Int {
        let debug = response["debug"] as? [String: Any] ?? [:]
        return debug["modelCalls"] as? Int ?? 0
    }

    private static func durationSeconds(_ duration: Duration) -> Double {
        let components = duration.components
        return Double(components.seconds)
            + Double(components.attoseconds) / 1_000_000_000_000_000_000
    }

    private static func writeProgress(_ text: String) {
        FileHandle.standardOutput.write(Data("\(text)\n".utf8))
    }
}
