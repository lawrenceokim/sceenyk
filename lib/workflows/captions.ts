import "server-only";
import { NonRetriableError } from "inngest";
import { createDatabaseClient } from "@/lib/db/server";
import { buildOrReuseCaptions } from "@/lib/captions/server";
import { generationEventSchema } from "@/lib/generation/dispatch-contract";
import { inngest } from "./client";

export const captionsRequested = "sceenyk/generation.captions.requested";
export const captionsWorkflow = inngest.createFunction({
  id: "generation-captions", triggers: { event: captionsRequested }, retries: 4,
}, async ({ event, step }) => {
  const parsed = generationEventSchema.safeParse(event.data);
  if (!parsed.success) throw new NonRetriableError("INVALID_CAPTION_EVENT");
  const trackId = await step.run("build-or-reuse-caption-track", () => buildOrReuseCaptions(parsed.data.generationJobId));
  return { trackId };
});
// Fresh events recover delivery failures; the DB serializes immutable writes.
// Includes older ready compositions without restarting any production stage.
export const captionsRecovery = inngest.createFunction({
  id: "caption-reconciliation", triggers: { cron: "* * * * *" }, retries: 4, concurrency: 1,
}, async ({ step }) => {
  const candidates = await step.run("load-caption-candidates", async () => {
    const result = await createDatabaseClient().rpc("caption_dispatch_candidates");
    if (result.error) throw new Error("CAPTIONS_UNAVAILABLE");
    return result.data;
  });
  for (const candidate of candidates) await step.sendEvent(`captions-${candidate.job_id}`, {
    name: captionsRequested, data: { generationJobId: candidate.job_id },
  });
  return { inspected: candidates.length };
});
