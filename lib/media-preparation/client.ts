import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadPreparation } from "./context";
import { workerConnection, preparationLimits } from "./config";
import { PreparationError } from "./contract";
import { signWorkerRequest, workerSignatureHeader, workerTimestampHeader, workerNonceHeader } from "./auth";

export async function prepareVisualSource(sceneId: string, jobId: string, runId: string) {
  const input = { sceneId, jobId, runId };
  const { scene, db } = await loadPreparation(input);
  if (!scene.preparation_required || scene.provider_task_id || ["completed", "failed", "skipped"].includes(scene.status)) return { ready: !scene.preparation_required || scene.status === "completed" || !!scene.provider_task_id };
  try {
    const worker = workerConnection();
    const body = JSON.stringify({ generationJobId: jobId, sceneExecutionId: sceneId });
    const timestamp = String(Date.now());
    // Every durable retry gets new authentication; job/segment identity stays stable.
    const nonce = randomUUID();
    const signature = signWorkerRequest(worker.secret, "POST", new URL(worker.url).pathname, timestamp, nonce, body);
    const response = await fetch(worker.url, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(preparationLimits.requestMs), headers: { [workerTimestampHeader]: timestamp, [workerNonceHeader]: nonce, [workerSignatureHeader]: signature, "Content-Type": "application/json" }, body });
    if (!response.ok) { await response.body?.cancel(); throw new PreparationError("PREPARATION_UNAVAILABLE", true); }
    return z.strictObject({ ready: z.boolean() }).parse(await response.json());
  } catch {
    const saved = await db.rpc("record_visual_status", { p_scene_id: scene.id, p_run_id: runId, p_status: "pending", p_credits: null, p_error: "PREPARATION_UNAVAILABLE" });
    if (saved.error) throw new Error("PREPARATION_DATABASE_UNAVAILABLE");
    throw new Error("PREPARATION_UNAVAILABLE");
  }
}
