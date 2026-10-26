// Read-only REST/schema access. Does not execute workflow RPCs or modify schema/data.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const base = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
async function read(path) {
  const response = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  return { status: response.status, data };
}
try {
  const schema = await read("");
  console.info(JSON.stringify({ phase: "catalog_access", status: schema.status,
    catalogCandidates: Object.keys(schema.data.paths || {}).filter(path => /catalog|schema|function|query|sql|migration/i.test(path)) }));
  for (const [table, column] of [["ugc_locations", "diagnostic"], ["ugc_locations", "recovery_only"], ["ugc_locations", "explicit_generation_at"],
    ["ugc_location_candidates", "output_proof"], ["ugc_location_events", "error_code"], ["ugc_location_events", "diagnostic"]]) {
    const result = await read(`${table}?select=${column}&limit=0`);
    console.info(JSON.stringify({ table, column, status: result.status, code: result.data?.code ?? null }));
  }
  const roots = await read("ugc_locations?select=id,job_id,revision,version,state,candidate_id&order=created_at&limit=12");
  console.info(JSON.stringify({ phase: "location_records", status: roots.status, records: roots.status === 200 ? roots.data : undefined, code: roots.data?.code }));
  console.info(JSON.stringify({ providerCalls: 0, workflowRPCs: 0, mutations: 0 }));
} catch { console.error("LOCATION_CATALOG_READ_UNAVAILABLE"); process.exitCode = 1; }
