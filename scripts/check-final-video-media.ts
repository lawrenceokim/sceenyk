// Offline native media fixtures only; no worker, live storage or provider access.
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runMediaCommand } from "../lib/media-preparation/ffmpeg";
import { normalizeVisual, alignedAudio, muxScene, stitch, measure, validateVideo } from "../lib/final-video-generation/media";
import { cleanScratch } from "../lib/final-video-generation/storage";
import type { FinalExecution } from "../lib/final-video-generation/contract";
import { sceneSpeechWindow } from "../lib/final-video-generation/planning";

async function main() {
  globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_MEDIA_CHECKS"); };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sceenyk-m10-fixture-"));
  process.env.UGC_FINAL_RECOVERY_DIR = directory;
  const run = { id: randomUUID(), claim_token: randomUUID() } as FinalExecution;
  try {
    const videoPath = path.join(directory, "synthetic.mp4"), audioPath = path.join(directory, "synthetic.mp3");
    await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "color=c=blue:s=720x1280:r=25:d=5", "-an", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", videoPath]);
    await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "sine=frequency=400:duration=1", "-c:a", "libmp3lame", "-ar", "44100", "-ac", "1", audioPath]);
    const visual = await normalizeVisual(run, await fs.readFile(videoPath), 5000, "9:16");
    assert.equal(visual.metadata.hasAudio, false); assert.equal(visual.metadata.width, 720); assert.equal(visual.metadata.durationMs, 5000);
    assert.deepEqual(sceneSpeechWindow({startMs:5000,durationMs:5000},{startMs:6200,endMs:7600}),{offsetMs:1200,windowMs:1400});
    assert.throws(()=>sceneSpeechWindow({startMs:5000,durationMs:5000},{startMs:1200,endMs:2600}),/FINAL_SPEECH_TIMING/);
    const shortPath=path.join(directory,"short.mp4");
    await runMediaCommand("ffmpeg",["-v","error","-nostdin","-i",videoPath,"-t","4.96","-c","copy",shortPath]);
    const padded=await normalizeVisual(run,await fs.readFile(shortPath),5000,"9:16");
    assert.equal(padded.metadata.durationMs,5000);
    const speech = await alignedAudio(run, [{ bytes: await fs.readFile(audioPath), offsetMs: 2000, windowMs: 2500 }], 5000);
    assert.ok(Math.abs(speech.metadata.durationMs - 5000) <= 50);
    await assert.rejects(alignedAudio(run, [{ bytes: await fs.readFile(audioPath), offsetMs: 2000, windowMs: 100 }], 5000), /FINAL_SPEECH_TIMING/);
    await assert.rejects(alignedAudio(run,[{bytes:await fs.readFile(audioPath),offsetMs:6200,windowMs:1400}],5000),/FINAL_SPEECH_TIMING/);
    const spoken = await muxScene(run, visual.bytes, speech.bytes, 5000, "9:16"); assert.equal(spoken.metadata.hasAudio, true);
    const final = await stitch(run, [visual.bytes, spoken.bytes], 10000, "9:16", true);
    validateVideo(final.metadata, 10000, "9:16", true);
    assert.equal(final.metadata.durationMs,10000);
    const finalPath = path.join(directory, "measured-final.mp4"); await fs.writeFile(finalPath, final.bytes);
    assert.deepEqual(await measure(finalPath, "video/mp4"), final.metadata);
    const streams=JSON.parse(await runMediaCommand("ffprobe",["-v","error","-show_streams","-of","json",finalPath])).streams as {codec_type:string;duration:string}[];
    assert.equal(Number(streams.find(s=>s.codec_type==="video")?.duration),10);
    assert.equal(Number(streams.find(s=>s.codec_type==="audio")?.duration),10);
    async function audibleAt(seconds: number) {
      const stats = await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-ss", String(seconds), "-i", finalPath, "-t", "0.1",
        "-af", "astats=metadata=1:reset=0,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-", "-f", "null", "-"]);
      return [...stats.matchAll(/RMS_level=([^\r\n]+)/g)].some(match => Number(match[1]) > -50);
    }
    assert.equal(await audibleAt(0.5), false); // silent first scene
    assert.equal(await audibleAt(6.5), false); // second scene before speech window
    assert.equal(await audibleAt(7.3), true); // second scene + approved 2s offset
    assert.equal(await audibleAt(8.5), false); // declared silence after speech
    const silent = await stitch(run, [visual.bytes, visual.bytes], 10000, "9:16", false); assert.equal(silent.metadata.hasAudio, false);
    assert.throws(() => validateVideo(final.metadata, 9000, "9:16", true));
    assert.throws(() => validateVideo(final.metadata, 10000, "16:9", true));
    await cleanScratch(run);
    assert.equal((await fs.readdir(path.join(directory, run.id))).some(n => n.startsWith("scratch-")), false);
    console.info("M10 offline FFmpeg fixtures passed: silent/spoken normalization, timing, mux, ordered composition, validation, scratch cleanup");
  } finally {
    const resolved = path.resolve(directory), tempRoot = path.resolve(os.tmpdir());
    if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith("sceenyk-m10-fixture-")) throw new Error("FIXTURE_CLEANUP_SCOPE");
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
