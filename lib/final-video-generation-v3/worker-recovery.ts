import "server-only";
import type { RuntimeWorkspace, V3Store } from "./runtime-store";
import { observationSchema } from "./runtime-contract";
import { readSpool } from "./runtime-media";
import { refreshQueuedVideoDelivery } from "./refresh-video-delivery";
import { v3TransportConfig } from "./runtime-config";
import { outputHostname } from "./adapters/higgsfield-transport";

const recoveryAfter = new Map<string, number>();
// Refresh/reconcile existing work only. Unknown outcomes never become new intents.
export async function prepareV3VideoRecovery(store: V3Store, w: RuntimeWorkspace, signal: AbortSignal) {
  let changed = false;
  for (const run of w.runs) {
    const task = w.tasks.find(t => t.kind === "video" && t.input.runId === run.id);
    if (!task || task.lease_until && Date.parse(task.lease_until) > Date.now()) continue;
    if (run.state === "queued" && !task.provider_started && !run.observation && v3TransportConfig().enabled &&
      ["queued", "reconciliation_required"].includes(task.status) && Date.parse(run.intent.deliveryExpiresAt) <= Date.now()) {
      try { await refreshQueuedVideoDelivery(store, w, run.id, signal); changed = true; }
      catch (error) {
        // Contention or invalid current authority stays fail-closed at normal admission.
        if (error instanceof Error && error.message === "V3_VIDEO_DELIVERY_REFRESH_SETUP_REQUIRED") throw error;
      }
      continue;
    }
    if (!task.provider_started || task.status !== "reconciliation_required" || run.result ||
      !["submitting", "provider_processing", "reconciliation_required"].includes(run.state) || (recoveryAfter.get(run.id) ?? 0) > Date.now()) continue;
    let known = run.observation;
    try {
      const bytes = await readSpool(run.id, "completed.json") ?? await readSpool(run.id, "acceptance.json");
      if (bytes) {
        const saved = observationSchema.parse(JSON.parse(bytes.toString("utf8")));
        if (known && known.requestId !== saved.requestId) continue;
        known = saved;
      }
    } catch { continue; }
    if (!known || ["failed", "nsfw", "canceled"].includes(known.status)) continue;
    const savedResult = known.status === "completed" && !!await readSpool(run.id, "result.bytes");
    if (!savedResult && known.expiresAt && Date.parse(known.expiresAt) <= Date.now()) continue;
    if (!savedResult && known.status === "completed" && (!known.resultUrl || !v3TransportConfig().outputHosts.includes(outputHostname(known.resultUrl) ?? ""))) continue;
    if (recoveryAfter.size >= 1024) recoveryAfter.delete(recoveryAfter.keys().next().value!);
    recoveryAfter.set(run.id, Date.now() + 30_000);
    changed = await store.rpc("ugc_v3_worker_resume_known", { p_owner: w.project.owner_user_id, p_project: w.project.project_id,
      p_run: run.id, p_request: known.requestId }) === true || changed;
  }
  return changed ? store.read(w.project.owner_user_id, w.project.project_id) : w;
}
