import { loadEnvConfig } from "@next/env";
Object.assign(process.env, { NODE_ENV: process.env.NODE_ENV ?? "development" });
loadEnvConfig(process.cwd(), true);

// Read-only: no action/claim/checkpoint/submit/estimate call exists in this command.
let stage = "imports";
async function main() {
  const { V3Store } = await import("../lib/final-video-generation-v3/runtime-store");
  stage = "runtime-module";
  const { inspectRuntime } = await import("../lib/final-video-generation-v3/runtime-inspection");
  stage = "package-module";
  const { readFrozenPackage } = await import("../lib/final-video-generation-v3/package");
  stage = "delivery-module";
  const { prepareVideoDelivery } = await import("../lib/final-video-generation-v3/video-delivery");
  const { v3TransportConfig, assertV3Operator } = await import("../lib/final-video-generation-v3/runtime-config");
  const { v3BodyHash, v3Digest } = await import("../lib/final-video-generation-v3/identity");
  const { createDatabaseClient } = await import("../lib/db/server");
  const { higgsfieldRequestIssues } = await import("../lib/final-video-generation-v3/adapters/higgsfield-validity");
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--project") throw new Error("V3_PREFLIGHT_PROJECT_REQUIRED");
  const { z } = await import("zod");
  const projectId = z.uuid().parse(args[1]);
  stage = "operator";
  const owner = process.env.UGC_V3_OPERATOR_USER_ID ?? ""; assertV3Operator(owner);
  stage = "workspace";
  const store = new V3Store(), w = await store.read(owner, projectId), config = v3TransportConfig();
  stage = "package";
  const doc = readFrozenPackage(w.packages.at(-1)?.document), packageId = doc.id;
  const quote = w.quotes.find(q => q.document.packageId === packageId)!.document;
  const auth = w.runtimeAuthorizations.filter(a => a.document.packageId === packageId).at(-1)?.document;
  const bindings: Record<string, string> = {
    ugc_v3_projects: "project_id,owner_user_id,logical_job_id", ugc_v3_sources: "project_id,revision,input,private_bindings",
    ugc_v3_packages: "id,project_id,version,source_revision,document,package_hash",
    ugc_v3_quotes: "id,project_id,package_id,document", ugc_v3_run_authorizations: "id,project_id,package_id,quote_id,segment_uuid,document",
    ugc_v3_runs: "id,project_id,package_id,segment_uuid,segment_key,authorization_id,intent,state,observation,result,quality,error_code,completed_at,created_at",
    ugc_v3_tasks: "id,project_id,kind,request_key,input,status,provider_started,lease_token,lease_until,output,error_code,available_at,poll_count,created_at",
    ugc_v3_artifacts: "id,project_id,task_id,kind,version,document,approved_at,rejected_at,created_at",
    ugc_v3_runtime_events: "id,project_id,entity_id,kind,document,created_at",
  };
  const db = createDatabaseClient();
  stage = "schema";
  const schemaChecks = await Promise.all(Object.entries(bindings).map(async ([table, columns]) => {
    const { error } = await db.from(table).select(columns).limit(0); return { table, columns: columns.split(",").length, verified: !error };
  }));
  let delivery: { verified: boolean; expiresAt?: string; bodyHash?: string; code?: string } = { verified: false };
  try {
    const prepared = await prepareVideoDelivery(w, doc, quote.segments[0], AbortSignal.timeout(120_000));
    delivery = { verified: true, expiresAt: prepared.expiresAt, bodyHash: v3BodyHash(prepared.body) };
  } catch { delivery = { verified: false, code: "V3_REFERENCE_READBACK_FAILED" }; }
  stage = "runtime";
  const report = await inspectRuntime(w), now = new Date().toISOString();
  const current = await store.rpc("ugc_v3_runtime_current", { p_package: packageId });
  const issues = [...(report?.issues ?? ["V3_PREFLIGHT_REQUIRED"]), ...(!delivery.verified ? ["V3_REFERENCE_READBACK_FAILED"] : []),
    ...(schemaChecks.some(c => !c.verified) ? ["V3_SCHEMA_UNVERIFIED"] : []), ...(current !== true ? ["PACKAGE_STALE"] : [])];
  const segment = quote.segments[0];
  const payloadIssues = quote.segments.flatMap(s => higgsfieldRequestIssues(s.body, doc.source.references, quote.validityEvidence, now, s.model));
  console.log(JSON.stringify({ inspectedAt: now, projectId, packageId, packageVersion: doc.version, packageHash: doc.hash,
    current: report?.currentness === "current" && current === true, segmentCount: doc.segments.length,
    packageApproved: !!auth && auth.packageId === doc.id && auth.packageHash === doc.hash,
    providerPayloadValid: payloadIssues.length === 0, requestCount: quote.segments.length,
    segmentUuid: segment.segmentUuid, segmentId: segment.segmentId, segmentHash: segment.fingerprint,
    endpoint: `https://api.higgsfield.ai/${segment.model}`, mode: doc.source.mode,
    payload: { ...Object.fromEntries(Object.entries(segment.body).filter(([key]) => !["prompt", "image_urls"].includes(key))),
      prompt: `[frozen prompt: ${String(segment.body.prompt).length} characters; unchanged]`, promptHash: v3Digest("director-prompt", segment.body.prompt),
      image_urls: doc.source.references.map(r => `[private signed ${r.role} v${r.version}]`) },
    references: doc.source.references.map(r => ({ id: r.id, role: r.role, version: r.version, sha256: r.sha256, sizeBytes: r.sizeBytes, mimeType: r.mimeType })),
    authorization: auth ? { id: auth.id, hash: auth.hash, approvedAt: auth.approvedAt, expiresAt: auth.expiresAt,
      validNow: Date.parse(auth.approvedAt) <= Date.parse(now) && Date.parse(auth.expiresAt) > Date.parse(now),
      maxRequests: auth.maxRequests, maxEstimatedCostMicrousd: auth.maxEstimatedCostMicrousd } : null,
    estimatedCostMicrousd: quote.totalMicrousd, actualProviderCostMicrousd: null,
    credentialsConfigured: /^[^\s:]+:[^\s:]+$/.test(config.credentials), accountScopeConfigured: !!config.accountScope,
    accountScopeValidLocally: !!config.accountScope && (doc.pricing.source === "manual_provider_estimate" || config.accountScope === doc.accountScope), accountAccess: "Not verified by a provider request",
    outputHostsConfigured: config.outputHosts.length > 0, duplicatePaidIntent: w.runs.some(r => r.package_id === packageId && r.state !== "deleted"),
    outputHosts: config.outputHosts, outputHostEvidence: "No host guessed; discover from the completed provider response and require manual trust before download",
    outputHostPolicy: "Submission allowed without a known CDN; untrusted returned host stops at OUTPUT_HOST_APPROVAL_REQUIRED; recover same request after approval",
    limitsFileRequired: false, delivery, schemaChecks,
    existingRuns: w.runs.filter(r => r.package_id === packageId).map(r => ({ id: r.id, state: r.state, requestId: r.observation?.requestId ?? null })),
    activation: "owned_current_package_authorization", transportEnabled: config.enabled,
    duplicateProtection: "one active package segment; one request per immutable authorization; provider_started blocks POST replay",
    eligibleForPaidSubmission: issues.length === 0, canSubmit: issues.length === 0 && config.enabled,
    issues: [...new Set(issues)], providerGenerationCalls: 0, estimateCalls: 0, mutations: 0 }, null, 2));
}
main().catch(error => { console.error(JSON.stringify({ code: "V3_CONTROLLED_PREFLIGHT_FAILED", stage,
  errorType: error instanceof Error ? error.name : "Unknown",
  reason: error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "READ_ONLY_EVIDENCE_UNAVAILABLE" })); process.exitCode = 1; });
