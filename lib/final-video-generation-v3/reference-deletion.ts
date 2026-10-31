import "server-only";
import { z } from "zod";
import { V3Store } from "./runtime-store";
import { privateAssetSchema } from "./runtime-contract";
import { deleteReferencePrivate, purgeReferenceSpool } from "./runtime-media";

const operationSchema = z.object({ id: z.uuid(), state: z.enum(["prepared", "completed"]), lease_token: z.uuid().nullable(),
  source_task_id: z.uuid().nullable(), asset: privateAssetSchema.nullable() });

// Storage cannot participate in the SQL transaction. A durable, worker-ineligible replacement exists before deletion.
export async function permanentlyDeleteReference(store: V3Store, owner: string, project: string,
  target: { kind: "character" | "product"; id: string; version: number }, mode: "regenerate" | "reject", input: unknown, signal: AbortSignal) {
  let value: unknown;
  try {
    value = await store.rpc("ugc_v3_reference_delete_prepare", { p_owner: owner, p_project: project,
      p_kind: target.kind, p_id: target.id, p_version: target.version, p_mode: mode, p_input: input });
  } catch (error) {
    if (error instanceof Error && error.message !== "V3_DATABASE_UNAVAILABLE" && /^(V3_|FRESH_V3_)/.test(error.message)) throw error;
    throw new Error("V3_REFERENCE_REQUEST_RESERVATION_FAILED");
  }
  const op = operationSchema.parse(value);
  if (op.state === "completed") return;
  if (!op.asset || !op.source_task_id || !op.lease_token || op.asset.id !== target.id) throw new Error("V3_REFERENCE_DELETE_SCOPE");
  let phase: "storage" | "spool" | "database" = "storage";
  try {
    await deleteReferencePrivate(owner, project, op.asset, signal);
    phase = "spool";
    await purgeReferenceSpool(op.source_task_id);
    phase = "database";
    if (await store.rpc("ugc_v3_reference_delete_finish", { p_owner: owner, p_project: project, p_id: op.id,
      p_token: op.lease_token, p_error: null }) !== true) throw new Error("V3_REFERENCE_CLEANUP_PENDING");
  } catch (error) {
    const code = phase === "storage" && error instanceof Error && /^V3_(STORAGE_DELETE_|DELETE_|REFERENCE_DELETE_SCOPE)/.test(error.message) ? error.message :
      phase === "storage" ? "V3_REFERENCE_STORAGE_DELETE_FAILED" : phase === "spool" ? "V3_REFERENCE_LOCAL_CLEANUP_FAILED" :
      error instanceof Error && error.message === "V3_CREATIVE_INPUT_STALE" ? "V3_CREATIVE_INPUT_STALE" : "V3_REFERENCE_DELETE_FINALIZE_FAILED";
    // Keep the reserved task held, release this cleanup lease and allow the same confirmed operation to resume.
    try { await store.rpc("ugc_v3_reference_delete_finish", { p_owner: owner, p_project: project, p_id: op.id,
      p_token: op.lease_token, p_error: code }); } catch { /* Durable operation/held task survives; lease expiry enables recovery. */ }
    throw new Error(code);
  }
}
