import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { requireClerkUser } from "@/lib/auth/require-user";
import { createDatabaseClient } from "@/lib/db/server";
import { saveProjectSchema } from "@/lib/projects/validation";
import { planningInputSchema, directorStoryboardSchema, type PlanningInput } from "./contract";
import { HIGGSFIELD_V3_PROFILE } from "./adapters/higgsfield";
import { higgsfieldRequestIssues } from "./adapters/higgsfield-validity";
import { readPrivate, signPrivate, readSpool } from "./runtime-media";
import { packageContentHash, storyboardContentHash, v3Digest, normalizeCapabilities } from "./identity";
import { HiggsfieldVideoGenerationProvider } from "./adapters/higgsfield";
import { readFrozenPackage } from "./package";
import { runtimePreflight, createPaidIntent, createRuntimeAuthorization } from "./execution-package";
import { V3Store, type RuntimeWorkspace } from "./runtime-store";
import { assertV3Operator, v3LocalEnabled, v3TransportConfig, v3OpenAIConfig } from "./runtime-config";
import { privateAssetSchema, qualitySchema, type Artifact, type Run, type PrivateAsset } from "./runtime-contract";
import { promises as fs } from "node:fs";

export async function validityEvidence() {
  const file = process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE;
  if (!file) return null;
  try { if ((await fs.stat(file)).size > 32768) return null; return JSON.parse(await fs.readFile(file, "utf8")) as unknown; } catch { return null; }
}
export const latestArtifact = (w: RuntimeWorkspace, kind: Artifact["kind"]) => w.artifacts.filter(a => a.kind === kind).at(-1);
export function approvedArtifacts(w: RuntimeWorkspace) {
  if (w.tasks.some(t => ["character", "product", "location", "storyboard"].includes(t.kind) && ["queued", "running", "reconciliation_required"].includes(t.status)))
    throw new Error("V3_CREATIVE_REQUEST_STILL_ACTIVE");
  const refs = [latestArtifact(w, "character"), latestArtifact(w, "product"), latestArtifact(w, "location")].filter((a): a is Artifact => !!a);
  if (!refs.some(a => a.kind === "character") || !refs.some(a => a.kind === "location") || refs.some(a => !a.approved_at || a.rejected_at)) throw new Error("APPROVE_CURRENT_REFERENCES_FIRST");
  return refs;
}
export async function projectBrief(owner: string, project: string) {
  const r = await createDatabaseClient().from("projects").select("id,title,prompt,aspect_ratio,duration,visual_style,tone,category,ugc_type")
    .eq("id", project).eq("owner_user_id", owner).is("deleted_at", null).maybeSingle();
  if (r.error || !r.data) throw new Error("FRESH_V3_PROJECT_REQUIRED"); return r.data;
}
export async function inspectRuntime(w: RuntimeWorkspace) {
  const docValue = w.packages.at(-1)?.document;
  if (!docValue) return null;
  const doc = readFrozenPackage(docValue), quote = w.quotes.find(q => q.document.packageId === doc.id)?.document;
  const authority = w.runtimeAuthorizations.find(a => a.document.packageId === doc.id)?.document;
  const validity = await validityEvidence(), issues = quote ? quote.segments.flatMap(s => higgsfieldRequestIssues(s.body, doc.source.references, quote.validityEvidence, new Date().toISOString())) : ["COST_ESTIMATE_UNAVAILABLE"];
  if (quote && v3Digest("validity-evidence", quote.validityEvidence) !== v3Digest("validity-evidence", validity)) issues.push("VALIDITY_EVIDENCE_CHANGED_REBUILD_PACKAGE");
  const config = v3TransportConfig(), currentIds = approvedArtifacts(w).map(a => a.id);
  if (!config.credentials || !config.accountScope) issues.push("HIGGSFIELD_CREDENTIALS_REQUIRED");
  if (config.accountScope !== doc.accountScope) issues.push("HIGGSFIELD_ESTIMATE_ACCOUNT_CHANGED");
  if (!config.outputHosts.length) issues.push("HIGGSFIELD_OUTPUT_ALLOWLIST_REQUIRED");
  if (w.runs.some(r => r.package_id !== doc.id && !["approved", "failed", "deleted"].includes(r.state))) issues.push("V3_PRIOR_OUTCOME_REQUIRES_RECONCILIATION");
  if (doc.capabilityHash !== v3Digest("capabilities", normalizeCapabilities(new HiggsfieldVideoGenerationProvider().capabilities()))) issues.push("PROVIDER_CAPABILITIES_CHANGED");
  if (quote && quote.segments.some(s => !w.runtimeAuthorizations.some(a => a.document.packageId === doc.id && a.document.segmentUuid === s.segmentUuid))) issues.push("V3_SEGMENT_AUTHORIZATION_REQUIRED");
  const current = !!w.source?.current && w.source.revision === doc.sourceRevision && doc.source.references.every(r => currentIds.includes(r.id)) &&
    !w.tasks.some(t => ["character", "product", "location", "storyboard"].includes(t.kind) && Date.parse(t.created_at) > Date.parse(w.source!.created_at)) &&
    latestArtifact(w, "storyboard")?.id === doc.source.storyboard.id && !!latestArtifact(w, "storyboard")?.approved_at;
  const report = runtimePreflight(doc, quote, authority, { current, transportEnabled: config.enabled && config.projectId === w.project.project_id && config.packageId === doc.id,
    now: new Date().toISOString(), validityIssues: issues, existingIntent: w.runs.some(r => r.package_id === doc.id) });
  return { ...report, authorizedMaximumMicrousd: authority ? w.runtimeAuthorizations.filter(a => a.document.packageId === doc.id).reduce((sum, a) => sum + a.document.maxEstimatedCostMicrousd, 0) : null };
}
export async function runtimeDto(w: RuntimeWorkspace) {
  let preflight = null; try { preflight = await inspectRuntime(w); } catch { /* Stale/partial creative inputs preserve previous previews. */ }
  const previewUrl = async (asset: PrivateAsset) => { try { return (await signPrivate(asset)).url; } catch { return null; } };
  const artifacts = await Promise.all(w.artifacts.map(async a => ({ id: a.id, kind: a.kind, version: a.version,
    approved: !!a.approved_at, rejected: !!a.rejected_at, storyboard: a.kind === "storyboard" ? directorStoryboardSchema.parse(a.document.storyboard) : null,
    preview: !a.rejected_at && a.document.asset ? await previewUrl(privateAssetSchema.parse(a.document.asset)) : null })));
  const runs = await Promise.all(w.runs.map(async r => ({ id: r.id, packageId: r.package_id, segmentId: r.intent.segmentId, state: r.state,
    current: r.current, completedAt: r.completed_at, errorCode: r.error_code, quality: r.quality, actualDurationMs: r.result?.durationMs ?? null, hasAudio: r.result?.hasAudio ?? null,
    preview: r.result && ["awaiting_review", "approved"].includes(r.state) ? await previewUrl(r.result) : null,
    expectedDialogue: w.packages.find(p => p.id === r.package_id) ? readFrozenPackage(w.packages.find(p => p.id === r.package_id)!.document).source.storyboardContent.scenes.flatMap(s => s.speech) : [],
    shotTimings: w.packages.find(p => p.id === r.package_id) ? readFrozenPackage(w.packages.find(p => p.id === r.package_id)!.document).source.storyboardContent.scenes.map(s => ({ number: s.number, startMs: s.startMs, endMs: s.endMs })) : [],
  })));
  const joined = await Promise.all(w.artifacts.filter(a => a.kind === "joined").map(async a => {
    const doc = readFrozenPackage(w.packages.find(p => p.id === a.document.packageId)?.document), asset = privateAssetSchema.parse(a.document.asset);
    const deletion = w.tasks.find(t => t.kind === "delete" && t.input.artifactId === a.id);
    const state: Run["state"] = a.approved_at ? "approved" : a.rejected_at ? deletion?.status === "done" ? "deleted" : "deleting" : "awaiting_review";
    return { id: a.id, packageId: doc.id, segmentId: "joined", state, completedAt: a.approved_at,
      current: !!w.source?.current && w.source.revision === doc.sourceRevision && w.runs.filter(r => r.package_id === doc.id).every(r => r.current),
      errorCode: deletion?.error_code ?? null, quality: null, actualDurationMs: asset.durationMs, hasAudio: asset.hasAudio,
      preview: !a.rejected_at ? await previewUrl(asset) : null, expectedDialogue: doc.source.storyboardContent.scenes.flatMap(s => s.speech),
      shotTimings: doc.source.storyboardContent.scenes.map(s => ({ number: s.number, startMs: s.startMs, endMs: s.endMs })) };
  }));
  const complete = !!preflight && (preflight.segmentCount === 1 ? runs : joined).some(r => r.packageId === preflight.packageId && r.current && r.state === "approved" && !!r.completedAt);
  return { projectId: w.project.project_id, artifacts, runs: [...runs, ...joined], preflight, complete,
    tasks: w.tasks.map(t => ({ id: t.id, kind: t.kind, status: t.status, errorCode: t.error_code })),
    processing: w.tasks.some(t => t.status === "running" || t.status === "queued" && !["PAID_V3_EXECUTION_DISABLED", "V3_ACTIVATION_SCOPE_MISMATCH"].includes(t.error_code ?? "")), localEnabled: v3LocalEnabled() };
}
export type RuntimeDto = Awaited<ReturnType<typeof runtimeDto>>;
export async function readOwnedV3(project: string) {
  const { userId } = await requireClerkUser(), db = createDatabaseClient();
  const user = await db.from("app_users").select("id").eq("clerk_user_id", userId).maybeSingle();
  if (user.error || !user.data) throw new Error("V3_ACCOUNT_UNAVAILABLE");
  return runtimeDto(await new V3Store().read(user.data.id, z.uuid().parse(project)));
}
export async function isOwnedV3Project(project: string) {
  const { userId } = await requireClerkUser(), db = createDatabaseClient();
  const user = await db.from("app_users").select("id").eq("clerk_user_id", userId).maybeSingle();
  if (user.error || !user.data) throw new Error("V3_ACCOUNT_UNAVAILABLE");
  const port = db as unknown as { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }> };
  const result = await port.rpc("ugc_v3_read", { p_owner: user.data.id, p_project: project });
  if (result.error?.code === "PGRST202") return false; // Before 076 no project can be enrolled.
  if (result.error) throw new Error("V3_ENROLLMENT_UNAVAILABLE");
  if (result.data === null) return false;
  const enrolled = z.object({ project: z.object({ project_id: z.uuid(), owner_user_id: z.uuid() }) }).safeParse(result.data);
  if (!enrolled.success || enrolled.data.project.project_id !== project || enrolled.data.project.owner_user_id !== user.data.id) throw new Error("V3_ENROLLMENT_UNAVAILABLE");
  return true;
}
const actionSchema = z.object({ action: z.enum(["create", "reference", "review_artifact", "storyboard", "build_package", "authorize", "generate", "recover", "recover_task", "approve", "reject_delete"]), projectId: z.uuid() }).passthrough();
export async function ownedV3Action(raw: unknown) {
  const a = actionSchema.parse(raw), user = await ensureAppUser(); assertV3Operator(user.id);
  const store = new V3Store(), signal = AbortSignal.timeout(120_000), now = new Date().toISOString();
  if (a.action === "create") {
    const fields = saveProjectSchema.parse(a.fields);
    if (fields.id !== a.projectId || fields.mode !== "create" || fields.creationType !== "ugc" || fields.prompt.length > 2000) throw new Error("FRESH_V3_PROJECT_REQUIRED");
    await store.rpc("ugc_v3_create_project", { p_owner: user.id, p_project: a.projectId, p_fields: fields });
    return runtimeDto(await store.read(user.id, a.projectId));
  }
  const w = await store.read(user.id, a.projectId), brief = await projectBrief(user.id, a.projectId);
  const enqueue = (kind: string, input: Record<string, unknown>, key = v3Digest("task-input", input)) => store.action(user.id, a.projectId, "enqueue", {
    kind, input, requestKey: `${kind}:${key}` });
  if (a.action === "reference") {
    const kind = z.enum(["character", "product", "location"]).parse(a.kind);
    const previous = latestArtifact(w, kind);
    if (previous && !previous.rejected_at && !previous.approved_at) throw new Error("REVIEW_EXISTING_REFERENCE_FIRST");
    if (kind === "location" && !latestArtifact(w, "character")?.approved_at) throw new Error("APPROVE_CHARACTER_FIRST");
    const assetId = kind === "location" ? null : z.uuid().parse(a.assetId);
    const openai = v3OpenAIConfig();
    await enqueue(kind, { brief, briefHash: v3Digest("brief", brief), model: openai.imageModel, originalId: assetId,
      references: w.artifacts.filter(r => ["character", "product"].includes(r.kind) && !!r.approved_at && !r.rejected_at).map(r => r.id),
      previous: previous?.id ?? null });
  } else if (a.action === "review_artifact") {
    await store.action(user.id, a.projectId, "review_artifact", { id: z.uuid().parse(a.id), decision: z.enum(["approve", "reject"]).parse(a.decision) });
  } else if (a.action === "storyboard") {
    const refs = approvedArtifacts(w), previous = latestArtifact(w, "storyboard");
    const oldInput = z.object({ references: z.array(z.string()), briefHash: z.string() }).safeParse(previous?.document.input);
    const changed = previous && (!oldInput.success || v3Digest("reference-ids", oldInput.data.references) !==
      v3Digest("reference-ids", refs.map(r => r.id)) || oldInput.data.briefHash !== v3Digest("brief", brief));
    if (previous && !previous.rejected_at && !changed) throw new Error("REVIEW_EXISTING_STORYBOARD_FIRST");
    await enqueue("storyboard", { brief, briefHash: v3Digest("brief", brief), model: v3OpenAIConfig().directorModel, references: refs.map(r => r.id), previous: previous?.id ?? null });
  } else if (a.action === "build_package") {
    const refs = approvedArtifacts(w), storyboard = latestArtifact(w, "storyboard");
    if (!storyboard?.approved_at || storyboard.rejected_at) throw new Error("APPROVE_STORYBOARD_FIRST");
    const storyboardInput = z.object({ references: z.array(z.uuid()), briefHash: z.string() }).parse(storyboard.document.input);
    if (v3Digest("reference-ids", storyboardInput.references) !== v3Digest("reference-ids", refs.map(r => r.id)) || storyboardInput.briefHash !== v3Digest("brief", brief))
      throw new Error("STORYBOARD_STALE_REGENERATE");
    const character = refs.find(r => r.kind === "character")!, original = z.object({ id: z.uuid(), sha256: z.string() }).parse(character.document.original);
    const input: PlanningInput = planningInputSchema.parse({ workflow: "final-video-v3", profileId: HIGGSFIELD_V3_PROFILE,
      scope: { ownerId: user.id, projectId: a.projectId, jobId: w.project.logical_job_id },
      provenance: { projectWorkflow: "final-video-v3", originalImageId: original.id, originalImageHash: original.sha256 },
      package: { id: randomUUID(), version: w.packages.length + 1, hash: "0".repeat(64), approvedAt: now },
      storyboard: { id: storyboard.id, version: storyboard.version, hash: storyboardContentHash(directorStoryboardSchema.parse(storyboard.document.storyboard)), approvedAt: storyboard.approved_at },
      direction: brief.prompt, storyboardContent: storyboard.document.storyboard, mode: "reference", resolution: "480p", format: "mp4", generateAudio: true,
      references: refs.map(r => { const asset = privateAssetSchema.parse(r.document.asset); return { id: r.id, projectId: a.projectId, originWorkflow: "final-video-v3", role: r.kind,
        kind: "image", name: r.kind, version: r.version, approvalId: r.id, approvalVersion: r.version, sha256: asset.sha256,
        sizeBytes: asset.sizeBytes, mimeType: asset.mimeType, durationMs: null }; }), requiredCapabilities: [] });
    input.package.hash = packageContentHash(input);
    const bindings: Record<string, unknown> = {};
    for (const ref of refs) { const asset = privateAssetSchema.parse(ref.document.asset);
      await readPrivate(asset.storageKey, asset.etag, asset.sizeBytes, signal, asset.sha256);
      bindings[ref.id] = { ...asset, verifiedReadback: true };
    }
    await store.action(user.id, a.projectId, "source", { input, privateBindings: bindings });
    const updated = await store.read(user.id, a.projectId);
    await enqueue("package", { sourceRevision: updated.source!.revision, packageId: randomUUID(), packageVersion: w.packages.length + 1 });
  } else if (a.action === "authorize") {
    const doc = readFrozenPackage(w.packages.at(-1)?.document), quote = w.quotes.find(q => q.document.packageId === doc.id)?.document;
    if (a.packageId !== doc.id || a.packageHash !== doc.hash || a.quoteId !== quote?.id) throw new Error("V3_REVIEW_SNAPSHOT_CHANGED");
    if (!quote || a.operatorApproved !== true) throw new Error("CURRENT_QUOTE_AND_OPERATOR_APPROVAL_REQUIRED");
    const maximum = z.number().int().nonnegative().safe().parse(a.maximumMicrousd);
    if (maximum < quote.totalMicrousd) throw new Error("V3_PACKAGE_AUTHORIZATION_INSUFFICIENT");
    for (const [index, segment] of quote.segments.entries()) {
      if (w.runtimeAuthorizations.some(x => x.document.segmentUuid === segment.segmentUuid)) continue;
      const auth = createRuntimeAuthorization(doc, quote, segment.segmentUuid, { operatorId: user.id, approved: true,
        maximumMicrousd: segment.estimatedCostMicrousd + (index === 0 ? maximum - quote.totalMicrousd : 0), packageMaximumMicrousd: maximum, now });
      await store.action(user.id, a.projectId, "authorize", { document: auth });
    }
  } else if (a.action === "generate") {
    const preflight = await inspectRuntime(w); if (!preflight?.eligibleForPaidSubmission) throw new Error(preflight?.issues[0] ?? "V3_PREFLIGHT_REQUIRED");
    // The web request records intent only. The separate local worker is the only submitter.
    const doc = readFrozenPackage(w.packages.at(-1)?.document), quote = w.quotes.find(q => q.document.packageId === doc.id)!.document;
    if (a.packageId !== doc.id || a.packageHash !== doc.hash) throw new Error("V3_REVIEW_SNAPSHOT_CHANGED");
    for (const segment of quote.segments) {
      const auth = w.runtimeAuthorizations.find(x => x.document.segmentUuid === segment.segmentUuid)!.document;
      await store.action(user.id, a.projectId, "generate", { intent: createPaidIntent(doc, quote, auth, now) });
    }
  } else if (a.action === "recover") {
    const joined = w.artifacts.some(j => j.id === a.id && j.kind === "joined");
    await store.action(user.id, a.projectId, joined ? "recover_delete" : "recover", { id: z.uuid().parse(a.id) });
  } else if (a.action === "recover_task") {
    const task = w.tasks.find(t => t.id === a.id);
    if (!task || task.kind !== "join" && (!["character", "product", "location", "storyboard"].includes(task.kind) || !await readSpool(task.id, "openai-response.json")))
      throw new Error("V3_NO_SAVED_OPENAI_RESPONSE");
    await store.action(user.id, a.projectId, "recover_task", { id: task.id });
  } else {
    const run = w.runs.find(r => r.id === a.id), joined = w.artifacts.find(j => j.id === a.id && j.kind === "joined");
    const result = run?.result ?? (joined ? privateAssetSchema.parse(joined.document.asset) : null);
    if (!result) throw new Error("V3_RESULT_UNAVAILABLE");
    const quality = qualitySchema.parse(a.quality);
    if (a.action === "approve") {
      const doc = readFrozenPackage(w.packages.find(p => p.id === (run?.package_id ?? joined?.document.packageId))!.document), speech = doc.source.storyboardContent.scenes.flatMap(s => s.speech);
      if (Object.entries(quality).some(([k, v]) => k !== "notes" && (v === "fail" || v === "not_checked")) ||
        speech.length && [quality.dialoguePresence, quality.speechTiming].some(v => v !== "pass") ||
        speech.some(s => s.speaker === "character") && quality.lipAudioSync !== "pass") throw new Error("V3_QUALITY_REVIEW_REQUIRED");
      await readPrivate(result.storageKey, result.etag, result.sizeBytes, signal, result.sha256);
    }
    await store.action(user.id, a.projectId, joined ? a.action === "approve" ? "approve_joined" : "reject_joined" : a.action, { id: run?.id ?? joined!.id, quality });
    if (run && a.action === "approve") {
      const refreshed = await store.read(user.id, a.projectId), doc = readFrozenPackage(w.packages.find(p => p.id === run.package_id)!.document);
      if (doc.segments.length > 1 && doc.segments.every(s => refreshed.runs.some(r => r.package_id === doc.id && r.intent.segmentId === s.id && r.state === "approved")))
        await enqueue("join", { packageId: doc.id, packageHash: doc.hash }, doc.hash);
    }
  }
  return runtimeDto(await store.read(user.id, a.projectId));
}
