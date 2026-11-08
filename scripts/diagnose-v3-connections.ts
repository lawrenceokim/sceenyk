// Read-only operator diagnostics. No claims, enqueue, migration, upload or generation calls.
import { loadEnvConfig } from "@next/env";
import { S3Client, HeadBucketCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getDatabaseConfig } from "../lib/db/config";
import { databaseRequestTimeout } from "../lib/db/timeouts";
import { getStorageConfig } from "../lib/storage/config";
import { getClerkDevelopmentConfig } from "../lib/auth/config";
import { ServiceOperationError, serviceDiagnostic, type ServiceName } from "../lib/diagnostics/service-failure";

async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => a !== "--live")) throw new Error("DIAGNOSTIC_ARGUMENT_INVALID");
  const inherited = new Set(Object.keys(process.env));
  const loaded = loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info() {}, error() {} });
  const names = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "UGC_V3_ENABLED", "UGC_V3_ACCESS_MODE", "UGC_V3_RECOVERY_DIR"];
  console.info(JSON.stringify({ check: "environment", files: loaded.loadedEnvFiles.map(f => f.path), variables: names.map(name => ({ name,
    configured: !!process.env[name]?.trim(), source: inherited.has(name) ? "inherited_process" : "env_file_or_unset",
    overridesEnvFile: inherited.has(name) && loaded.loadedEnvFiles.some(f => f.env?.[name] !== undefined && f.env[name] !== process.env[name]),
  })), live: args.includes("--live"), paidRequests: false }));
  let failed = false;
  const probe = async <T>(check: string, service: ServiceName, action: () => Promise<T>) => {
    const started = Date.now();
    try { const result = await action(); console.info(JSON.stringify({ check, ok: true, elapsedMs: Date.now() - started, result })); }
    catch (error) { failed = true; console.info(JSON.stringify({ check, ok: false, elapsedMs: Date.now() - started, diagnostic: serviceDiagnostic(error, service, check) })); }
  };
  await probe("database_configuration", "database", async () => { getDatabaseConfig(); return { valid: true }; });
  await probe("clerk_configuration", "clerk", async () => { if (!getClerkDevelopmentConfig().enabled) throw new ServiceOperationError({ code: "MISSING_CONFIGURATION" }, "clerk", "configuration"); return { valid: true }; });
  await probe("storage_configuration", "storage", async () => { getStorageConfig(); return { valid: true }; });
  if (!args.includes("--live")) { process.exitCode = failed ? 1 : 0; return; }
  const db = getDatabaseConfig();
  const rest = async (route: string, body?: Record<string, unknown>) => {
    const operation = /\/rpc\/([a-z0-9_]+)/.exec(route)?.[1] ?? `read_${/^\/rest\/v1\/([a-z0-9_]+)/.exec(route)?.[1] ?? "api_schema"}`;
    try {
    const response = await fetch(db.url + route, { method: body ? "POST" : "GET", headers: { apikey: db.secretKey, Authorization: `Bearer ${db.secretKey}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(databaseRequestTimeout(db.url + route)) });
    const data: unknown = await response.json();
    if (!response.ok) throw new ServiceOperationError(data, "database", operation, undefined, undefined, response.status);
    return data;
    } catch (error) { if (error instanceof ServiceOperationError) throw error; throw new ServiceOperationError(error, "database", operation); }
  };
  await probe("database_read", "database", async () => { await rest("/rest/v1/app_users?select=id&limit=0"); return { reachable: true }; });
  for (const [migration, name] of [["098", "ugc_v3_clip_setup"], ["099", "ugc_v3_merge_setup"]]) {
    await probe(`migration_${migration}`, "database", async () => { if (await rest(`/rest/v1/rpc/${name}`, {}) !== true) throw new Error("SETUP_MARKER_INVALID"); return { marker: true, catalogAudit: "Run scripts/verify-v3-setup.sql to verify trigger bodies and grants." }; });
  }
  await probe("worker_discovery", "database", async () => {
    const result = await rest("/rest/v1/rpc/ugc_v3_worker_projects", { p_owner: null, p_after: null, p_limit: 1, p_submit: false });
    if (!Array.isArray(result)) throw new Error("DISCOVERY_CONTRACT_INVALID");
    return { readable: true, claimsMade: 0 };
  });
  await probe("rpc_surface", "database", async () => {
    type ArgumentSchema = { $ref?: string; properties?: Record<string, unknown> };
    const schema = await rest("/rest/v1/") as { paths?: Record<string, { post?: { parameters?: { in?: string; schema?: ArgumentSchema }[] } }>; definitions?: Record<string, ArgumentSchema> };
    const required: Record<string, string[]> = {
      ugc_v3_clip_authorize: ["p_documents", "p_owner", "p_previous", "p_project"], ugc_v3_clip_manifest: ["p_owner", "p_package", "p_project"],
      ugc_v3_clip_retryable: ["p_owner", "p_project", "p_run"], ugc_v3_merge_begin: ["p_hash", "p_manifest", "p_owner", "p_package", "p_project"],
      ugc_v3_merge_manifest: ["p_owner", "p_package", "p_project"], ugc_v3_merge_stage: ["p_stage", "p_task", "p_token"], ugc_v3_approve_video: ["p_id", "p_owner", "p_project"],
    };
    const missing = Object.entries(required).filter(([name, parameters]) => {
      const body = schema.paths?.[`/rpc/${name}`]?.post?.parameters?.find(p => p.in === "body")?.schema;
      const args = body?.$ref ? schema.definitions?.[body.$ref.split("/").at(-1)!] : body;
      return JSON.stringify(Object.keys(args?.properties ?? {}).sort()) !== JSON.stringify(parameters);
    });
    if (missing.length) throw new ServiceOperationError({ code: "PGRST202" }, "database", "rpc_surface");
    return { requiredSignaturesVerified: Object.keys(required).length };
  });
  await probe("clerk_connectivity", "clerk", async () => {
    const response = await fetch("https://api.clerk.com/v1/users?limit=1", { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` }, signal: AbortSignal.timeout(10000) });
    await response.body?.cancel();
    if (!response.ok) throw new ServiceOperationError({}, "clerk", "profile_read", undefined, undefined, response.status);
    return { httpStatus: response.status };
  });
  await probe("storage_bucket_head", "storage", async () => {
    const c = getStorageConfig(), sdk = new S3Client({ endpoint: c.endpoint, region: "auto", maxAttempts: 1, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } });
    try { const response = await sdk.send(new HeadBucketCommand({ Bucket: c.bucket }), { abortSignal: AbortSignal.timeout(10000) }); return { httpStatus: response.$metadata.httpStatusCode }; }
    finally { sdk.destroy(); }
  });
  const owner = process.env.UGC_V3_OPERATOR_USER_ID;
  if (owner && /^[a-f0-9-]{36}$/.test(owner)) await probe("owned_media_head", "storage", async () => {
    const rows = await rest(`/rest/v1/project_assets?select=storage_key,verified_etag&owner_user_id=eq.${encodeURIComponent(owner)}&upload_status=eq.uploaded&limit=1`) as { storage_key: string; verified_etag: string }[];
    if (!rows[0]) return { skipped: "No uploaded media for configured diagnostic owner." };
    const c = getStorageConfig(), sdk = new S3Client({ endpoint: c.endpoint, region: "auto", maxAttempts: 1, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } });
    try {
      const response = await sdk.send(new HeadObjectCommand({ Bucket: c.bucket, Key: rows[0].storage_key }), { abortSignal: AbortSignal.timeout(10000) });
      if (response.ETag !== rows[0].verified_etag) throw new Error("MEDIA_ETAG_MISMATCH");
      return { httpStatus: response.$metadata.httpStatusCode, etagMatches: true, nonEmpty: !!response.ContentLength };
    } finally { sdk.destroy(); }
  });
  const approvedAssets: { storageKey: string; etag: string; sizeBytes: number; mimeType: string }[] = [];
  if (owner && /^[a-f0-9-]{36}$/.test(owner)) await probe("owned_connected_project", "database", async () => {
    const projects = await rest(`/rest/v1/projects?select=id,duration&owner_user_id=eq.${encodeURIComponent(owner)}&deleted_at=is.null&studio_mode=eq.pro&order=updated_at.desc&limit=5`) as { id: string; duration: string }[];
    const project = projects.find(p => Number(p.duration) > 30);
    if (!project) return { skipped: "No recent connected project for configured diagnostic owner." };
    const workspace = await rest("/rest/v1/rpc/ugc_v3_runtime_read", { p_owner: owner, p_project: project.id }) as {
      runs: { state: string; result?: (typeof approvedAssets)[number] }[]; tasks: { kind: string; status: string }[];
    };
    for (const run of workspace.runs) if (run.state === "approved" && run.result) {
      if (!run.result.storageKey.startsWith(`users/${owner}/projects/${project.id}/v3/`)) throw new Error("DIAGNOSTIC_MEDIA_SCOPE_INVALID");
      approvedAssets.push(run.result);
    }
    return { durationSeconds: Number(project.duration), approvedClips: approvedAssets.length,
      mergeStatuses: workspace.tasks.filter(t => t.kind === "join").map(t => t.status) };
  });
  for (const [index, asset] of approvedAssets.slice(0, 10).entries()) await probe(`approved_clip_head_${index + 1}`, "storage", async () => {
    const c = getStorageConfig(), sdk = new S3Client({ endpoint: c.endpoint, region: "auto", maxAttempts: 1, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } });
    try {
      const response = await sdk.send(new HeadObjectCommand({ Bucket: c.bucket, Key: asset.storageKey }), { abortSignal: AbortSignal.timeout(10000) });
      if (response.ETag !== asset.etag || response.ContentLength !== asset.sizeBytes || response.ContentType !== asset.mimeType) throw new Error("APPROVED_CLIP_METADATA_MISMATCH");
      return { httpStatus: response.$metadata.httpStatusCode, etagMatches: true, sizeMatches: true, mimeMatches: true };
    } finally { sdk.destroy(); }
  });
  process.exitCode = failed ? 1 : 0;
}
void main().catch(error => { console.error(JSON.stringify({ check: "diagnostic_setup", ok: false, diagnostic: serviceDiagnostic(error, "database", "configuration") })); process.exitCode = 1; });
