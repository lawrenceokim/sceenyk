import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// Local pricing/package persistence only. Never starts a creative/video worker or contacts a provider.
async function main() {
  loadEnvConfig(process.cwd(), true); Object.assign(process.env, { NODE_ENV: "development" });
  const args = process.argv.slice(2), project = z.uuid().parse(args[args.indexOf("--project") + 1]), id = z.uuid().parse(args[args.indexOf("--package") + 1]);
  if (!args.includes("--project") || !args.includes("--package") || args.some(a => !["--project", "--package", project, id, "--repair", "--legacy-rpcs"].includes(a))) throw new Error("V3_REPAIR_ARGUMENTS_INVALID");
  if (process.env.UGC_V3_HIGGSFIELD_ENABLED !== "0") throw new Error("V3_REPAIR_REQUIRES_VIDEO_DISABLED");
  const fetchPort = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const host = new URL(input instanceof Request ? input.url : String(input)).hostname;
    if (/(^|\.)(openai\.com|higgsfield\.ai)$/.test(host)) throw new Error("PROVIDER_NETWORK_FORBIDDEN");
    return fetchPort(input, init);
  };
  const { V3Store } = await import("../lib/final-video-generation-v3/runtime-store");
  const { packageTask } = await import("../lib/final-video-generation-v3/package-task");
  const { readFrozenPackage } = await import("../lib/final-video-generation-v3/package");
  const { pricingConfiguration, calculateManualEstimate } = await import("../lib/final-video-generation-v3/pricing/higgsfield-pricing");
  const { higgsfieldModels } = await import("../lib/final-video-generation-v3/adapters/higgsfield");
  const { v3Digest } = await import("../lib/final-video-generation-v3/identity");
  const { taskSchema } = await import("../lib/final-video-generation-v3/runtime-contract");
  const { assertV3Operator } = await import("../lib/final-video-generation-v3/runtime-config");
  const { projectBrief, referenceOriginals, approvedArtifacts } = await import("../lib/final-video-generation-v3/creative-inputs");
  const owner = z.uuid().parse(process.env.UGC_V3_OPERATOR_USER_ID); assertV3Operator(owner);
  const store = new V3Store(), before = await store.read(owner, project), original = readFrozenPackage(before.packages.find(p => p.id === id)?.document);
  const approvalHash = (w: typeof before) => v3Digest("approved-artifacts", w.artifacts.filter(a => a.approved_at));
  if (!before.source?.current || before.source.revision !== original.sourceRevision || v3Digest("input", before.source.input) !== original.inputHash) throw new Error("PACKAGE_STALE");
  const refs = approvedArtifacts(before, await projectBrief(owner, project), await referenceOriginals(owner, project));
  if (original.source.references.some(r => !refs.some(a => a.id === r.id && a.version === r.version))) throw new Error("APPROVED_INPUT_STALE");
  if (before.runs.some(r => r.package_id === id) || before.runtimeAuthorizations.some(a => a.document.packageId === id)) throw new Error("V3_AUTHORIZED_PACKAGE_PRESERVED");
  const estimate = original.segments.reduce((sum, s) => sum + calculateManualEstimate("higgsfield", higgsfieldModels[original.source.mode], `${original.source.mode}-to-video`, s.durationMs).estimatedCostMicrousd, 0);
  if (!args.includes("--repair")) { console.info(JSON.stringify({ projectId: project, originalPackageId: id, current: true, estimatedCostMicrousd: estimate,
    pricingVersion: pricingConfiguration.version, providerCalls: 0, repairApplied: false }, null, 2)); return; }
  let task;
  try { task = taskSchema.parse(await store.rpc("ugc_v3_local_price_repair", { p_owner: owner, p_project: project, p_package: id, p_pricing_version: pricingConfiguration.version })); }
  catch (error) {
    if (!args.includes("--legacy-rpcs") || !(error instanceof Error) || error.message !== "V3_LOCAL_PRICING_SETUP_REQUIRED") throw error;
    // One-time compatibility with installed 085. Only the explicitly named project/package is touched.
    if (before.tasks.some(t => ["queued", "running", "reconciliation_required"].includes(t.status))) throw new Error("V3_REPAIR_ACTIVE_TASKS_PRESERVED");
    const existing = before.tasks.find(t => t.kind === "package" && t.input.replacesPackageId === id && t.input.pricingVersion === pricingConfiguration.version);
    if (!existing) await store.action(owner, project, "enqueue", { kind: "package", requestKey: `local-price-repair:${id}:${pricingConfiguration.version}`,
      input: { packageId: randomUUID(), packageVersion: before.packages.length + 1, sourceRevision: before.source.revision,
        replacesPackageId: id, pricingVersion: pricingConfiguration.version } });
    let w = await store.read(owner, project);
    task = w.tasks.find(t => t.kind === "package" && t.input.replacesPackageId === id && t.input.pricingVersion === pricingConfiguration.version);
    if (!task) throw new Error("V3_REPAIR_TASK_CHANGED");
    if (task.status === "failed") {
      await store.rpc("ugc_v3_package_begin", { p_owner: owner, p_project: project, p_input: before.source.input, p_bindings: before.source.private_bindings, p_retry_task: task.id });
      w = await store.read(owner, project);
    }
    if (task.status !== "done") {
      if (w.tasks.some(t => t.id !== task!.id && ["queued", "running"].includes(t.status))) throw new Error("V3_REPAIR_ACTIVE_TASKS_PRESERVED");
      const claimed = taskSchema.parse(await store.rpc("ugc_v3_task_claim", { p_project: project }));
      if (claimed.id !== task.id || claimed.kind !== "package") throw new Error("V3_REPAIR_TASK_CHANGED");
      task = claimed;
    }
  }
  if (task.status !== "done") await packageTask(store, task, await store.read(owner, project), AbortSignal.timeout(120_000));
  const after = await store.read(owner, project), replacement = readFrozenPackage(after.packages.find(p => p.id === task.input.packageId)?.document);
  if (approvalHash(before) !== approvalHash(after) || original.hash !== readFrozenPackage(after.packages.find(p => p.id === id)?.document).hash ||
    replacement.pricing.source !== "manual_provider_estimate" || replacement.pricing.totalMicrousd !== estimate || replacement.inputHash !== original.inputHash ||
    after.runtimeAuthorizations.length !== before.runtimeAuthorizations.length || after.runs.length !== before.runs.length) throw new Error("V3_REPAIR_VERIFICATION_FAILED");
  console.info(JSON.stringify({ projectId: project, originalPackageId: id, replacementPackageId: replacement.id, replacementVersion: replacement.version,
    estimatedCostMicrousd: replacement.pricing.totalMicrousd, pricing: replacement.pricing, segments: replacement.segments.map(s => ({ id: s.id, pricing: s.estimate.pricing })),
    approvedArtifactsPreserved: true, originalPackagePreserved: true, authorizationsCreated: 0, providerCalls: 0, videoTransportEnabled: false }, null, 2));
}
void main().catch(error => { console.error(error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "V3_LOCAL_PRICING_REPAIR_FAILED"); process.exitCode = 1; });
