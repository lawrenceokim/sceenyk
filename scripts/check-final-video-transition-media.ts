// Native FFmpeg transition fixtures only. No worker, provider or storage access.
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runMediaCommand } from "../lib/media-preparation/ffmpeg";
import { stitch, measure, verifyCompositionProcessor } from "../lib/final-video-generation/media";
import { checkComposition, type CompositionRequirements } from "../lib/final-video-generation/composition";
import { cleanScratch } from "../lib/final-video-generation/storage";
import type { FinalExecution } from "../lib/final-video-generation/contract";

async function main() {
  globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_TRANSITION_MEDIA_CHECKS"); };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sceenyk-m10-transition-")); process.env.UGC_FINAL_RECOVERY_DIR = directory;
  const run = { id: randomUUID(), claim_token: randomUUID() } as FinalExecution;
  const scene = (n: number, startMs: number, endMs: number, transition: string) => ({ id: `scene-${n}`, number: n, startMs, endMs,
    durationMs: endMs - startMs, transition, audio: { background: "None", effects: "None", music: "None" }, speech: [] });
  let checks = 0;
  function ok(value: unknown) { assert.ok(value); checks++; }
  function equal(a: unknown, b: unknown) { assert.deepEqual(a, b); checks++; }
  try {
    const red = path.join(directory, "red.mp4"), blue = path.join(directory, "blue.mp4");
    for (const [file, color, seconds, tone] of [[red, "red", 6, 0], [blue, "blue", 5, 1]] as const) {
      await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i", `color=c=${color}:s=720x720:r=25:d=${seconds}`,
        "-f", "lavfi", "-i", `sine=frequency=400:duration=0.4`, "-af", `volume=${tone},adelay=1000:all=1,apad,atrim=duration=${seconds}`,
        "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "1", "-t", String(seconds), file]);
    }
    const redBytes = await fs.readFile(red), blueBytes = await fs.readFile(blue);
    const request: CompositionRequirements = { totalDurationMs: 10000,
      scenes: [scene(1, 0, 6000, "Dissolve into the next shot over 1s"), scene(2, 5000, 10000, "Fade out cleanly over 400ms")] };
    const checked = checkComposition(request); equal(checked.issues, []); ok(checked.plan);
    await verifyCompositionProcessor(checked.plan!, true); checks++;
    const result = await stitch(run, [redBytes, blueBytes], 10000, "1:1", true, checked.plan!);
    equal(result.metadata.durationMs, 10000); equal(result.metadata.hasAudio, true);
    const final = path.join(directory, "final.mp4"); await fs.writeFile(final, result.bytes); equal(await measure(final, "video/mp4"), result.metadata);
    async function luma(file: string, seconds: number) {
      const output = await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-ss", String(seconds), "-i", file, "-t", "0.04",
        "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-an", "-f", "null", "-"]);
      const value = output.match(/YAVG=([^\r\n]+)/)?.[1]; ok(value); return Number(value);
    }
    const first = await luma(final, 4), middle = await luma(final, 5.5), last = await luma(final, 7), faded = await luma(final, 9.96);
    ok(first > middle && middle > last); ok(faded < last && faded < 24); // actual dissolve and terminal fade, no cut fallback
    async function audibleAt(seconds: number) {
      const output = await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-ss", String(seconds), "-i", final, "-t", "0.1",
        "-af", "astats=metadata=1:reset=0,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-", "-f", "null", "-"]);
      return [...output.matchAll(/RMS_level=([^\r\n]+)/g)].some(m => Number(m[1]) > -50);
    }
    equal(await audibleAt(5.5), false); equal(await audibleAt(6.2), true); equal(await audibleAt(6.8), false); // exact scene-2 absolute voice offset
    const noOverlap = structuredClone(request); noOverlap.scenes = [scene(1, 0, 5000, "Crossfade 1s"), noOverlap.scenes[1]];
    equal(checkComposition(noOverlap).plan, null); ok(checkComposition(noOverlap).issues.some(i => i.code === "COMPOSITION_TRANSITION_TIMING_MISMATCH"));
    await assert.rejects(stitch(run, [redBytes], 10000, "1:1", true, checked.plan!), /FINAL_COMPOSITION_SCENE_COUNT/); checks++;
    await assert.rejects(stitch(run, [redBytes, blueBytes], 11000, "1:1", true, checked.plan!), /FINAL_COMPOSITION_PLAN_INVALID/); checks++;
    const fadeRequest = { totalDurationMs: 11000, scenes: [scene(1, 0, 6000, "Fade in 400ms"), scene(2, 6000, 11000, "Fade out 400ms")] };
    const fadePlan = checkComposition(fadeRequest); equal(fadePlan.issues, []);
    const fades = await stitch(run, [redBytes, blueBytes], 11000, "1:1", false, fadePlan.plan!);
    equal(fades.metadata.durationMs, 11000); equal(fades.metadata.hasAudio, false);
    const fadeFile = path.join(directory, "fades.mp4"); await fs.writeFile(fadeFile, fades.bytes);
    ok(await luma(fadeFile, 0) < 24); ok(await luma(fadeFile, 10.96) < 24);
    const mixedPlan = checkComposition({ totalDurationMs: 16000,
      scenes: [scene(1, 0, 6000, "Cut"), scene(2, 6000, 11000, "Crossfade 1s"), scene(3, 10000, 16000, "Cut")] });
    equal(mixedPlan.issues, []);
    const mixed = await stitch(run, [redBytes, blueBytes, redBytes], 16000, "1:1", false, mixedPlan.plan!);
    equal(mixed.metadata.durationMs, 16000); equal(mixed.metadata.hasAudio, false);
    await cleanScratch(run);
    console.info(`M10 native FFmpeg transition checks passed: ${checks}; dissolve/fades/mixed cuts, exact duration/audio offsets, invalid-plan rejection`);
  } finally {
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("sceenyk-m10-transition-")) throw new Error("FIXTURE_CLEANUP_SCOPE");
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
