// Explicit read-only diagnostic: Supabase SELECT and R2 HEAD/GET only.
// No workflow RPCs, provider requests, claims, mutations or deletions.
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function main() {
  const { createDatabaseClient } = await import("../lib/db/server");
  const { locationKey, loadLocation } = await import("../lib/location-reference/media");
  const { headR2CharacterObject } = await import("../lib/storage/r2");
  const db = createDatabaseClient();
  const { getDatabaseConfig } = await import("../lib/db/config");
  const { getStorageConfig } = await import("../lib/storage/config");
  const { S3Client, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const job = process.argv[2];
  if (job && !/^[a-f0-9-]{36}$/.test(job)) throw new Error("INVALID_JOB_ID");
  let query = db.from("ugc_locations").select("*").order("updated_at", { ascending: false }).limit(12);
  if (job) query = query.eq("job_id", job);
  const roots = await query;
  if (roots.error) { console.info(JSON.stringify({ readOnly: true, phase: "location_read", code: roots.error.code || "TRANSPORT_UNAVAILABLE", mutations: 0 })); process.exitCode = 1; return; }
  for (const root of roots.data ?? []) {
    console.info(JSON.stringify({ kind: "location", id: root.id, job: root.job_id, revision: root.revision, version: root.version,
      state: root.state, phase: root.phase, error: root.error_code, candidate: root.candidate_id, acceptedCandidate: root.accepted_candidate_id,
      planSaved: !!root.plan, planIntent: !!root.plan_intent, planResponse: root.plan_receipt?.responseId ?? null,
      requestedAt: root.requested_at, createdAt: root.created_at, updatedAt: root.updated_at, leaseExpiresAt: root.lease_expires_at }));
    const config = getDatabaseConfig();
    const eventFields = `version,state,phase,created_at${"diagnostic" in root ? ",error_code,diagnostic" : ""}`;
    const history = await fetch(`${config.url}/rest/v1/ugc_location_events?location_id=eq.${root.id}&select=${eventFields}&order=id.asc&limit=80`,
      { headers: { apikey: config.secretKey, Authorization: `Bearer ${config.secretKey}` }, signal: AbortSignal.timeout(10_000) });
    if (history.ok) console.info(JSON.stringify({ kind: "history", location: root.id, events: await history.json() }));
    const candidates = await db.from("ugc_location_candidates").select("*").eq("location_id", root.id).order("created_at", { ascending: true }).limit(20);
    if (candidates.error) { console.info(JSON.stringify({ phase: "candidate_read", code: candidates.error.code })); continue; }
    for (const candidate of candidates.data ?? []) {
      const key = locationKey(root, candidate);
      const info: Record<string, unknown> = { kind: "candidate", id: candidate.id, location: root.id, state: candidate.state,
        submitted: !!candidate.intent, savedArtifact: !!candidate.artifact, model: candidate.settings.model, size: candidate.settings.size,
        requestId: candidate.receipt?.requestId ?? null, receiptSaved: !!candidate.receipt, usage: candidate.receipt?.usage ?? null,
        createdAt: candidate.created_at, rejectedAt: candidate.rejected_at, deletedAt: candidate.deleted_at };
      try {
        const object = await headR2CharacterObject(key, AbortSignal.timeout(30_000));
        info.objectExists = !!object;
        if (object) {
          info.sizeBytes = object.sizeBytes; info.mimeType = object.mimeType;
          const stored = await loadLocation(root, candidate, AbortSignal.timeout(30_000));
          info.verified = !!stored; info.sha256 = stored?.artifact.sha256; info.width = stored?.artifact.width; info.height = stored?.artifact.height;
        }
      } catch (error) { info.storageCheck = error instanceof Error ? error.message : "READ_FAILED"; }
      console.info(JSON.stringify(info));
    }
  }
  const first = roots.data?.[0];
  if (first) {
    const config = getStorageConfig();
    const sdk = new S3Client({ region: "auto", endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 1 });
    const listed = await sdk.send(new ListObjectsV2Command({ Bucket: config.bucket,
      Prefix: `ugc/${first.owner_user_id}/${first.project_id}/${first.job_id}/location-v1/`, MaxKeys: 100 }), { abortSignal: AbortSignal.timeout(30_000) });
    console.info(JSON.stringify({ kind: "location_objects", job: first.job_id, truncated: listed.IsTruncated, objects: listed.Contents?.map(item =>
      ({ candidate: item.Key?.split("/").at(-1), sizeBytes: item.Size, lastModified: item.LastModified })) ?? [] }));
  }
  console.info(JSON.stringify({ readOnly: true, locations: roots.data?.length ?? 0, providerCalls: 0, workflowRPCs: 0, mutations: 0 }));
}
main().catch(() => { console.error("LOCATION_INSPECTION_UNAVAILABLE"); process.exitCode = 1; });
