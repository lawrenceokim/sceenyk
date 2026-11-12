// Operator-only, read-only diagnostics of the environment actually inherited by
// this process. No dotenv loading, queue claims, provider requests or mutations.
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { getDatabaseConfig } from "../lib/db/config";
import { serviceDiagnostic, ServiceOperationError } from "../lib/diagnostics/service-failure";

const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 12);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function main() {
  const args = process.argv.slice(2); let live = false, project: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--live") live = true;
    else if (args[i] === "--project" && uuid.test(args[i + 1] ?? "")) project = args[++i];
    else throw new Error("DIAGNOSTIC_ARGUMENT_INVALID");
  }
  const db = getDatabaseConfig(), endpoint = new URL(db.url);
  console.info(JSON.stringify({ check: "loaded_environment", projectFingerprint: fingerprint(endpoint.hostname),
    credentialFingerprint: fingerprint(db.secretKey), credentialType: db.secretKey.startsWith("sb_secret_") ? "secret" : "service_role_jwt",
    source: "inherited_process_only", expectedPolicyVersion: 114, live, paidRequests: 0,
    flags: Object.fromEntries(["UGC_V3_ENABLED", "UGC_V3_ACCESS_MODE", "UGC_V3_OPENAI_ENABLED", "UGC_V3_HIGGSFIELD_ENABLED"].map(name =>
      [name, ["0", "1", "owned", "operator"].includes(process.env[name] ?? "") ? process.env[name] : "unset_or_invalid"])) }));
  if (!live) return;
  let failed = false;
  const probe = async <T>(check: string, operation: () => Promise<T>) => {
    const started = Date.now();
    try { const result = await operation(); console.info(JSON.stringify({ check, ok: true, elapsedMs: Date.now() - started, result })); return result; }
    catch (error) { failed = true; console.error(JSON.stringify({ check, ok: false, elapsedMs: Date.now() - started, diagnostic: serviceDiagnostic(error, "database", check) })); }
  };
  const read = async (route: string, body?: Record<string, unknown>) => {
    const response = await fetch(`${db.url}/rest/v1/${route}`, { method: body ? "POST" : "GET", cache: "no-store",
      headers: { apikey: db.secretKey, Authorization: `Bearer ${db.secretKey}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) });
    const data = await response.json();
    if (!response.ok) throw new ServiceOperationError(data, "database", "diagnostic_read", undefined, undefined, response.status);
    return data;
  };
  // The HTTP probe has its own bounded DNS/connect deadline. Keep standalone
  // DNS lookup from leaving this operator command hanging on a resolver outage.
  await probe("dns", async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const addresses = await Promise.race([lookup(endpoint.hostname, { all: true }), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("DNS_TIMEOUT"), { code: "ETIMEDOUT" })), 10000);
      })]);
      return { families: [...new Set(addresses.map(a => a.family))] };
    } finally { clearTimeout(timer); }
  });
  await probe("database_read", async () => { await read("app_users?select=id&limit=0"); return { authenticated: true }; });
  await probe("worker_discovery", async () => {
    const rows = await read("rpc/ugc_v3_worker_projects", { p_owner: null, p_after: null, p_limit: 32, p_submit: process.env.UGC_V3_HIGGSFIELD_ENABLED === "1" });
    if (!Array.isArray(rows)) throw new Error("DISCOVERY_CONTRACT_INVALID");
    return { candidates: rows.length, claimsMade: 0 };
  });
  // Use a real owned V3 row to inspect the installed read-only funding policy.
  const projects = await probe("project_lookup", async () => {
    const rows = await read(`ugc_v3_projects?select=project_id,owner_user_id&${project ? `project_id=eq.${project}` : "order=created_at.desc"}&limit=1`);
    if (!Array.isArray(rows) || !rows[0]) throw new Error("DIAGNOSTIC_PROJECT_REQUIRED");
    return rows.map((p: { project_id: string; owner_user_id: string }) => ({ project_id: p.project_id, owner_user_id: p.owner_user_id }));
  });
  const selected = projects?.[0];
  if (selected) {
    await probe("migration_114_policy", async () => {
      const access = await read("rpc/generation_project_access", { p_owner: selected.owner_user_id, p_project: selected.project_id });
      if (access?.policyVersion !== 114) throw new ServiceOperationError({ code: "PGRST202" }, "database", "migration_114_policy");
      return { policyVersion: access.policyVersion, funding: access.funding, videoAllowed: access.videoAllowed, blocker: access.paidBlocker,
        catalogAudit: "Use scripts/verify-v3-setup.sql for function bodies, constraints and grants." };
    });
    if (project) await probe("saved_video_state", async () => {
      const suffix = `project_id=eq.${project}&order=created_at.desc&limit=8`;
      const runs = await read(`ugc_v3_runs?select=id,state,error_code,observation&${suffix}`);
      const tasks = await read(`ugc_v3_tasks?select=id,status,provider_started,lease_until,error_code&kind=eq.video&${suffix}`);
      const authorizations = await read(`ugc_v3_run_authorizations?select=id&${suffix}`);
      const reservations = await read(`generation_paid_reservations?select=run_id,state,credits,dispatched_at&${suffix}`);
      return { project, recentLimit: 8, runs: runs.map((r: { id: string; state: string; error_code: string | null; observation?: { requestId?: unknown } }) =>
        ({ id: r.id, state: r.state, errorCode: r.error_code, providerRequestRecorded: !!r.observation?.requestId })), tasks, authorizations, reservations };
    });
  }
  process.exitCode = failed ? 1 : 0;
}
void main().catch(error => {
  console.error(JSON.stringify({ check: "diagnostic_setup", ok: false, diagnostic: serviceDiagnostic(error, "database", "configuration") }));
  process.exitCode = 1;
});
