// This process deliberately receives no application credentials. React uses
// normal exports here; the HTTP worker parent uses react-server conditions.
import fs from "node:fs/promises";
import path from "node:path";
import { renderMedia, selectComposition, makeCancelSignal } from "@remotion/renderer";
import { compositionPlanSchema } from "../../lib/composition/contract";
import { renderConfiguration } from "../../lib/final-render/contract";

async function main() {
  const { cancelSignal, cancel }=makeCancelSignal();
  process.once("SIGTERM",()=>cancel());
  const directory = process.argv[2];
  const input = JSON.parse(await fs.readFile(path.join(directory, "input.json"), "utf8"));
  const plan = compositionPlanSchema.parse(input.plan);
  if (plan.status !== "ready") throw new Error("INVALID_OUTPUT");
  const inputProps = { plan, sources: input.sources };
  const serveUrl = path.resolve("workers/final-render/bundle");
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE;
  const composition = await selectComposition({ serveUrl, id: "FinalVideo", inputProps, browserExecutable, logLevel: "error" });
  await renderMedia({ composition, serveUrl, inputProps, outputLocation: path.join(directory, "visual.mp4"),
    codec: renderConfiguration.codec, muted: true,
    pixelFormat: renderConfiguration.pixelFormat, colorSpace: renderConfiguration.colorSpace, crf: renderConfiguration.crf, x264Preset: renderConfiguration.x264Preset,
    concurrency: renderConfiguration.concurrency, offthreadVideoThreads: 1, offthreadVideoCacheSizeInBytes: renderConfiguration.mediaCacheBytes,
    mediaCacheSizeInBytes: renderConfiguration.mediaCacheBytes, browserExecutable, logLevel: "error", onBrowserLog() {},
    timeoutInMilliseconds: 120_000, disallowParallelEncoding: true, cancelSignal,
  });
  await fs.writeFile(path.join(directory, "metrics.json"), JSON.stringify({ observedRssBytes: process.resourceUsage().maxRSS * 1024 }));
}
main().catch(error => {
  // Never print renderer exceptions: they may include local media capabilities.
  const message = error instanceof Error ? error.message : "";
  console.error(/out of memory|oom|allocation failed/i.test(message) ? "RESOURCE_LIMIT" : "RENDER_FAILED");
  process.exitCode = 1;
});
