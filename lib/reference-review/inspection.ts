import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { UgcWorkerDatabaseError } from "@/lib/ugc-jobs/database-diagnostics";
import { regenerationDiagnosticSchema } from "./diagnostics";

// Explicit local diagnostic mode. SELECTs only: no claim/resume/update, provider,
// storage-body read or worker construction. Never spread database/checkpoint data.
export async function inspectReferenceRegeneration(jobId: string) {
  z.uuid().parse(jobId);
  const db = createDatabaseClient();
  const job = await db.from("ugc_generation_jobs").select("id,project_id,status,stage,pause_reason").eq("id", jobId).single();
  if (job.error) throw new UgcWorkerDatabaseError(job.error, "regeneration_read", job.status);
  const roots = await db.from("ugc_reference_reviews").select("*").eq("job_id", jobId);
  if (roots.error) throw new UgcWorkerDatabaseError(roots.error, "regeneration_read", roots.status);
  const groups = [];
  for (const root of roots.data ?? []) {
    const requests = await db.from("ugc_reference_regeneration_requests").select("id,view,state,requested_version,checkpoint,replacement_asset")
      .eq("review_id", root.id).order("requested_version");
    if (requests.error) throw new UgcWorkerDatabaseError(requests.error, "regeneration_read", requests.status);
    const diagnostic = regenerationDiagnosticSchema.safeParse(root.execution_diagnostic);
    groups.push({ reviewId: root.id, type: root.reference_type, version: root.version, composedVersion: root.composed_version,
      state: root.execution_state ?? null, attempts: root.execution_attempts ?? null, phase: root.execution_phase ?? null,
      safeError: root.execution_error ?? null, diagnostic: diagnostic.success ? diagnostic.data : null,
      heartbeatAt: root.heartbeat_at ?? null, leaseExpiresAt: root.lease_expires_at ?? null, leaseTokenPresent: !!root.execution_token,
      approvedVersion: root.approved_version,
      recovery: requests.data.length > 0 && requests.data.every(request => request.state === "completed" && request.replacement_asset) ?
        "stored_views_only" : "inspect_pending_provider_checkpoints",
      requests: requests.data.map(request => {
        const op = request.checkpoint && typeof request.checkpoint === "object" ? request.checkpoint as Record<string, unknown> : {};
        const state = z.enum(["intent", "accepted", "rejected", "received", "completed", "failed"]).safeParse(op.state);
        const provider = z.uuid().safeParse(op.providerId);
        return { requestId: request.id, view: request.view, version: request.requested_version, state: request.state,
          replacementStored: !!request.replacement_asset, checkpointState: state.success ? state.data : null,
          providerRequestId: provider.success ? provider.data : null };
      }),
    });
  }
  return { readOnly: true, job: job.data, groups };
}
