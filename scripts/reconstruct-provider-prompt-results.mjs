#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [aggregatePath, metricsPath, runDirectory] = process.argv.slice(2);

if (!aggregatePath || !metricsPath || !runDirectory) {
    console.error(
        "Usage: reconstruct-provider-prompt-results.mjs "
        + "<aggregate-results.json> <metrics.csv> <run-directory>"
    );
    process.exit(1);
}

const manifestPath = path.join(runDirectory, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const results = JSON.parse(fs.readFileSync(aggregatePath, "utf8"));

function cleanDescription(value) {
    const normalized = String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/\n[ \t]*\n+/g, "\n\n");
    const urlPattern = /\b(?:https?:\/\/|www\.)\S+/gi;
    const hashtagOnlyPattern = /^(?:#\S+\s*)+$/;
    const chapterPattern = /^(?:\d{1,2}:)?\d{1,2}:\d{2}\b/;
    const promotionPattern = /\b(?:subscribe|follow (?:me|us)|support (?:me|us|the channel)|sponsored|affiliate|shop|merch|use (?:code|promo code)|sign up|make money|watch the full|join (?:my|our|the)|patreon|discount|trade on|buy .*(?:merch|book)|unlock my)\b/i;
    const boilerplatePattern = /^(?:-+|credits|disclaimer|about this channel|show index|chapters)\s*:?\s*$/i;

    const firstUsefulParagraph = normalized
        .split("\n\n")
        .map((paragraph) => paragraph
            .split("\n")
            .map((line) => line.replace(/[ \t]+/g, " ").trim())
            .filter(Boolean)
            .filter((line) => !hashtagOnlyPattern.test(line))
            .filter((line) => !chapterPattern.test(line))
            .filter((line) => !boilerplatePattern.test(line))
            .filter((line) => !promotionPattern.test(line))
            .map((line) => line.replace(urlPattern, "").trim())
            .filter(Boolean)
            .join("\n"))
        .find(Boolean) || "";

    if (firstUsefulParagraph.length <= 2500) {
        return firstUsefulParagraph;
    }
    return `${firstUsefulParagraph.slice(0, 2500).trim()}…`;
}

function stripTranscriptTimestamps(value) {
    return String(value)
        .split(/\r?\n/)
        .map((line) => line
            .replace(/^\s*\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/, "")
            .trim())
        .filter(Boolean)
        .join("\n");
}

function writeJSON(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const videosByID = new Map(manifest.videos.map((video) => [video.videoID, video]));
const expectedResultCount = manifest.videos.length * 4;
if (results.length !== expectedResultCount) {
    throw new Error(
        `Expected ${expectedResultCount} results but aggregate contains ${results.length}.`
    );
}

for (const video of manifest.videos) {
    const directoryName =
        `${String(video.ordinal).padStart(2, "0")}-${video.slug}-${video.videoID}`;
    const videoDirectory = path.join(runDirectory, directoryName);
    fs.mkdirSync(videoDirectory, { recursive: true });

    const sourcePath = path.resolve(runDirectory, video.transcriptPath);
    const transcript = stripTranscriptTimestamps(fs.readFileSync(sourcePath, "utf8"));
    fs.writeFileSync(path.join(videoDirectory, "input-transcript.txt"), transcript);

    const firstResult = results.find((result) => result.videoID === video.videoID);
    writeJSON(path.join(videoDirectory, "metadata.json"), {
        videoID: video.videoID,
        url: video.url,
        title: video.title,
        channelName: video.channelName,
        rawDescription: video.description,
        cleanedDescription: cleanDescription(video.description),
        durationSeconds: video.durationSeconds,
        captionKind: video.captionKind,
        languageCode: video.languageCode,
        languageLabel: video.languageLabel,
        inputCharacters: firstResult?.inputCharacters ?? transcript.length,
    });
}

for (const result of results) {
    const video = videosByID.get(result.videoID);
    if (!video) {
        throw new Error(`Aggregate contains unknown video ID ${result.videoID}.`);
    }
    const directoryName =
        `${String(video.ordinal).padStart(2, "0")}-${video.slug}-${video.videoID}`;
    const baseName = `${result.model}-${result.promptVersion}`;
    const videoDirectory = path.join(runDirectory, directoryName);
    writeJSON(path.join(videoDirectory, `${baseName}.json`), result);
    fs.writeFileSync(
        path.join(videoDirectory, `${baseName}.md`),
        result.status === "succeeded" ? result.text : `ERROR: ${result.error}`
    );
}

fs.copyFileSync(aggregatePath, path.join(runDirectory, "aggregate-results.json"));
fs.copyFileSync(metricsPath, path.join(runDirectory, "metrics.csv"));
console.log(`Reconstructed ${results.length} results in ${runDirectory}`);
