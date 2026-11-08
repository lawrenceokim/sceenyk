import "server-only";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { V3Store } from "./runtime-store";
import { runV3Task } from "./worker";
import { assertV3Access, v3OwnedAccessEnabled, v3RuntimeEnabled, v3TransportConfig } from "./runtime-config";
import { withV3ConnectionRecovery } from "./connection-recovery";
import { ServiceOperationError, type ServiceDiagnostic } from "@/lib/diagnostics/service-failure";

const projectSchema = z.object({ project_id: z.uuid(), owner_user_id: z.uuid() });
export type WorkerProject = z.infer<typeof projectSchema>;
type ProcessProject = (project: WorkerProject, signal: AbortSignal) => Promise<unknown>;

export class V3ProjectPool {
  private active = new Map<string, Promise<unknown>>();
  constructor(private readonly concurrency: number, private readonly processProject: ProcessProject,
    private readonly failure: (project: WorkerProject, error: unknown) => void = () => {}) {}
  get size() { return this.active.size; }
  schedule(project: WorkerProject, signal: AbortSignal) {
    if (signal.aborted || this.active.has(project.project_id) || this.active.size >= this.concurrency) return false;
    const work = Promise.resolve().then(() => this.processProject(project, signal))
      .catch(error => { this.failure(project, error); }).finally(() => this.active.delete(project.project_id));
    this.active.set(project.project_id, work);
    return true;
  }
  drain() { return Promise.allSettled(this.active.values()); }
}

// Keyset pages and a bounded pool prevent one user's long task from owning the queue.
export async function processV3QueueBatch(store: V3Store, options: {
  after: string | null; ownerId: string | null; concurrency: number; signal: AbortSignal; pausedProjects?: Set<string>;
}, processProject: ProcessProject = (p, signal) => runV3Task(p.project_id, p.owner_user_id, store, AbortSignal.any([signal, AbortSignal.timeout(14 * 60_000)]))) {
  const projects = z.array(projectSchema).parse(await store.rpc("ugc_v3_worker_projects", {
    p_owner: options.ownerId, p_after: options.after, p_limit: 32, p_submit: v3TransportConfig().enabled,
  }));
  let cursor = 0;
  const failures: { projectId: string; code: string; diagnostic?: ServiceDiagnostic }[] = [];
  await Promise.all(Array.from({ length: Math.min(Math.max(1, options.concurrency), projects.length) }, async () => {
    while (cursor < projects.length && !options.signal.aborted) {
      const project = projects[cursor++];
      if (options.pausedProjects?.has(project.project_id)) continue;
      try {
        assertV3Access(project.owner_user_id);
        await processProject(project, options.signal);
      } catch (error) {
        const code = error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "V3_WORKER_PROJECT_UNAVAILABLE";
        if (error instanceof ServiceOperationError && !error.diagnostic.retryable) options.pausedProjects?.add(project.project_id);
        failures.push({ projectId: project.project_id, code, ...(error instanceof ServiceOperationError ? { diagnostic: error.diagnostic } : {}) });
      }
    }
  }));
  return { after: projects.at(-1)?.project_id ?? null, count: projects.length, failures };
}

export async function runV3BackgroundWorker(args: string[]) {
  if (process.env.UGC_V3_WORKER_ENABLED !== "1" || !v3RuntimeEnabled() || !v3OwnedAccessEnabled() || process.env.VERCEL === "1" ||
    args.some(a => a !== "--once")) throw new Error("V3_BACKGROUND_WORKER_SETUP_REQUIRED");
  const concurrency = z.coerce.number().int().min(1).max(8).parse(process.env.UGC_V3_WORKER_CONCURRENCY ?? "2");
  const root = path.resolve(process.env.UGC_V3_RECOVERY_DIR || ".ugc-v3-recovery");
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error("V3_SPOOL_SCOPE");
  const heartbeatFile = path.join(root, "worker-heartbeat.json");
  const heartbeat = () => fs.writeFile(heartbeatFile, JSON.stringify({ at: new Date().toISOString() }), { mode: 0o600 });
  await heartbeat();
  const shutdown = new AbortController(), stop = () => shutdown.abort();
  for (const name of ["SIGINT", "SIGTERM"] as const) process.once(name, stop);
  const pulse = setInterval(() => { void heartbeat().catch(() => shutdown.abort()); }, 10_000);
  const lastFailure = new Map<string, string>();
  console.info("V3_BACKGROUND_WORKER_READY", { access: "owned", concurrency, newPaidSubmissions: v3TransportConfig().enabled, recovery: true });
  const store = new V3Store();
  const pausedProjects = new Set<string>();
  const pool = new V3ProjectPool(concurrency, (project, signal) => runV3Task(project.project_id, project.owner_user_id, store, signal), (project, error) => {
    const code = error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "V3_WORKER_PROJECT_UNAVAILABLE";
    if (error instanceof ServiceOperationError && !error.diagnostic.retryable) pausedProjects.add(project.project_id);
    if (lastFailure.get(project.project_id) !== code) console.error("V3_BACKGROUND_PROJECT_PAUSED", JSON.stringify({ projectId: project.project_id, code,
      ...(error instanceof ServiceOperationError ? { diagnostic: error.diagnostic } : {}) }));
    if (lastFailure.size >= 1024) lastFailure.delete(lastFailure.keys().next().value!);
    lastFailure.set(project.project_id, code);
  });
  let after: string | null = null;
  try {
    do {
      const result = await withV3ConnectionRecovery(() => processV3QueueBatch(store, { after, ownerId: null, concurrency, signal: shutdown.signal, pausedProjects }, async project => {
        if (pool.size >= concurrency) return;
        pool.schedule(project, AbortSignal.any([shutdown.signal, AbortSignal.timeout(14 * 60_000)]));
      }), { signal: shutdown.signal, once: args.includes("--once") });
      if (!result) break;
      after = result.after;
      for (const failure of result.failures) {
        if (lastFailure.get(failure.projectId) !== failure.code) console.error("V3_BACKGROUND_PROJECT_PAUSED", JSON.stringify(failure));
        if (lastFailure.size >= 1024) lastFailure.delete(lastFailure.keys().next().value!);
        lastFailure.set(failure.projectId, failure.code);
      }
      if (args.includes("--once") || shutdown.signal.aborted) break;
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); shutdown.signal.removeEventListener("abort", done); resolve(); };
        const timer = setTimeout(done, result.count ? 1000 : 3000);
        shutdown.signal.addEventListener("abort", done, { once: true });
      });
    } while (!shutdown.signal.aborted);
  } finally {
    await pool.drain();
    clearInterval(pulse);
    for (const name of ["SIGINT", "SIGTERM"] as const) process.removeListener(name, stop);
  }
}
