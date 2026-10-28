// Read-only package inspection + pure preflight. Never imports a worker or uses
// RPC/admission, private media, provider calls or paid requests.
import { loadEnvConfig } from "@next/env";
import { getDatabaseConfig } from "../lib/db/config";
import { finalConfiguration } from "../lib/final-video-generation/config";
import { finalProviders } from "../lib/final-video-generation/adapters/registry";
import { finalPreflight } from "../lib/final-video-generation/preflight";
import { validateVideoGenerationPackage } from "../lib/video-generation-package/builder";
import type { PackageRow } from "../lib/video-generation-package/contract";
import { z } from "zod";
import { proposeExecutionRepair } from "../lib/storyboard/execution-repair";
import { prepareStoryboard } from "../lib/storyboard/contract";
import { buildVideoGenerationPackage } from "../lib/video-generation-package/builder";

loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
async function main() {
  const args = process.argv.slice(2), preview = args.includes("--repair-preview"), ids = args.filter(arg => arg !== "--repair-preview");
  const packageId = ids[0];
  if (ids.length > 1 || packageId && !z.uuid().safeParse(packageId).success) throw new Error("PREFLIGHT_INSPECTION_INVALID_PACKAGE");
  const db = getDatabaseConfig(), configured = finalConfiguration();
  const request = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== db.url || url.pathname !== "/rest/v1/ugc_generation_packages" || init?.method !== "GET")
      throw new Error("PREFLIGHT_INSPECTION_READ_ONLY");
    return request(input, init);
  };
  const url = new URL("/rest/v1/ugc_generation_packages", db.url);
  url.search = new URLSearchParams({ select: "id,state,revision,version,package_hash,document,input", state: "eq.approved",
    stale_at: "is.null", order: "created_at.desc", limit: "2" }).toString();
  if (packageId) url.searchParams.set("id", `eq.${packageId}`);
  const response = await fetch(url, { method: "GET", redirect: "error", headers: { apikey: db.secretKey, Authorization: `Bearer ${db.secretKey}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("PREFLIGHT_INSPECTION_UNAVAILABLE");
  const rows = await response.json() as PackageRow[];
  if (rows.length !== 1) {
    console.info("UGC_FINAL_PREFLIGHT_PACKAGE_SELECTION_REQUIRED", { packages: rows.map(row => ({ id: row.id, revision: row.revision, commandVersion: row.version })),
      instruction: "Supply the exact current approved package UUID as the script's only argument; current input/version remains enforced by Generate." });
    process.exitCode = 1; return;
  }
  const row = rows[0], doc = validateVideoGenerationPackage(row.document, row.input, row.revision);
  const result = finalPreflight(doc, configured.value, finalProviders());
  let repairPreview;
  if (preview) {
    const proposal = proposeExecutionRepair(row.input.storyboard.document), candidate = structuredClone(row.input);
    candidate.storyboard.document = prepareStoryboard(proposal.document, candidate.source);
    const compiled = buildVideoGenerationPackage(candidate, row.revision + 1);
    const planned = finalPreflight(compiled, configured.value, finalProviders());
    repairPreview = { saved: false, approvalRequired: true, changes: proposal.changes, schemaVersion: compiled.schemaVersion,
      totalDurationMs: compiled.timeline.totalDurationMs, creativeEligible: planned.diagnostics.every(i => i.layer === "funding"),
      remainingIssues: planned.diagnostics, costBreakdown: planned.breakdown, estimatedCostMicrousd: planned.estimatedCostMicrousd };
  }
  console.info(JSON.stringify({ readOnly: true, packageId: row.id, packageRevision: row.revision, packageVersion: doc.packageVersion, commandVersion: row.version,
    totalDurationMs: doc.timeline.totalDurationMs, approvedTransitions: doc.scenes.map(s => ({ sceneNumber: s.number, transition: s.transition })),
    approvedDeliveries: doc.scenes.map(s => ({ sceneNumber: s.number, deliveries: s.speech.filter(l => l.text.trim()).map(l => l.delivery) })),
    budget: { plannedRequests: result.requests, authorizedRequests: configured.value.maxRequests,
      estimatedCostMicrousd: result.estimatedCostMicrousd, authorizedCostMicrousd: configured.value.maxEstimatedCostMicrousd },
    costBreakdown: result.breakdown, stageAuthorizationCeilingsMicrousd: configured.value.ceilings,
    repairPreview,
    eligible: !result.issues.length, layers: result.layers, compositionProfile: configured.value.composition.version,
    packageUntouched: row.package_hash === doc.packageHash, upstreamCurrentnessRecheckedByGenerate: true,
    rpcInvocations: 0, paidRequests: 0, workerStarted: false }, null, 2));
}
main().catch(() => { console.error("UGC_FINAL_PREFLIGHT_INSPECTION_UNAVAILABLE"); process.exitCode = 1; });
