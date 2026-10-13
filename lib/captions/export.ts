import "server-only";
import { captionTrackSchema, wrapCaption, type CaptionTrack } from "./contract";

export function captionTimestamp(ms: number, separator: "." | ",") {
  const hours = Math.floor(ms / 3_600_000), minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60, fraction = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(fraction).padStart(3, "0")}`;
}
export function exportCaptions(input: CaptionTrack, format: "srt" | "vtt") {
  const track = captionTrackSchema.parse(input);
  if (track.status !== "ready") throw new Error("CAPTIONS_NOT_READY");
  const separator = format === "srt" ? "," : ".";
  const body = track.cues.map((cue, index) => {
    const text = wrapCaption(cue.text).join("\n").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `${index + 1}\n${captionTimestamp(cue.start_ms, separator)} --> ${captionTimestamp(cue.end_ms, separator)}\n${text}\n`;
  }).join("\n");
  return (format === "vtt" ? "WEBVTT\n\n" : "") + body;
}
