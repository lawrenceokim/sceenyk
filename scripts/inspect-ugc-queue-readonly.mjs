// GET-only diagnostic. Never imports a worker/provider, invokes RPCs, writes
// database/storage, or prints credentials, prompts, signed URLs or claim tokens.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function main() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("INSPECTION_CONFIG_MISSING");
  async function read(path) {
    const response = await fetch(`${base}/rest/v1/${path}`, { method: "GET",
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    const value = await response.json();
    if (!response.ok) { console.info(JSON.stringify({ read: path.split("?")[0], status: response.status, code: value.code ?? null })); return null; }
    return value;
  }
  const schema = await read("");
  const names = ["ugc_location_claim", "ugc_location_checkpoint", "ugc_location_recovery_claim", "ugc_location_cleanup_claim",
    "ugc_storyboard_input", "ugc_storyboard_action", "ugc_storyboard_claim", "ugc_storyboard_checkpoint"];
  console.info(JSON.stringify({ kind: "configuration", localOnly: process.env.SCEENYK_LOCAL_JOBS_ONLY !== "0",
    locationEnabled: process.env.UGC_LOCATION_ENABLED === "1", storyboardEnabled: process.env.UGC_STORYBOARD_ENABLED === "1",
    storyboardModelConfigured: !!process.env.OPENAI_STORYBOARD_MODEL?.trim(), openAIKeyConfigured: !!process.env.OPENAI_API_KEY?.trim(),
    rpcs: names.map(name => ({ name, exposed: !!schema?.paths?.[`/rpc/${name}`] })) }));
  for (const [table, fields, order, project] of [
    ["ugc_generation_jobs", "id,project_id,status,stage,resume_stage,pause_reason,error_code,retry_eligible,attempt_count,max_attempts,claim_token,worker_id,heartbeat_at,lease_expires_at,cancellation_requested_at,created_at,updated_at", "created_at.desc", row => ({ ...row, claim_token: undefined, hasClaim: !!row.claim_token })],
    ["ugc_locations", "id,job_id,project_id,revision,version,state,phase,error_code,diagnostic,candidate_id,accepted_candidate_id,approved_at,claim_token,worker_id,heartbeat_at,lease_expires_at,recovery_only,requested_at,created_at,updated_at", "created_at.desc", row => ({ ...row, claim_token: undefined, hasClaim: !!row.claim_token })],
    ["ugc_location_candidates", "id,location_id,state,intent,receipt,artifact,output_proof,rejected_at,deleted_at,created_at", "created_at.desc", row => ({ id: row.id, locationId: row.location_id, state: row.state, hasIntent: !!row.intent, hasReceipt: !!row.receipt, hasArtifact: !!row.artifact, hasOutputProof: !!row.output_proof, rejectedAt: row.rejected_at, deletedAt: row.deleted_at, createdAt: row.created_at })],
    ["ugc_storyboards", "id,job_id,project_id,revision,version,state,phase,model,attempts,error_code,approved_at,claim_token,worker_id,heartbeat_at,lease_expires_at,requests,document,created_at,updated_at", "created_at.desc", row => ({ ...row, claim_token: undefined, document: undefined,
      hasClaim: !!row.claim_token, hasDocument: !!row.document, requests: (row.requests ?? []).map(request => ({ model: request.model, promptVersion: request.promptVersion, hasOutput: typeof request.output === "string", outputCharacters: request.output?.length ?? 0, responseStatus: request.receipt?.status ?? null })) })],
    ["ugc_character_v5_workflows", "id,job_id,project_id,state,version,approved_at", "created_at.desc", row => row],
    ["ugc_reference_reviews", "id,job_id,project_id,reference_type,version,composed_version,approved_version,approved_at", "created_at.desc", row => row],
    ["ugc_generation_job_events", "id,job_id,status,stage,event_type,created_at", "id.desc", row => row],
    ["ugc_location_events", "id,location_id,version,state,phase,error_code,diagnostic,created_at", "id.desc", row => row],
    ["ugc_storyboard_events", "id,storyboard_id,version,state,phase,created_at", "id.desc", row => row],
  ]) {
    const rows = await read(`${table}?select=${fields}&order=${order}&limit=100`);
    if (rows) console.info(JSON.stringify({ kind: table, count: rows.length, records: (table.endsWith("_events") ? rows.slice(0, 8) : rows).map(project) }));
  }
  const nullFilter = await read("ugc_location_candidates?select=id&id=eq.null&location_id=eq.null&limit=1");
  console.info(JSON.stringify({ kind: "empty_claim_candidate_read", successful: nullFilter !== null }));
  console.info(JSON.stringify({ readOnly: true, workflowRPCs: 0, writes: 0, providerCalls: 0, storageRequests: 0 }));
}
main().catch(error => { console.error(JSON.stringify({ readOnly: true, code: error?.message === "INSPECTION_CONFIG_MISSING" ? error.message : "INSPECTION_TRANSPORT_FAILED" })); process.exitCode = 1; });
