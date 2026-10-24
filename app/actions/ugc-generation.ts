"use server";

import { unstable_rethrow } from "next/navigation";
import { enqueueOwnedUgcJob, getOwnedUgcReadiness, type UgcEnqueueResult } from "@/lib/ugc-jobs/server";
import { ugcInputIssue, type UgcReadiness } from "@/lib/ugc-jobs/input-contract";

export async function ugcReadinessAction(projectId: unknown): Promise<UgcReadiness> {
  try { return await getOwnedUgcReadiness(projectId); }
  catch (error) {
    unstable_rethrow(error);
    return { ready: false, issues: [ugcInputIssue("READINESS_UNAVAILABLE")] };
  }
}
export async function enqueueUgcGenerationAction(input: unknown): Promise<UgcEnqueueResult> {
  try { return await enqueueOwnedUgcJob(input); }
  catch (error) {
    unstable_rethrow(error);
    return { ok: false, issues: [ugcInputIssue("READINESS_UNAVAILABLE")] };
  }
}
