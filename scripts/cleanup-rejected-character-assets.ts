// Operator-only maintenance. Importing this file must never happen in an app,
// worker or test. --dry-run is read-only; --execute is an explicit deletion run.
import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { characterSheetDocumentSchema, operationSchema, type CharacterOperation } from "../lib/character-sheet/contract";
import type { ReferenceReviewRow, ReferenceRegenerationRow } from "../lib/reference-review/contract";

type Proof = { sheetId?: string; requestId?: string; operationKey: string; view: string; stage: "provider" | "reference";
  version: number; sha256: string; storageKey: string };
type Candidate = { owner: string; project: string; job: string; proof: Proof };
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--dry-run", "--execute"].includes(args[0])) throw new Error("USE_EXPLICIT_DRY_RUN_OR_EXECUTE");
  const execute = args[0] === "--execute";
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const { createDatabaseClient } = await import("../lib/db/server");
  const { headR2CharacterObject, readR2AnalysisMedia, deleteR2CharacterCandidate } = await import("../lib/storage/r2");
  const db = createDatabaseClient();
  async function all(table: "ugc_character_sheets" | "ugc_product_sheets" | "ugc_reference_reviews" | "ugc_reference_regeneration_requests" | "project_assets" | "ugc_generation_jobs" | "ugc_character_v5_workflows" | "ugc_character_v5_candidates" | "ugc_character_asset_purges") {
    const rows: unknown[] = [];
    for (let page = 0; page < 1000; page++) {
      const result = await db.from(table).select("*").order(table === "ugc_character_asset_purges" ? "object_hash" : "id").range(page * 500, page * 500 + 499);
      if (result.error) throw new Error("CLEANUP_CATALOG_UNAVAILABLE");
      rows.push(...result.data); if (result.data.length < 500) return rows;
    }
    throw new Error("CLEANUP_CATALOG_LIMIT"); // Never execute with an incomplete protection set.
  }
  const [sheets, products, roots, requests, assets, jobs, workflows, v5Candidates, purges] = await Promise.all([
    all("ugc_character_sheets"), all("ugc_product_sheets"), all("ugc_reference_reviews"), all("ugc_reference_regeneration_requests"),
    all("project_assets"), all("ugc_generation_jobs"), all("ugc_character_v5_workflows"), all("ugc_character_v5_candidates"),
    all("ugc_character_asset_purges"),
  ]);
  const protectedKeys = new Set<string>();
  const protect = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (["storageKey", "storage_key"].includes(key) && typeof child === "string") protectedKeys.add(child);
      else if (child && typeof child === "object") protect(child);
    }
  };
  for (const value of [...sheets, ...products, ...roots, ...requests, ...assets, ...workflows, ...v5Candidates]) protect(value);
  const candidates: Candidate[] = []; let skippedCurrent = 0; let skippedCanonical = 0;
  const reviews = roots as ReferenceReviewRow[];
  const addOperation = (scope: Omit<Candidate, "proof">, op: CharacterOperation, prefix: string, version: number,
    origin: { sheetId?: string; requestId?: string }, current: boolean) => {
    const failure = op.validation?.state === "rejected" ? op.validation : op.sourceValidation?.state === "rejected" ? op.sourceValidation : undefined;
    if (!failure && op.diagnostic?.reason !== "CHARACTER_FRONT_CROP_INVALID") return;
    const view = prefix.split("|")[1]; const root = prefix.split("|")[0];
    const provider = op.sourceValidation ?? op.validation; if (!provider) return;
    const stages: ["provider" | "reference", string][] = [["provider", provider.sha256]];
    if (view === "front" && failure?.stage === "canonical") stages.push(["reference", failure.sha256]);
    for (const [stage, sha256] of stages) {
      if (current) { skippedCurrent++; continue; }
      const storageKey = `${root}/candidates/${view}/${op.key}${stage === "reference" ? "-reference" : ""}.png`;
      if (protectedKeys.has(storageKey)) { skippedCanonical++; continue; }
      candidates.push({ ...scope, proof: { ...origin, operationKey: op.key, view, stage, version, sha256, storageKey } });
    }
  };
  for (const value of sheets) {
    const row = value as import("../lib/character-sheet/contract").CharacterSheetRow;
    const document = characterSheetDocumentSchema.safeParse(row.document); if (!document.success) continue;
    for (const view of ["face", "back", "front"] as const) {
      const root = document.data.operations[view]; if (!root) continue;
      for (const op of [root, ...(root.previousAttempts ?? [])]) addOperation({ owner: row.owner_user_id, project: row.project_id, job: row.job_id }, op,
        `ugc/${row.owner_user_id}/${row.project_id}/${row.job_id}/character-v${row.sheet_version}/${row.id}|${view}`,
        op.requestedVersion ?? row.sheet_version, { sheetId: row.id }, op.key === root.key);
    }
  }
  for (const request of requests as ReferenceRegenerationRow[]) {
    const review = reviews.find(review => review.id === request.review_id && review.reference_type === "character");
    const root = operationSchema.safeParse(request.checkpoint); if (!review || !root.success || !["face", "back", "front"].includes(request.view)) continue;
    for (const op of [root.data, ...(root.data.previousAttempts ?? [])]) {
      const version = op.requestedVersion ?? request.requested_version;
      addOperation({ owner: review.owner_user_id, project: review.project_id, job: review.job_id }, op,
        `ugc/${review.owner_user_id}/${review.project_id}/${review.job_id}/reference-review-v1/${review.id}/v${version}|${request.view}`,
        version, { requestId: request.id }, request.requested_version >= review.version && op.key === root.data.key);
    }
  }
  let knownBytes = 0; let objects = 0; let deleted = 0; let skippedUncertain = 0;
  const unique = candidates.filter((candidate, index) => candidates.findIndex(item => item.proof.storageKey === candidate.proof.storageKey) === index);
  for (const item of unique) {
    const job = jobs.find(value => (value as { id: string }).id === item.job) as import("../lib/ugc-jobs/contract").UgcJobRow | undefined;
    if (!job || job.owner_user_id !== item.owner || job.project_id !== item.project || job.status === "running" ||
      reviews.some(review => review.job_id === item.job && review.execution_state === "running") ||
      workflows.some(value => (value as { job_id: string; state: string }).job_id === item.job && (value as { state: string }).state === "running")) { skippedCurrent++; continue; }
    const signal = AbortSignal.timeout(45_000); const object = await headR2CharacterObject(item.proof.storageKey, signal);
    if (!object) {
      const prior = purges.find(value => (value as { storage_key: string }).storage_key === item.proof.storageKey) as
        { object_hash: string; etag: string; state: string } | undefined;
      if (execute && prior?.state === "deleting") {
        const finished = await db.rpc("ugc_character_cleanup_finish", { p_hash: prior.object_hash, p_etag: prior.etag });
        if (finished.error || !finished.data) throw new Error("CLEANUP_TOMBSTONE_PENDING");
      }
      continue;
    }
    if (!object.etag || object.mimeType !== "image/png" || object.sizeBytes <= 0 || object.sizeBytes > 20 * 1024 * 1024) { skippedUncertain++; continue; }
    objects++; knownBytes += object.sizeBytes;
    if (!execute) continue;
    // Exact hash verification before the SQL fence and ETag-checked deletion.
    const stream = await readR2AnalysisMedia(item.proof.storageKey, object.etag, object.sizeBytes, signal);
    const reader = stream.getReader(); const hash = createHash("sha256"); let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break;
      size += part.value.length; if (size > object.sizeBytes) throw new Error("CLEANUP_OBJECT_CHANGED"); hash.update(part.value); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (size !== object.sizeBytes || hash.digest("hex") !== item.proof.sha256) { skippedUncertain++; continue; }
    const objectHash = createHash("sha256").update(item.proof.storageKey).digest("hex");
    const claim = await db.rpc("ugc_character_cleanup_claim", { p_owner: item.owner, p_project: item.project, p_job: item.job,
      p_proof: item.proof, p_object_hash: objectHash, p_etag: object.etag, p_size: object.sizeBytes });
    if (claim.error) throw new Error("CLEANUP_FENCE_UNAVAILABLE");
    if (!claim.data) { skippedCanonical++; continue; }
    await deleteR2CharacterCandidate(item.proof.storageKey, object.etag, signal);
    const finished = await db.rpc("ugc_character_cleanup_finish", { p_hash: objectHash, p_etag: object.etag });
    if (finished.error || !finished.data) throw new Error("CLEANUP_TOMBSTONE_PENDING");
    deleted++;
  }
  console.info(JSON.stringify({ mode: execute ? "execute" : "dry-run", candidateCount: unique.length, objectCount: objects,
    knownBytes, skippedCanonicalOrApproved: skippedCanonical, skippedCurrent, skippedUncertain, deleted }));
}
main().catch(() => { console.error("REJECTED_CHARACTER_CLEANUP_STOPPED: no further objects will be deleted; inspect configuration or pending tombstones."); process.exitCode = 1; });
