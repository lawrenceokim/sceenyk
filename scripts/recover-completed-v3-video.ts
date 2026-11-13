// Explicit operator recovery of saved bytes. Inherits only the actual process
// environment. No provider estimate, submit, polling or replacement request.
import { z } from "zod";
import { createDatabaseClient } from "../lib/db/server";
import { getDatabaseConfig } from "../lib/db/config";
import { getStorageConfig } from "../lib/storage/config";
import { V3Store } from "../lib/final-video-generation-v3/runtime-store";
import { readSpool, bytesHash, publishPrivate, readPrivate } from "../lib/final-video-generation-v3/runtime-media";
import { inspectVideo } from "../lib/final-video-generation-v3/inspect-video";
import { readFrozenPackage } from "../lib/final-video-generation-v3/package";
import { observationSchema, taskSchema } from "../lib/final-video-generation-v3/runtime-contract";
import { recoverCompletedV3VideoTask } from "../lib/final-video-generation-v3/worker";

async function main() {
  const [flag, id, mode] = process.argv.slice(2);
  if (flag !== "--run" || !z.uuid().safeParse(id).success || ![undefined, "--stage", "--resume"].includes(mode) || process.argv.length > 5)
    throw new Error("RECOVERY_ARGUMENT_INVALID");
  Object.assign(process.env, { UGC_V3_HIGGSFIELD_ENABLED: "0", UGC_V3_OPENAI_ENABLED: "0" });
  const dbConfig = getDatabaseConfig(), storage = getStorageConfig(), realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (![dbConfig.url, storage.endpoint].includes(url.origin)) throw new Error("RECOVERY_EXTERNAL_REQUEST_FORBIDDEN");
    return realFetch(input, init);
  };
  const db = createDatabaseClient() as unknown as { from(table: "ugc_v3_runs" | "ugc_v3_projects"): {
    select(columns: string): { eq(column: string, value: string): { single(): PromiseLike<{ data: unknown; error: unknown }> } };
  } };
  const lookup = await db.from("ugc_v3_runs").select("project_id").eq("id", id!).single();
  if (lookup.error || !lookup.data) throw new Error("RECOVERY_RUN_NOT_FOUND");
  const project = z.object({ project_id: z.uuid() }).parse(lookup.data).project_id;
  const registry = await db.from("ugc_v3_projects").select("owner_user_id").eq("project_id", project).single();
  if (registry.error || !registry.data) throw new Error("RECOVERY_PROJECT_NOT_FOUND");
  const owner = z.object({ owner_user_id: z.uuid() }).parse(registry.data).owner_user_id, store = new V3Store();
  let w = await store.read(owner, project);
  const run = w.runs.find(r => r.id === id)!;
  if (run.observation?.status !== "completed") throw new Error("V3_COMPLETED_RESULT_REQUIRED");
  const receipt = await readSpool(id!, "completed.json"), bytes = await readSpool(id!, "result.bytes");
  if (!receipt || !bytes) throw new Error("RECOVERY_SAVED_BYTES_REQUIRED");
  if (observationSchema.parse(JSON.parse(receipt.toString("utf8"))).requestId !== run.observation.requestId) throw new Error("PROVIDER_RECEIPT_MISMATCH");
  const doc = readFrozenPackage(w.packages.find(p => p.id === run.package_id)!.document), segment = doc.segments.find(s => s.id === run.intent.segmentId)!;
  const metadata = await inspectVideo(id!, bytes, { durationMs: segment.durationMs, aspectRatio: doc.source.storyboardContent.aspectRatio,
    generateAudio: true, resolution: run.intent.authorization.resolution });
  console.info(JSON.stringify({ check: "saved_video_valid", runId: id, bytes: bytes.length, sha256: bytesHash(bytes), metadata, generationRequests: 0 }));
  if (!mode) return;
  const asset = await publishPrivate(owner, project, id!, bytes, metadata, AbortSignal.timeout(60000));
  console.info(JSON.stringify({ check: "private_result_verified", runId: id, sha256: asset.sha256, bytes: asset.sizeBytes }));
  if (mode === "--stage") return;
  if (!run.result) {
    const task = taskSchema.parse(await store.rpc("ugc_v3_completed_video_claim", { p_owner: owner, p_project: project, p_run: id, p_request: run.observation.requestId }));
    w = await store.read(owner, project);
    await recoverCompletedV3VideoTask(store, task, w, AbortSignal.timeout(5 * 60_000));
  }
  const saved = (await store.read(owner, project)).runs.find(r => r.id === id)!;
  if (!saved.result || saved.result.sha256 !== asset.sha256 || !["awaiting_review", "approved"].includes(saved.state)) throw new Error("RECOVERY_SAVE_NOT_CONFIRMED");
  await readPrivate(saved.result.storageKey, saved.result.etag, saved.result.sizeBytes, AbortSignal.timeout(30000), saved.result.sha256);
  console.info(JSON.stringify({ check: "recovery_complete", runId: id, state: saved.state, generationRequests: 0, creditsReservedAgain: 0 }));
}
void main().catch(error => {
  console.error(JSON.stringify({ check: "recovery_failed", code: error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "RECOVERY_UNAVAILABLE" }));
  process.exitCode = 1;
});
