// Read-only investigation; permits database GETs and the two currentness reads only.
import fs from "node:fs/promises";
import { getDatabaseConfig } from "../lib/db/config";
import { createDatabaseClient } from "../lib/db/server";

async function main() {
  const config = getDatabaseConfig();
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (url.origin !== config.url || !(method === "GET" || method === "POST" &&
      ["ugc_package_input", "ugc_final_current", "ugc_location_scene", "ugc_location_dependencies", "ugc_storyboard_input"].some(name => url.pathname === `/rest/v1/rpc/${name}`))) throw Error("READ_ONLY_GUARD");
    return original(input, init);
  };
  const db = createDatabaseClient();
  const run = await db.from("ugc_final_executions").select("*").eq("id", "62e93717-9e00-486e-b968-a85f272b831d").single();
  if (run.error) throw Error(`DB_${run.error.code}_${run.status}`);
  const e = run.data;
  const tables = ["ugc_generation_jobs", "ugc_generation_packages", "ugc_final_operations", "ugc_final_scenes", "ugc_final_events", "ugc_generation_job_events", "ugc_storyboards", "ugc_character_v5_workflows", "ugc_reference_reviews", "ugc_product_sheets", "ugc_locations", "ugc_location_candidates"];
  const result: Record<string, unknown> = { execution: e };
  for (const table of tables) {
    const column = table === "ugc_generation_jobs" ? "id" : table.startsWith("ugc_final_") ? "execution_id" : "job_id";
    if (table === "ugc_location_candidates") {
      const locations = result.ugc_locations as { id: string }[];
      const q = await db.from(table as "ugc_generation_jobs").select("*").in("location_id", locations.map(l => l.id));
      result[table] = q.error ? { error: q.error.code } : q.data; continue;
    }
    const query = await db.from(table as "ugc_generation_jobs").select("*").filter(column, "eq", column === "execution_id" ? e.id : e.job_id);
    result[table] = query.error ? { error: query.error.code } : query.data;
  }
  for (const [name, args] of [["ugc_package_input", { p_job: e.job_id }], ["ugc_final_current", { p_execution: e.id }],
    ["ugc_location_scene", { p_job: e.job_id }], ["ugc_location_dependencies", { p_job: e.job_id }], ["ugc_storyboard_input", { p_job: e.job_id }]] as const) {
    const r = await db.rpc(name, args); result[name] = { data: r.data, error: r.error?.code };
  }
  await fs.writeFile(".ugc-final-recovery/review-investigation.json", JSON.stringify(result, null, 2));
  console.info(JSON.stringify({ readOnly: true, state: e.state, phase: e.phase, approvedAt: e.approved_at,
    packageId: e.package_id, packageHash: e.package_hash, version: e.version,
    job: (result.ugc_generation_jobs as unknown[])[0], current: result.ugc_final_current,
    currentPackageInputNull: (result.ugc_package_input as { data: unknown }).data === null },
    (key, value) => ["input_snapshot", "owner_user_id", "project_id", "idempotency_key"].includes(key) ? undefined : value, 2));
}
main().catch(error => { console.error({ name: error?.name, code: error?.code, message: error?.message,
  cause: error?.cause ? { code: error.cause.code, name: error.cause.name } : undefined }); process.exitCode = 1; });
