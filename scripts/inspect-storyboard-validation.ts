// Read-only Supabase GET + local reads; pure TS and isolated SQL validation.
// No providers, RPCs, workers, retries, live records/files writes or prose logs.
import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PGlite } from "@electric-sql/pglite";
import { storyboardSchema, storyboardBinding, inspectPreparedStoryboard, type StoryboardRow } from "../lib/storyboard/contract";
import { inspectStoryboard } from "../lib/storyboard/validation";
import { schemaValidationIssues } from "../lib/storyboard/validation-diagnostics";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function main() {
  const id = process.argv[2] ?? "1791b2a8-0b51-4643-b3ad-9e437d82a7b9";
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("INVALID_SCOPE");
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("MISSING_CONFIGURATION");
  const response = await fetch(`${base}/rest/v1/ugc_storyboards?select=*&id=eq.${id}`, { method: "GET",
    headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("READ_UNAVAILABLE");
  const rows = await response.json() as StoryboardRow[];
  if (rows.length !== 1) throw new Error("ROW_UNAVAILABLE");
  const row = rows[0];
  console.info(JSON.stringify({ id: row.id, revision: row.revision, version: row.version, state: row.state, attempts: row.attempts, requests: row.requests.length, error: row.error_code }));
  const pg = new PGlite();
  try {
    // Install ONLY the pure immutable validator in memory. No workflow schema,
    // credentials, live SQL, job fixtures, claims or mutating RPCs are involved.
    const sql = await readFile("supabase/migrations/20261026006600_ugc_storyboards.sql", "utf8");
    const validator = sql.match(/create or replace function public\.ugc_storyboard_valid\([\s\S]+?end; \$\$;/)?.[0];
    if (!validator) throw new Error("LOCAL_VALIDATOR_UNAVAILABLE");
    await pg.exec(validator);
    for (const [index, request] of row.requests.entries()) {
      const output = request.output;
      if (typeof output !== "string") continue;
      let value: unknown;
      try { value = JSON.parse(output); } catch { value = null; }
      const parsed = storyboardSchema.safeParse(value);
      const path = join(process.env.UGC_STORYBOARD_RECOVERY_DIR?.trim() || join(tmpdir(), "sceenyk-storyboard-recovery-v1"),
        `${row.owner_user_id}_${row.project_id}_${row.job_id}_${row.id}_${index}.json`);
      let sameLocal: boolean | null = null;
      try { sameLocal = JSON.parse(await readFile(path, "utf8")).output === output; } catch {}
      const prepared = inspectPreparedStoryboard(output, row.input);
      const dbValidation = (await pg.query<{ valid: boolean }>("select ugc_storyboard_valid($1::jsonb,$2::jsonb) valid", [JSON.stringify(prepared.document ?? value), JSON.stringify(row.input)])).rows[0].valid;
      console.info(JSON.stringify({ index, status: request.receipt?.status, responseId: request.receipt?.responseId,
        sha256: createHash("sha256").update(output).digest("hex"), characters: output.length, sameLocal,
        schemaValid: parsed.success, schemaIssues: parsed.success ? [] : schemaValidationIssues(parsed.error, value),
        rawBusinessIssues: inspectStoryboard(value, storyboardBinding(row.input)).issues,
        validation: prepared.report, SQLValidatorAccepts: dbValidation }));
    }
  } finally { await pg.close(); }
  console.info(JSON.stringify({ readOnly: true, liveWrites: 0, providerCalls: 0, workflowRPCs: 0, workerExecution: 0 }));
}
void main().catch(() => { console.error("STORYBOARD_VALIDATION_INSPECTION_UNAVAILABLE"); process.exitCode = 1; });
