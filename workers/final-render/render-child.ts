// This process deliberately receives no application credentials. React uses
// normal exports here; the HTTP worker parent uses react-server conditions.
import fs from "node:fs/promises";
import path from "node:path";
import { renderFrames, stitchFramesToVideo, openBrowser, makeCancelSignal } from "@remotion/renderer";
import type { VideoConfig } from "remotion";
import { compositionPlanSchema } from "../../lib/composition/contract";
import { renderConfiguration, renderShape } from "../../lib/final-render/contract";

async function main() {
  const { cancelSignal, cancel }=makeCancelSignal();
  process.once("SIGTERM",()=>cancel());
  const directory = process.argv[2];
  const input = JSON.parse(await fs.readFile(path.join(directory, "input.json"), "utf8"));
  const plan = compositionPlanSchema.parse(input.plan);
  if (plan.status !== "ready") throw new Error("INVALID_OUTPUT");
  // Narration is muxed once, at exact sample boundaries, after this process exits.
  const inputProps = { plan, sources: input.sources, renderAudio: false };
  const serveUrl = path.resolve("workers/final-render/bundle");
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE;
  // Metadata is fixed by our trusted ready contract. Avoid an evaluation browser
  // whose asynchronous cleanup can overlap the frame-rendering browser.
  const composition: VideoConfig = { id: "FinalVideo", ...renderShape(plan.aspect_ratio),
    fps: renderConfiguration.fps, durationInFrames: Math.round(plan.total_duration_ms * renderConfiguration.fps / 1000),
    props: inputProps, defaultProps: inputProps, defaultCodec: null, defaultOutName: null,
    defaultVideoImageFormat: null, defaultPixelFormat: null, defaultProResProfile: null, defaultSampleRate: null };
  const framesDirectory = path.join(directory, "frames");
  await fs.mkdir(framesDirectory);
  const browser = await openBrowser("chrome", { browserExecutable, logLevel: "error",
    chromiumOptions: { enableMultiProcessOnLinux: false } });
  let frames;
  try {
    frames = await renderFrames({ composition, serveUrl, inputProps, outputDir: framesDirectory,
      imageFormat: "jpeg", muted: true, puppeteerInstance: browser,
      concurrency: renderConfiguration.concurrency, offthreadVideoThreads: 1,
      offthreadVideoCacheSizeInBytes: renderConfiguration.mediaCacheBytes,
      mediaCacheSizeInBytes: renderConfiguration.mediaCacheBytes, logLevel: "error", onBrowserLog() {},
      onStart() {}, onFrameUpdate() {}, timeoutInMilliseconds: 120_000, cancelSignal });
  } finally {
    // Await browser termination before allocating the video encoder.
    await browser.close({ silent: true });
  }
  try {
    await stitchFramesToVideo({ assetsInfo: frames.assetsInfo, ...renderShape(plan.aspect_ratio),
    fps: renderConfiguration.fps, outputLocation: path.join(directory, "visual.mp4"),
    codec: renderConfiguration.codec, muted: true,
    pixelFormat: renderConfiguration.pixelFormat, colorSpace: renderConfiguration.colorSpace, crf: renderConfiguration.crf, x264Preset: renderConfiguration.x264Preset,
    cancelSignal,
    // Input decoding, filter pools and x264 must not scale with the host's CPUs.
    ffmpegOverride: ({ args }) => ["-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1", ...args.slice(0, -1), "-threads", "1", args[args.length - 1]],
    });
  } finally {
    await fs.rm(framesDirectory, { recursive: true, force: true });
  }
  await fs.writeFile(path.join(directory, "metrics.json"), JSON.stringify({ observedRssBytes: process.resourceUsage().maxRSS * 1024 }));
}
main().catch(error => {
  // Never print renderer exceptions: they may include local media capabilities.
  const message = error instanceof Error ? error.message : "";
  console.error(/out of memory|oom|allocation failed/i.test(message) ? "RESOURCE_LIMIT" : "RENDER_FAILED");
  process.exitCode = 1;
});
