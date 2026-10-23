import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import { ugcGenerationSnapshotSchema } from "@/lib/ugc-jobs/input-contract";
import { validateUgcGenerationInput } from "@/lib/ugc-jobs/validation";
import type { UgcStageHandler } from "@/lib/ugc-jobs/runner";
import { loadReferenceImage, ReferenceMediaError } from "./media";
import { createReferenceAnalysisProvider } from "./factory";
import type { ReferenceAnalysisProvider } from "./provider";
import { parseReferenceAnalysis, referenceAnalysisVersion, referencePromptVersion, referenceRoles, referenceUsageSchema } from "./contract";

export const analyzeJobReferences: UgcStageHandler = async ({ job, signal }) => {
  const parsed = ugcGenerationSnapshotSchema.safeParse(job.input_snapshot);
  if (!parsed.success || !job.claim_token || job.analysis_version !== null && job.analysis_version !== referenceAnalysisVersion) {
    return { kind: "fail", code: "INPUT_VALIDATION_FAILED" };
  }
  const snapshot = parsed.data;
  // Re-resolve exact frozen assets/ownership/ETags, never substitute current drafts.
  const validation = await validateUgcGenerationInput(job.project_id, job.owner_user_id, { snapshot });
  if (!validation.ready) return { kind: "fail", code: "REFERENCE_ASSET_UNAVAILABLE", retryable: true };
  const db = createDatabaseClient();
  const saved = await db.from("ugc_reference_analyses").select("*").eq("job_id", job.id)
    .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).eq("state", "completed");
  if (saved.error) throw new Error("REFERENCE_CHECKPOINT_UNAVAILABLE");
  const completed = new Set<string>();
  try {
    for (const row of saved.data) {
      if (row.analysis_version !== referenceAnalysisVersion || row.prompt_version !== referencePromptVersion || row.provider !== "openai" ||
        row.source_asset_id !== snapshot[row.analysis_type].assetId || row.requested_model !== job.analysis_model) throw new Error("REFERENCE_CHECKPOINT_INVALID");
      parseReferenceAnalysis(row.analysis_type, row.analysis);
      referenceUsageSchema.parse(row.usage);
      completed.add(row.analysis_type);
    }
  } catch { return { kind: "fail", code: "REFERENCE_OUTPUT_INVALID" }; }
  if (completed.size === referenceRoles.length) return { kind: "references_analyzed" };
  let provider: ReferenceAnalysisProvider;
  try { provider = createReferenceAnalysisProvider(job.analysis_model ?? undefined); }
  catch { return { kind: "fail", code: "REFERENCE_CONFIG_INVALID", retryable: true }; }

  // Decode/load both missing sources before spending on either. A successful
  // saved role is reusable and never decoded or submitted to the provider again.
  const images = new Map<string, Buffer>();
  try {
    for (const role of referenceRoles) if (!completed.has(role)) images.set(role, await loadReferenceImage(job, snapshot, role, signal));
  } catch (error) {
    return { kind: "fail", code: error instanceof ReferenceMediaError ? error.code : "REFERENCE_ASSET_UNAVAILABLE", retryable: !(error instanceof ReferenceMediaError) || error.code === "REFERENCE_ASSET_UNAVAILABLE" };
  }
  for (const role of referenceRoles) {
    if (completed.has(role)) continue;
    signal.throwIfAborted();
    const begin = await db.rpc("ugc_begin_reference_analysis", { p_job_id: job.id, p_claim_token: job.claim_token, p_role: role, p_model: provider.model });
    if (begin.error) throw new Error("REFERENCE_SUBMISSION_INTENT_UNAVAILABLE");
    if (begin.data !== "SUBMIT") return { kind: "fail", code: "RECONCILIATION_REQUIRED" };
    // Once intent is durable, all ambiguous outcomes are fenced against replay.
    // Abort after begin also leaves an intent; never claim no request occurred.
    signal.throwIfAborted();
    const result = await provider.analyze(role, images.get(role)!, signal, snapshot.schemaVersion === 3 ? snapshot[role].name : undefined);
    const stored = await db.rpc("ugc_finish_reference_analysis", {
      p_job_id: job.id, p_claim_token: job.claim_token, p_role: role,
      p_analysis: result.ok ? parseReferenceAnalysis(role, result.analysis) : null,
      p_usage: result.usage === null ? null : referenceUsageSchema.parse(result.usage),
      p_error_code: result.ok ? null : result.code,
    });
    images.delete(role);
    if (stored.error || !stored.data) throw new Error("REFERENCE_CHECKPOINT_UNAVAILABLE");
    if (!result.ok) return { kind: "fail", code: result.code, retryable: result.retryable };
  }
  return { kind: "references_analyzed" };
};
