import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { localJobsOnly } from "@/lib/workflows/execution-policy";
import { assertV3Access, v3OwnedAccessEnabled, v3TransportConfig } from "./runtime-config";
import { runV3Task } from "./worker";
import { V3Store } from "./runtime-store";
import { processV3QueueBatch } from "./background-worker";
import { withV3ConnectionRecovery } from "./connection-recovery";
import { v3DatabaseFailure } from "./database-errors";

export function referenceContractDiagnostic() {
  return { active: process.env.UGC_V3_ENABLED === "1", provider: "openai", model: process.env.OPENAI_V3_IMAGE_MODEL?.trim() || null,
    enabled: process.env.UGC_V3_OPENAI_ENABLED === "1", roles: ["character", "product", "location"], fallback: false };
}
export async function runLocalV3Worker(args: string[]) {
  if (!process.env.NODE_ENV) Object.assign(process.env, { NODE_ENV: "development" });
  if (!localJobsOnly() || process.env.RENDER === "true" || process.env.VERCEL === "1") throw new Error("V3_LOCAL_WORKER_SETUP_REQUIRED");
  const projectIndex = args.indexOf("--project"), projectId = projectIndex < 0 ? undefined : args[projectIndex + 1];
  const supported = args.filter((_, index) => projectIndex < 0 || index !== projectIndex && index !== projectIndex + 1);
  if (projectIndex >= 0 && !z.uuid().safeParse(projectId).success || supported.some(a => a !== "--once")) throw new Error("V3_WORKER_ARGUMENT_INVALID");
  const owner = v3OwnedAccessEnabled() ? null : z.uuid().parse(process.env.UGC_V3_OPERATOR_USER_ID);
  if (owner) assertV3Access(owner);
  console.info("V1_CHARACTER_CONTRACT", { active: false, reason: "V3_registry_only_use_legacy_flag_for_historical_work" });
  console.info("V3_REFERENCE_CONTRACT", referenceContractDiagnostic());
  console.info("V3_VIDEO_SUBMISSION_POLICY", { enabled: v3TransportConfig().enabled, configuredSwitch: process.env.UGC_V3_HIGGSFIELD_ENABLED === "1" ? "1" : "0",
    environmentLoadedAtStartup: true, acceptedRequestRecoveryEnabled: true });
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, stop);
  try {
    console.info("UGC_LOCAL_V3_WORKER_READY");
    let after: string | null = null;
    const pausedProjects = new Set<string>();
    do {
      const completed = await withV3ConnectionRecovery(async () => {
      if (!projectId) {
        const result = await processV3QueueBatch(new V3Store(), { after, ownerId: owner, concurrency: 2, signal: shutdown.signal, pausedProjects });
        after = result.after;
        for (const failure of result.failures) console.error("V3_WORKER_PROJECT_PAUSED", JSON.stringify(failure));
      } else {
        const db = createDatabaseClient() as unknown as { from(table: string): {
          select(columns: string): { eq(column: string, value: string): PromiseLike<{ data: unknown; error: unknown }> & { eq(column: string, value: string): PromiseLike<{ data: unknown; error: unknown }> } };
        } };
        const query = db.from("ugc_v3_projects").select("project_id,owner_user_id").eq("project_id", projectId);
        const result = await (owner ? query.eq("owner_user_id", owner) : query);
        if (result.error) v3DatabaseFailure(result.error, "worker_registry");
        const projects = z.array(z.object({ project_id: z.uuid(), owner_user_id: z.uuid() })).parse(result.data);
        if (projectId && !projects.length) throw new Error("FRESH_V3_PROJECT_REQUIRED");
        for (const project of projects) {
          if (shutdown.signal.aborted) break;
          await runV3Task(project.project_id, project.owner_user_id, undefined, AbortSignal.any([shutdown.signal, AbortSignal.timeout(14 * 60_000)]));
        }
      }
      return true;
      }, { signal: shutdown.signal, once: args.includes("--once") });
      if (!completed) break;
      if (args.includes("--once") || shutdown.signal.aborted) break;
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); shutdown.signal.removeEventListener("abort", done); resolve(); };
        const timer = setTimeout(done, 3000); shutdown.signal.addEventListener("abort", done, { once: true });
      });
    } while (!shutdown.signal.aborted);
  } finally { for (const signal of ["SIGINT", "SIGTERM"] as const) process.removeListener(signal, stop); }
}
