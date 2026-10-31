import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

// Provider-free inspection/cleanup only. Never claims generation tasks or requests estimates.
async function main() {
  loadEnvConfig(process.cwd(), true);
  const args = process.argv.slice(2), project = z.uuid().parse(args[args.indexOf("--project") + 1]);
  if (!args.includes("--project") || args.some(a => !["--project", project, "--repair"].includes(a))) throw new Error("V3_REPAIR_ARGUMENTS_INVALID");
  if (process.env.UGC_V3_HIGGSFIELD_ENABLED !== "0") throw new Error("V3_REPAIR_REQUIRES_VIDEO_DISABLED");
  const repair = args.includes("--repair");
  const { createDatabaseClient } = await import("../lib/db/server");
  const { V3Store } = await import("../lib/final-video-generation-v3/runtime-store");
  const { discardReference, discardableReferences } = await import("../lib/final-video-generation-v3/reference-retention");
  const { headR2CharacterObject } = await import("../lib/storage/r2");
  const { v3Prefix, readSpool, purgeReferenceSpool } = await import("../lib/final-video-generation-v3/runtime-media");
  const { locationRequestId } = await import("../lib/final-video-generation-v3/location-contract");
  const { v3Digest } = await import("../lib/final-video-generation-v3/identity");
  const db = createDatabaseClient() as unknown as SupabaseClient, store = new V3Store();
  const registration = await db.from("ugc_v3_projects").select("owner_user_id").eq("project_id", project).single();
  if (registration.error || !registration.data || registration.data.owner_user_id !== process.env.UGC_V3_OPERATOR_USER_ID) throw new Error("V3_REPAIR_OWNER_MISMATCH");
  const owner = String(registration.data.owner_user_id), before = await store.read(owner, project), signal = AbortSignal.timeout(120_000);
  const approvals = (w: typeof before) => w.artifacts.filter(a => !!a.approved_at).map(a => ({ id: a.id, document: a.document, approved: a.approved_at }));
  if (repair) for (const a of discardableReferences(before)) await discardReference(store, owner, project, a, signal, false);
  let w = await store.read(owner, project);
  const cleanup = [];
  for (const d of w.referenceDeletions.filter(d => d.state === "completed" && d.mode === "reject")) {
    const key = `${v3Prefix(owner, project)}${d.id}.png`, head = await headR2CharacterObject(key, signal);
    if (head || w.artifacts.some(a => a.id === d.id)) throw new Error("V3_COMPLETED_DELETION_INCONSISTENT");
    const audit = await db.from("ugc_v3_runtime_events").select("document").eq("project_id", project).eq("entity_id", d.id).eq("kind", "reference_discarded");
    if (audit.error) throw new Error("V3_REPAIR_AUDIT_UNAVAILABLE");
    const source = z.object({ taskId: z.uuid() }).safeParse(audit.data?.[0]?.document);
    let spoolMissing = true;
    if (source.success) {
      const sourceTask = await db.from("ugc_v3_tasks").select("id").eq("project_id", project).eq("id", source.data.taskId);
      if (sourceTask.error || sourceTask.data?.length) throw new Error("V3_REPAIR_SOURCE_TASK_STILL_EXISTS");
      const ids = [source.data.taskId, ...(d.kind === "location" ? ["plan", "sheet", "check", "repair", "recheck"].map(k => locationRequestId(source.data.taskId, k as "plan" | "sheet" | "check" | "repair" | "recheck")) : [])];
      for (const id of ids) {
        if (repair) await purgeReferenceSpool(id);
        if (await readSpool(id, "image.png") || await readSpool(id, "openai-response.json")) spoolMissing = false;
      }
    }
    cleanup.push({ id: d.id, kind: d.kind, version: d.artifact_version, storageKey: key, storageAbsent: true, databaseAbsent: true,
      localOutputAbsent: source.success ? spoolMissing : "audit_unavailable" });
  }
  // Use existing service-only commands; direct task-table writes are intentionally not granted.
  const stale = w.tasks.filter(t => t.kind === "delete" && t.status === "failed" && !t.lease_token &&
    w.referenceDeletions.some(d => d.id === (t.input.referenceCleanup as { id?: string } | undefined)?.id && d.state === "completed"));
  if (repair && stale.length) {
    await store.rpc("ugc_v3_reconcile_reference_cleanup", { p_owner: owner, p_project: project });
  }
  w = await store.read(owner, project);
  if (v3Digest("approvals", approvals(w)) !== v3Digest("approvals", approvals(before))) throw new Error("V3_REPAIR_APPROVALS_CHANGED");
  console.info(JSON.stringify({ projectId: project, repaired: repair, cleanup, approvedArtifactsPreserved: true, packages: w.packages.length,
    estimates: w.quotes.length, authorizations: w.runtimeAuthorizations.length, providerCalls: 0, videoTransportEnabled: false,
    tasks: w.tasks.filter(t => t.kind === "delete" || t.kind === "package").map(t => ({ id: t.id, kind: t.kind, status: t.status, code: t.error_code })) }, null, 2));
}
void main().catch(error => { console.error(error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "V3_FLOW_REPAIR_FAILED"); process.exitCode = 1; });
