import fs from "node:fs";
import path from "node:path";

const [metadataPath, captionsPath, outputPath] = process.argv.slice(2);
if (!metadataPath || !captionsPath || !outputPath) {
  process.stderr.write(
    "usage: node prepare-apple-video-analysis-source.mjs INFO_JSON CAPTIONS_JSON3 OUTPUT_TXT\n",
  );
  process.exit(2);
}

function timestamp(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const captions = JSON.parse(fs.readFileSync(captionsPath, "utf8"));
const cues = (captions.events || [])
  .map((event) => {
    const text = (event.segs || [])
      .map((segment) => segment.utf8 || "")
      .join("")
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return null;
    return {
      milliseconds: Number(event.tStartMs || 0),
      text,
    };
  })
  .filter(Boolean);
const transcript = cues
  .map((cue) => `[${timestamp(cue.milliseconds)}] ${cue.text}`)
  .join("\n");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${transcript}\n`, "utf8");
process.stdout.write(
  `${metadata.id}\t${metadata.title}\t${metadata.duration_string}\t${cues.length} cues\t${transcript.length} chars\n`,
);
