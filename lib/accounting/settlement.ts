import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { verifyStoredMedia } from "@/lib/storage/server";

const resultSchema = z
  .object({
    jobId: z.uuid(),
    runId: z.string().min(1).max(200),
    mimeType: z.enum(["video/mp4", "video/webm"]),
    sizeBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

// Trusted worker adapter only: no action/route exposes this operation. The
// future renderer must validate a usable video and publish it immutably first.
// Existing worker has no output and must continue through failure restoration.
export async function completeStoredGeneration(
  input: unknown,
): Promise<boolean> {
  const result = resultSchema.parse(input);
  const database = createDatabaseClient();
  const { data: job, error } = await database
    .from("generation_jobs")
    .select("id,owner_user_id,worker_run_id,status,current_stage,accounting_version")
    .eq("id", result.jobId)
    .eq("worker_run_id", result.runId)
    .maybeSingle();
  if (error) throw new Error("SETTLEMENT_DATABASE_UNAVAILABLE");
  if (
    !job ||
    job.accounting_version !== 1 ||
    (job.status !== "completed" &&
      (job.status !== "processing" || job.current_stage !== "rendering"))
  )
    return false;
  const extension = result.mimeType === "video/mp4" ? "mp4" : "webm";
  const key = `users/${job.owner_user_id}/generations/${job.id}/result.${extension}`;
  const stored = await verifyStoredMedia(key, result.mimeType, result.sizeBytes);
  if (stored.status !== "verified") return false;
  const { data: completed, error: completionError } = await database.rpc(
    "complete_generation_with_result",
    {
      p_job_id: job.id,
      p_run_id: result.runId,
      p_storage_key: key,
      p_mime_type: result.mimeType,
      p_size_bytes: result.sizeBytes,
      p_etag: stored.etag,
    },
  );
  if (completionError) throw new Error("SETTLEMENT_DATABASE_UNAVAILABLE");
  return completed;
}
