// Isolated Node worker. Next.js/Inngest calls only its signed HTTP boundary.
import { loadEnvConfig } from "@next/env";
import { executePreparation } from "../lib/media-preparation/processor";
import { resolveWorkerPreparation } from "../lib/media-preparation/context";
import { workerSharedSecret } from "../lib/media-preparation/auth";
import { createPreparationServer } from "../lib/media-preparation/http";
import { getDatabaseConfig } from "../lib/db/config";
import { getStorageConfig } from "../lib/storage/config";
import { runMediaCommand } from "../lib/media-preparation/ffmpeg";

async function main() {
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const secret = workerSharedSecret();
  getDatabaseConfig();
  getStorageConfig();
  if (process.env.NODE_ENV === "production" && (!process.env.FFMPEG_PATH || !process.env.FFPROBE_PATH)) throw new Error("PROCESSOR_PATHS_REQUIRED");
  await Promise.all([runMediaCommand("ffmpeg", ["-version"]), runMediaCommand("ffprobe", ["-version"])]);
  const port = Number(process.env.PORT ?? process.env.MEDIA_PREPARATION_WORKER_PORT ?? 3012);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("WORKER_PORT_INVALID");
  const host = process.env.MEDIA_PREPARATION_WORKER_HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
  const { server, drain } = createPreparationServer(secret, async input => executePreparation(await resolveWorkerPreparation(input)));
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => {
    drain();
    // Render's 300-second shutdown allowance lets in-flight work clean up.
    setTimeout(() => process.exit(1), 290_000).unref();
  });
  server.listen(port, host, () => console.log(JSON.stringify({ stage: "media_preparation_worker_ready" })));
}
main().catch(() => { console.error("MEDIA_WORKER_STARTUP_FAILED"); process.exitCode = 1; });
