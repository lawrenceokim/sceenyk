import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HiggsfieldVideoGenerationProvider } from "./adapters/higgsfield";
import { HiggsfieldTransportError, HiggsfieldV3Transport, exactBodyHash } from "./adapters/higgsfield-transport";
import { bindEstimateResponse } from "./adapters/higgsfield-pricing";
import { v3TransportConfig } from "./runtime-config";
import { privateAssetSchema, privateBindingSchema, quoteSchema, type Task } from "./runtime-contract";
import { buildFrozenPackage, restoreSegment, readFrozenPackage } from "./package";
import { initialExecution } from "./recovery";
import { v3Digest, normalizeCapabilities } from "./identity";
import type { PlanningContext } from "./contract";
import { approvedArtifacts, projectBrief, referenceOriginals, validityEvidence } from "./creative-inputs";
import { readPrivate, readSpool, saveSpool, signPrivate } from "./runtime-media";
import type { V3Store, RuntimeWorkspace } from "./runtime-store";
import type { PackageBuildDetails } from "./package-status";

// Readback proof belongs to the binding envelope, not the strict PrivateAsset document.
export const packageBindingSchema = privateBindingSchema;
const envelopeSchema = z.object({ document: z.unknown(), quote: quoteSchema.nullable() });
const safeCode = (error: unknown, fallback: string) => error instanceof Error && /^[A-Z0-9_]{1,100}(,[A-Z0-9_]{1,100})*$/.test(error.message) ? error.message.split(",")[0] : fallback;

export async function packageTask(store: V3Store, task: Task, w: RuntimeWorkspace, signal: AbortSignal) {
  const details: PackageBuildDetails = { stage: "validation", code: null, httpStatus: null, packageId: String(task.input.packageId), segmentId: null,
    estimateStatus: "not_requested", recoverable: false };
  const checkpoint = () => store.rpc("ugc_v3_package_checkpoint", { p_task: task.id, p_token: task.lease_token, p_details: details, p_failed: false });
  const stage = async (value: PackageBuildDetails["stage"]) => { details.stage = value; if (await checkpoint() !== true) throw new Error("V3_LEASE_LOST"); };
  try {
    await stage("validation");
    const source = w.source;
    if (!source?.current || source.revision !== task.input.sourceRevision) throw new Error("PACKAGE_STALE");
    const refs = approvedArtifacts(w, await projectBrief(w.project.owner_user_id, task.project_id), await referenceOriginals(w.project.owner_user_id, task.project_id));
    if (refs.length !== source.input.references.length || source.input.references.some(r => !refs.some(a => a.id === r.id && a.version === r.version))) throw new Error("APPROVED_INPUT_STALE");
    const provider = new HiggsfieldVideoGenerationProvider(), config = v3TransportConfig(), input = source.input;
    const saved = await readSpool(task.id, "package.json");
    let envelope: z.infer<typeof envelopeSchema>;
    if (saved) { envelope = envelopeSchema.parse(JSON.parse(saved.toString("utf8")));
      if (envelope.quote && Date.parse(envelope.quote.expiresAt) <= Date.now()) throw new Error("V3_PACKAGE_SAVED_ESTIMATE_EXPIRED");
      details.recoverable = true; }
    else {
      await stage("planning");
      const context: PlanningContext = { current: { workflow: input.workflow, profileId: input.profileId, scope: input.scope, provenance: input.provenance,
        package: input.package, storyboard: input.storyboard, references: input.references }, now: new Date().toISOString(), accountScope: config.accountScope || "estimate-unavailable",
        estimateEvidence: [], authorization: { id: randomUUID(), version: 1, projectId: task.project_id, packageHash: input.package.hash,
          inputFingerprint: v3Digest("input", input), capabilityHash: v3Digest("capabilities", normalizeCapabilities(provider.capabilities())),
          maxRequests: 0, maxCostMicrousd: 0, consumedRequests: 0, committedCostMicrousd: 0 } };
      const identity = { id: details.packageId, version: Number(task.input.packageVersion), sourceRevision: source.revision };
      const provisional = buildFrozenPackage(input, provider, context, identity), media = new Map<string, string>();
      await stage("delivery");
      let expiry = Date.now() + 5 * 60_000;
      for (const ref of input.references) {
        const result = packageBindingSchema.safeParse(source.private_bindings[ref.id]);
        if (!result.success) throw new Error("V3_PACKAGE_BINDING_INVALID");
        const binding = result.data, approved = refs.find(a => a.id === ref.id)!;
        if (v3Digest("asset", binding) !== v3Digest("asset", privateAssetSchema.parse(approved.document.asset))) throw new Error("APPROVED_INPUT_STALE");
        await readPrivate(binding.storageKey, binding.etag, binding.sizeBytes, signal, binding.sha256);
        const signed = await signPrivate(binding); media.set(ref.id, signed.url); expiry = Math.min(expiry, Date.parse(signed.expiresAt) - 30_000);
      }
      const segments = [];
      for (const segment of provisional.segments) {
        details.segmentId = segment.id; await stage("payload");
        const restored = restoreSegment(provisional, segment.id), request = provider.prepareRequest(restored, media);
        try {
          await stage("estimate");
          if (!config.credentials || !config.accountScope) throw new Error("V3_ESTIMATE_CONFIG_REQUIRED");
          details.estimateStatus = "requested"; await checkpoint();
          const estimate = await new HiggsfieldV3Transport(config).estimate(request.model, request.input, signal);
          context.estimateEvidence.push(bindEstimateResponse(restored.command, { usd: estimate.usd }, { providerId: "higgsfield", accountScope: config.accountScope,
            observedAt: context.now, expiresAt: new Date(expiry).toISOString() }));
          const cost = provider.estimateCost(restored.command, context.estimateEvidence, config.accountScope, context.now);
          if (cost.estimatedCostMicrousd === null) throw new Error("COST_ESTIMATE_UNAVAILABLE");
          segments.push({ segmentUuid: randomUUID(), segmentId: segment.id, segmentVersion: 1 as const, fingerprint: segment.fingerprint,
            model: request.model, body: request.input, bodyHash: exactBodyHash(request.input), estimatedCostMicrousd: cost.estimatedCostMicrousd, estimateResponseHash: estimate.responseHash });
        } catch (error) {
          // An unavailable quote does not discard a valid local plan or manufacture spending authority.
          if (safeCode(error, "").includes("LEASE")) throw error;
          details.code = safeCode(error, "COST_ESTIMATE_UNAVAILABLE"); details.httpStatus = error instanceof HiggsfieldTransportError ? error.httpStatus : null;
          details.estimateStatus = "unavailable"; break;
        }
      }
      if (details.estimateStatus !== "unavailable") details.estimateStatus = "available";
      else context.estimateEvidence = [];
      const document = buildFrozenPackage(input, provider, context, identity);
      const quote = details.estimateStatus === "available" ? quoteSchema.parse({ id: randomUUID(), projectId: task.project_id, packageId: document.id,
        packageHash: document.hash, currency: "USD", validityEvidence: await validityEvidence(), observedAt: context.now,
        expiresAt: new Date(expiry).toISOString(), segments, totalMicrousd: document.pricing.totalMicrousd }) : null;
      envelope = { document, quote };
      const bytes = Buffer.from(JSON.stringify(envelope));
      try { await saveSpool(task.id, "package.json", bytes); }
      catch (error) { const saved = await readSpool(task.id, "package.json"); if (!saved || !saved.equals(bytes)) throw error; }
      details.recoverable = true;
    }
    await stage("persistence");
    const document = readFrozenPackage(envelope.document), quote = envelope.quote;
    details.estimateStatus = quote ? "available" : "unavailable";
    details.stage = "ready"; details.recoverable = false;
    const commit = () => store.rpc("ugc_v3_package_commit", { p_owner: w.project.owner_user_id, p_project: task.project_id, p_task: task.id,
      p_token: task.lease_token, p_document: document, p_quote: quote, p_state: initialExecution(document), p_details: details });
    try {
      let committed;
      try { committed = await commit(); }
      catch (error) {
        if (safeCode(error, "") !== "V3_DATABASE_UNAVAILABLE") throw error;
        const refreshed = await store.read(w.project.owner_user_id, task.project_id);
        if (refreshed.tasks.some(t => t.id === task.id && t.status === "done") && refreshed.packages.some(p => p.id === document.id)) return;
        committed = await commit(); // Same immutable local envelope; no provider operation is replayed.
      }
      if (committed !== true) throw new Error("V3_LEASE_LOST");
    } catch (error) { details.stage = "persistence"; throw error; }
  } catch (error) {
    details.code = safeCode(error, details.stage === "planning" ? "V3_PACKAGE_PLAN_INVALID" : "V3_PACKAGE_BUILD_FAILED");
    // Only a valid durable envelope or saved package is recovery work. Raw failed inputs are not.
    try { const bytes = await readSpool(task.id, "package.json"); if (bytes) { const saved = envelopeSchema.parse(JSON.parse(bytes.toString("utf8"))); readFrozenPackage(saved.document);
      details.recoverable = !saved.quote || Date.parse(saved.quote.expiresAt) > Date.now(); } } catch { details.recoverable = false; }
    await store.rpc("ugc_v3_package_checkpoint", { p_task: task.id, p_token: task.lease_token, p_details: details, p_failed: true });
  }
}
