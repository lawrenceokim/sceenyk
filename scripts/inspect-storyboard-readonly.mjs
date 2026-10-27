// GET-only database inspection and bounded local file reads. No RPC, provider
// generation/retrieval, worker imports, retries, file writes or private content logs.
import nextEnv from "@next/env";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const inheritedModelPresent = process.env.OPENAI_STORYBOARD_MODEL !== undefined;
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function main() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("INSPECTION_CONFIG_MISSING");
  const read = async suffix => {
    const response = await fetch(`${base}/rest/v1/${suffix}`, { method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    const data = await response.json();
    if (!response.ok) throw new Error(`INSPECTION_DATABASE_${/^[A-Z0-9]{5}$|^PGRST\d{3}$/.test(data.code) ? data.code : response.status}`);
    return data;
  };
  const roots = await read("ugc_storyboards?select=*&order=created_at.desc&limit=20");
  console.info(JSON.stringify({ kind: "configuration", model: process.env.OPENAI_STORYBOARD_MODEL ?? null,
    enabled: process.env.UGC_STORYBOARD_ENABLED === "1", recoveryDirectoryConfigured: !!process.env.UGC_STORYBOARD_RECOVERY_DIR,
    inheritedModelOverride: inheritedModelPresent }));
  const safeId = value => typeof value === "string" && /^(?:resp_|req_)[A-Za-z0-9_-]{1,180}$/.test(value) ? value : null;
  for (const row of roots) {
    console.info(JSON.stringify({ kind: "storyboard", id: row.id, jobId: row.job_id, projectId: row.project_id, state: row.state, phase: row.phase,
      version: row.version, revision: row.revision, attempts: row.attempts, model: row.model, error: row.error_code, hasClaim: !!row.claim_token,
      hasDocument: !!row.document, createdAt: row.created_at, updatedAt: row.updated_at, heartbeatAt: row.heartbeat_at,
      requests: (row.requests ?? []).map(request => ({ keys: Object.keys(request), provider: request.provider, model: request.model,
        promptVersion: request.promptVersion, maxOutputTokens: request.maxOutputTokens, hasOutput: typeof request.output === "string",
        outputCharacters: request.output?.length ?? 0, receiptKeys: Object.keys(request.receipt ?? {}), responseId: safeId(request.receipt?.responseId ?? request.responseId),
        requestId: safeId(request.receipt?.requestId ?? request.requestId), status: request.receipt?.status ?? null,
        hasDiagnostic: !!request.diagnostic })) }));
    const directory = process.env.UGC_STORYBOARD_RECOVERY_DIR?.trim() || path.join(os.tmpdir(), "sceenyk-storyboard-recovery-v1");
    const identifiers = [row.owner_user_id, row.project_id, row.job_id, row.id];
    if (!identifiers.every(value => /^[a-f0-9-]{36}$/i.test(value))) throw new Error("INSPECTION_SCOPE_INVALID");
    for (const index of [0, 1]) {
      const target = path.join(directory, `${identifiers.join("_")}_${index}.json`);
      try {
        const stat = await fs.lstat(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_600_000) throw new Error("INSPECTION_FILE_INVALID");
        let value;
        try { value = JSON.parse(await fs.readFile(target, "utf8")); } catch { value = null; }
        console.info(JSON.stringify({ kind: "local_response", storyboardId: row.id, index, exists: true, bytes: stat.size, validJSON: value !== null,
          hasOutput: typeof value?.output === "string", responseId: safeId(value?.receipt?.responseId), requestId: safeId(value?.receipt?.requestId),
          status: value?.receipt?.status ?? null, modifiedAt: stat.mtime.toISOString() }));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        console.info(JSON.stringify({ kind: "local_response", storyboardId: row.id, index, exists: false }));
      }
      for (const kind of ["intent", "headers", "created", "raw", "failure_a1", "failure_a2", "failure_a3"]) {
        const sidecar = target.replace(/\.json$/, `_${kind}.json`);
        try {
          const stat = await fs.lstat(sidecar);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_600_000) throw new Error("INSPECTION_FILE_INVALID");
          const value = JSON.parse(await fs.readFile(sidecar, "utf8"));
          const phase = ["claim_validation", "configuration", "asset_read", "headers", "provider", "stream", "response_capture", "validation", "database", "local_recovery", "deleting", "recovery", "retrieval"].includes(value.phase) ? value.phase : null;
          console.info(JSON.stringify({ kind: "local_metadata", storyboardId: row.id, index, fileKind: kind, exists: true, bytes: stat.size,
            requestId: safeId(value.requestId), responseId: safeId(value.responseId ?? value.id), phase,
            httpStatus: typeof value.httpStatus === "number" && value.httpStatus >= 100 && value.httpStatus <= 599 ? value.httpStatus : null }));
        } catch (error) { if (error.code !== "ENOENT") throw error; }
      }
    }
    const events = await read(`ugc_storyboard_events?select=id,version,state,phase,created_at&storyboard_id=eq.${row.id}&order=id.asc&limit=100`);
    console.info(JSON.stringify({ kind: "events", storyboardId: row.id, events }));
  }
  console.info(JSON.stringify({ readOnly: true, liveWrites: 0, workflowRPCs: 0, providerCalls: 0, workerExecution: 0 }));
}
void main().catch(error => { console.error(JSON.stringify({ code: /^INSPECTION_[A-Z0-9_]+$/.test(error?.message) ? error.message : "INSPECTION_UNAVAILABLE" })); process.exitCode = 1; });
