import "server-only";
import { z } from "zod";
import { readAppUser } from "@/lib/auth/read-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { getLatestProjectGenerations } from "@/lib/generation/server";
import { V3Store } from "@/lib/final-video-generation-v3/runtime-store";
import type { ProjectCardStatus } from "./card-status";

const approvalSnapshot = z.object({
  project: z.object({ project_id: z.uuid(), owner_user_id: z.uuid() }),
  packages: z.array(z.object({ id: z.uuid(), document: z.object({ segments: z.array(z.unknown()) }) })),
  runs: z.array(z.object({ package_id: z.uuid(), state: z.string(), completed_at: z.string().nullable(), result: z.unknown() })),
  artifacts: z.array(z.object({ kind: z.string(), approved_at: z.string().nullable(), rejected_at: z.string().nullable() })),
});

export async function getProjectCardStatuses(input: unknown): Promise<Record<string, ProjectCardStatus>> {
  const user = await readAppUser();
  // This existing read validates bounded IDs and filters them to the owner.
  const jobs = await getLatestProjectGenerations(input), ids = Object.keys(jobs);
  if (!ids.length) return {};
  const db = createDatabaseClient(), store = new V3Store();
  const legacy = await db.from("ugc_final_executions").select("project_id")
    .eq("owner_user_id", user.id).in("project_id", ids).eq("state", "approved").not("approved_at", "is", null);
  const legacyApproved = new Set(legacy.data?.map(row => row.project_id) ?? []);
  if (legacy.error) console.error("Legacy project approval status unavailable", { code: legacy.error.code });
  return Object.fromEntries(await Promise.all(ids.map(async id => {
    if (legacyApproved.has(id)) return [id, "final_approved"] as const;
    const data = await store.rpc("ugc_v3_runtime_read", { p_owner: user.id, p_project: id }).catch(() => undefined);
    if (data === undefined) return [id, jobs[id]?.status ?? "unavailable"] as const;
    if (data === null) return [id, jobs[id]?.status ?? (legacy.error ? "unavailable" : null)] as const;
    const parsed = approvalSnapshot.safeParse(data);
    if (!parsed.success || parsed.data.project.project_id !== id || parsed.data.project.owner_user_id !== user.id)
      return [id, "unavailable"] as const;
    const snapshot = parsed.data;
    const approved = snapshot.runs.some(run => run.state === "approved" && !!run.completed_at && !!run.result &&
      snapshot.packages.some(pkg => pkg.id === run.package_id && pkg.document.segments.length === 1)) ||
      snapshot.artifacts.some(artifact => artifact.kind === "joined" && !!artifact.approved_at && !artifact.rejected_at);
    return [id, approved ? "final_approved" : jobs[id]?.status ?? null] as const;
  })));
}
