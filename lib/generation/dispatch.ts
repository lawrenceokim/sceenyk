import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import { inngest, workflowDevelopmentMode } from "@/lib/workflows/client";
import { generationRequested } from "./dispatch-contract";

export function dispatchLog(
  stage: string,
  generationJobId: string,
  attempt?: number,
) {
  console.info("Generation workflow.", {
    stage,
    generationJobId,
    event: generationRequested,
    ...(attempt === undefined ? {} : { attempt }),
  });
}

// Trusted internal function only. Caller must have verified owned creation or
// be the signature-protected reconciliation workflow; never a public action.
export async function dispatchGeneration(generationJobId: string) {
  const database = createDatabaseClient();
  const reserved = await database.rpc("reserve_generation_dispatch", {
    p_job_id: generationJobId,
  });
  if (reserved.error) throw new Error("DISPATCH_DATABASE_UNAVAILABLE");
  const attempt = reserved.data;
  if (!attempt) return;
  dispatchLog("dispatch_attempt", generationJobId, attempt);
  let success = false;
  try {
    // Missing setup must not result in an implicit send to some other mode.
    if (!workflowDevelopmentMode() && !process.env.INNGEST_EVENT_KEY)
      throw new Error("WORKFLOW_NOT_CONFIGURED");
    await inngest.send({
      id: `${generationJobId}:${attempt}`,
      name: generationRequested,
      data: { generationJobId },
    });
    success = true;
  } catch {
    // Never log SDK exceptions: they may contain a URL or upstream response.
    dispatchLog("dispatch_failed", generationJobId, attempt);
  }
  const acknowledged = await database.rpc("acknowledge_generation_dispatch", {
    p_job_id: generationJobId,
    p_attempt: attempt,
    p_success: success,
  });
  if (acknowledged.error) throw new Error("DISPATCH_ACK_UNAVAILABLE");
  if (success) dispatchLog("dispatch_accepted", generationJobId, attempt);
  // Inngest retries the cron step. The DB cooldown still prevents hot retries.
  if (!success) throw new Error("DISPATCH_TEMPORARILY_UNAVAILABLE");
}

// The persisted request is successful even if dispatch or its acknowledgement
// fails. DB outbox + cron recover both uncertainty windows after process exit.
export async function attemptGenerationDispatch(generationJobId: string) {
  try {
    await dispatchGeneration(generationJobId);
  } catch {
    dispatchLog("dispatch_pending_recovery", generationJobId);
  }
}
