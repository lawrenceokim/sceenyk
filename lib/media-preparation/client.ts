import "server-only";
import { z } from "zod";
import { loadPreparation } from "./context";
import { workerConnection, preparationLimits } from "./config";
import { PreparationError } from "./contract";

export async function prepareVisualSource(sceneId: string, jobId: string, runId: string) {
  const input = { sceneId, jobId, runId };
  const { scene, db } = await loadPreparation(input);
  if (!scene.preparation_required || scene.provider_task_id || ["completed", "failed", "skipped"].includes(scene.status)) return { ready: !scene.preparation_required || scene.status === "completed" || !!scene.provider_task_id };
  try {
    const worker = workerConnection();
    const response = await fetch(worker.url, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(preparationLimits.requestMs), headers: { Authorization: `Bearer ${worker.token}`, "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) { await response.body?.cancel(); throw new PreparationError("PREPARATION_UNAVAILABLE", true); }
    return z.strictObject({ ready: z.boolean() }).parse(await response.json());
  } catch {
    const saved = await db.rpc("record_visual_status", { p_scene_id: scene.id, p_run_id: runId, p_status: "pending", p_credits: null, p_error: "PREPARATION_UNAVAILABLE" });
    if (saved.error) throw new Error("PREPARATION_DATABASE_UNAVAILABLE");
    throw new Error("PREPARATION_UNAVAILABLE");
  }
}
