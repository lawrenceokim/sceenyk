// Existing local bytes only. No network, worker or source-media writes.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { runMediaCommand } from "../lib/media-preparation/ffmpeg";
import { alignedAudio } from "../lib/final-video-generation/media";
import type { FinalExecution, Operation } from "../lib/final-video-generation/contract";

async function main() {
  globalThis.fetch = async () => { throw Error("NETWORK_FORBIDDEN"); };
  const root = path.resolve(".ugc-final-recovery");
  const data = JSON.parse(await fs.readFile(path.join(root, "review-investigation.json"), "utf8"));
  const run = data.execution as FinalExecution;
  const operations = data.ugc_final_operations as Operation[];
  const directory = path.join(root, run.id), outputDirectory = path.join(root, "media-investigation");
  await fs.mkdir(outputDirectory, { recursive: true });
  const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  const find = (key: string) => operations.find(o => o.operation_key === key)!;
  const probe = async (file: string) => JSON.parse(await runMediaCommand("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]));
  const stages = [];
  for (const key of ["voice:scene-2:0", "guide:scene-2", "sync:scene-2", "scene:scene-2", "final:1"]) {
    const op = find(key), file = path.join(directory, `${op.id}.bytes`);
    const bytes = await fs.readFile(file);
    if (hash(bytes) !== op.output?.sha256) throw Error("ASSET_PROOF_MISMATCH");
    const p = await probe(file);
    stages.push({ key, id: op.id, storageKey: op.output?.key, sha256: hash(bytes), duration: p.format.duration,
      streams: p.streams.map((s: Record<string, unknown>) => ({ type: s.codec_type, codec: s.codec_name, start: s.start_time, duration: s.duration, fps: s.avg_frame_rate })),
      input: op.input });
  }
  const sync = find("sync:scene-2"), source = path.join(directory, `${sync.id}.source.bytes`);
  const originalSpeech = find("voice:scene-2:0");
  const speechFile = path.join(directory, `${originalSpeech.id}.bytes`);
  const originalFile = path.join(directory, `${originalSpeech.id}.source.bytes`);
  assert.equal(hash(await fs.readFile(originalFile)),originalSpeech.receipt?.speechFit?.sourceSha256);
  assert.deepEqual(find("guide:scene-2").input.hashes,[originalSpeech.output!.sha256]);
  assert.equal(sync.input.audioGuideHash,find("guide:scene-2").output!.sha256);
  assert.deepEqual(find("scene:scene-2").input.audioHashes,[originalSpeech.output!.sha256]);
  // Regenerate a disposable guide from the immutable corrected speech to check exact identity.
  process.env.UGC_FINAL_RECOVERY_DIR = outputDirectory;
  const guide = await alignedAudio({ ...run, claim_token: null }, [{ bytes: await fs.readFile(speechFile), offsetMs: 1200, windowMs: 1400 }], 5000);
  const guideHash = hash(guide.bytes);
  assert.equal(guideHash,find("guide:scene-2").output!.sha256);
  const silence = async (file: string, start = 0) => {
    const result = await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-ss", String(start), "-i", file,
      "-af", "silencedetect=noise=-40dB:d=0.02,ametadata=mode=print:file=-", "-f", "null", "-"]);
    return result.split(/\r?\n/).filter(s => /silence_(?:start|end)=/.test(s));
  };
  const raw = await probe(source);
  const result = { localOnly: true, stages, regeneratedGuideHash: guideHash,
    exactGuideMatches: guideHash === find("guide:scene-2").output?.sha256,
    klingRaw: { sha256: hash(await fs.readFile(source)), duration: raw.format.duration,
      streams: raw.streams.map((s: Record<string, unknown>) => ({ type: s.codec_type, start: s.start_time, duration: s.duration, fps: s.avg_frame_rate })) },
    speechFit: originalSpeech.receipt?.speechFit,
    silence: { originalSpeech: await silence(originalFile), correctedSpeech: await silence(speechFile),
      guide: await silence(path.join(directory, `${find("guide:scene-2").id}.bytes`)),
      scene: await silence(path.join(directory, `${find("scene:scene-2").id}.bytes`)),
      finalScene2: await silence(path.join(directory, `${find("final:1").id}.bytes`), 5),
      kling: raw.streams.some((s: { codec_type: string }) => s.codec_type === "audio") ? await silence(source) : "no audio track" } };
  await fs.writeFile(path.join(outputDirectory, "measurements.json"), JSON.stringify(result, null, 2));
  // Frame contacts at 80ms intervals; labels are frame indices from 1.04s.
  await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-y", "-ss", "1.04", "-i", source, "-t", "1.36",
    "-vf", "fps=12.5,scale=320:180,drawtext=text='%{pts\\:hms}':x=5:y=5:fontsize=15:fontcolor=white:box=1:boxcolor=black,tile=4x5", "-frames:v", "1", path.join(outputDirectory, "kling-scene2.png")]);
  await runMediaCommand("ffmpeg", ["-v","error","-nostdin","-y","-i",source,"-vf",
    "fps=30,trim=start=1.16:end=1.76,crop=140:130:550:110,scale=280:260,drawtext=text='%{pts\\:hms}':x=5:y=5:fontsize=18:fontcolor=white:box=1:boxcolor=black,tile=5x4",
    "-frames:v","1",path.join(outputDirectory,"kling-mouth-frames.png")]);
  console.info(JSON.stringify({ ...result, speechFit: undefined, stages: stages.map(({ input, ...stage }) => { void input; return stage; }) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
