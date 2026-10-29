import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { assertFinalOperator } from "@/lib/final-video-generation/operator";
import { saveProjectSchema } from "@/lib/projects/validation";
import { readR2AnalysisMedia } from "@/lib/storage/r2";
import { digestSchema, planningInputSchema, type EstimateEvidence, type PlanningContext } from "./contract";
import { assertPaidV3Execution, normalizeCapabilities, v3Digest } from "./identity";
import { buildFrozenPackage, readFrozenPackage, type FrozenPackage } from "./package";
import { bindAuthorization, authorizationSchema } from "./authorization";
import { initialExecution, reduceExecution, executionSchema } from "./recovery";
import { HiggsfieldVideoGenerationProvider, higgsfieldModels } from "./adapters/higgsfield";
import { inspectV3Package } from "./preflight";

// This narrow port adds only V3 RPCs, without changing historical database types.
type RpcName = "ugc_v3_create_project" | "ugc_v3_read" | "ugc_v3_write";
type RpcPort = { rpc(name: RpcName, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
const bindingSchema = z.strictObject({ storageKey: z.string().min(1).max(1000), etag: z.string().min(1).max(200), sha256: digestSchema });
const workspaceSchema = z.object({ project: z.object({ project_id: z.uuid(), owner_user_id: z.uuid(), logical_job_id: z.uuid() }),
  source: z.object({ revision: z.number().int(), input: planningInputSchema, input_hash: digestSchema, current: z.boolean() }).nullable(),
  packages: z.array(z.object({ id: z.uuid(), document: z.unknown() })),
  authorizations: z.array(z.object({ document: authorizationSchema })),
  events: z.array(z.object({ package_id: z.uuid(), revision: z.number().int(), state: executionSchema })) });
async function verifyBytes(key: string, etag: string, size: number, sha256: string, signal: AbortSignal) {
  // This profile accepts small image references only; this is an application bound, not a claimed provider limit.
  if (!Number.isSafeInteger(size) || size < 1 || size > 20 * 1024 * 1024) throw new Error("V3_IMAGE_SIZE_INVALID");
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  const reader = (await readR2AnalysisMedia(key, etag, size, bounded)).getReader(), hash = createHash("sha256");
  let count = 0;
  try {
    while (true) {
      bounded.throwIfAborted(); const part = await reader.read(); if (part.done) break;
      count += part.value.length; if (count > size) throw new Error("V3_REFERENCE_SIZE_MISMATCH"); hash.update(part.value);
    }
    if (count !== size || hash.digest("hex") !== sha256) throw new Error("V3_REFERENCE_HASH_MISMATCH");
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

class OwnedV3Workspace {
  private readonly db = createDatabaseClient() as unknown as RpcPort;
  constructor(private readonly ownerId: string) {}
  private async rpc(name: RpcName, args: Record<string, unknown>) {
    const result = await this.db.rpc(name, { ...args, p_owner: this.ownerId });
    if (result.error) throw new Error("V3_PERSISTENCE_UNAVAILABLE");
    return result.data;
  }
  async createFreshProject(raw: unknown) {
    assertFinalOperator(this.ownerId);
    const input = saveProjectSchema.parse(raw);
    if (input.mode !== "create" || input.creationType !== "ugc") throw new Error("FRESH_V3_PROJECT_REQUIRED");
    return this.rpc("ugc_v3_create_project", { p_project: input.id, p_fields: input });
  }
  async read(projectId: string) {
    const value = await this.rpc("ugc_v3_read", { p_project: z.uuid().parse(projectId) });
    if (!value) throw new Error("FRESH_V3_PROJECT_REQUIRED");
    return workspaceSchema.parse(value);
  }
  // Trusted V3 upstream/operator import only. No route accepts client approval/hash claims.
  // Explicit operator review approves these new creative sources; readback proves bytes, not AI authorship or visual fidelity.
  async captureReviewedSource(projectId: string, raw: unknown, bindings: unknown, expectedRevision: number,
    operatorApproved: boolean, signal: AbortSignal) {
    assertFinalOperator(this.ownerId);
    if (operatorApproved !== true) throw new Error("OPERATOR_SOURCE_REVIEW_REQUIRED");
    const workspace = await this.read(projectId), input = planningInputSchema.parse(raw);
    if (input.scope.projectId !== projectId || input.scope.ownerId !== this.ownerId || input.scope.jobId !== workspace.project.logical_job_id ||
      input.resolution !== "480p" || input.format !== "mp4" || input.mode !== "reference" || !input.generateAudio) throw new Error("V3_SOURCE_SCOPE_INVALID");
    const privateBindings = z.record(z.uuid(), bindingSchema).parse(bindings), verified: Record<string, unknown> = {};
    const original = await createDatabaseClient().from("project_assets").select("id,storage_key,verified_etag,size_bytes")
      .eq("id", input.provenance.originalImageId).eq("project_id", projectId).eq("owner_user_id", this.ownerId).eq("upload_status", "uploaded").maybeSingle();
    if (original.error || !original.data?.verified_etag) throw new Error("FRESH_PRIVATE_ORIGINAL_REQUIRED");
    await verifyBytes(original.data.storage_key, original.data.verified_etag, original.data.size_bytes, input.provenance.originalImageHash, signal);
    for (const ref of input.references) {
      const b = privateBindings[ref.id];
      if (!b || ref.projectId !== projectId || ref.kind !== "image" || b.sha256 !== ref.sha256 ||
        !b.storageKey.startsWith(`users/${this.ownerId}/projects/${projectId}/v3/`) || /\.\.|[?#:\\]/.test(b.storageKey)) throw new Error("PRIVATE_V3_REFERENCE_REQUIRED");
      await verifyBytes(b.storageKey, b.etag, ref.sizeBytes, ref.sha256, signal);
      verified[ref.id] = { ...b, verifiedReadback: true };
    }
    return this.rpc("ugc_v3_write", { p_project: projectId, p_action: "source", p_payload: { input, expectedRevision,
      privateBindings: verified, operatorId: this.ownerId, operatorApproved: true } });
  }
  async freezePackage(projectId: string, estimateEvidence: EstimateEvidence[] = [], accountScope = "unverified-account") {
    assertFinalOperator(this.ownerId);
    const workspace = await this.read(projectId), source = workspace.source;
    if (!source) throw new Error("APPROVED_V3_SOURCE_REQUIRED");
    if (!source.current) throw new Error("PACKAGE_STALE");
    const input = source.input, provider = new HiggsfieldVideoGenerationProvider(), now = new Date().toISOString();
    const context: PlanningContext = { current: { workflow: input.workflow, scope: input.scope, profileId: input.profileId,
      provenance: input.provenance, package: input.package, storyboard: input.storyboard, references: input.references },
      now, estimateEvidence, accountScope,
      // Phase 1 planning's legacy-shaped snapshot is deny-all and never persisted as spending authority.
      authorization: { id: randomUUID(), version: 1, projectId, packageHash: input.package.hash, inputFingerprint: v3Digest("input", input),
        capabilityHash: v3Digest("capabilities", normalizeCapabilities(provider.capabilities())), maxRequests: 0, maxCostMicrousd: 0,
        consumedRequests: 0, committedCostMicrousd: 0 } };
    const doc = buildFrozenPackage(input, provider, context, { id: randomUUID(), version: workspace.packages.length + 1, sourceRevision: source.revision });
    await this.rpc("ugc_v3_write", { p_project: projectId, p_action: "package", p_payload: { document: doc, state: initialExecution(doc), eventId: randomUUID() } });
    return doc;
  }
  async authorize(projectId: string, packageId: string, approval: { operatorApproved: boolean; maxRequests: number; maxEstimatedCostMicrousd: number; expiresAt: string }) {
    assertFinalOperator(this.ownerId);
    if (!approval.operatorApproved) throw new Error("OPERATOR_APPROVAL_REQUIRED");
    const workspace = await this.read(projectId), doc = this.package(workspace, packageId);
    const authority = bindAuthorization(doc, new HiggsfieldVideoGenerationProvider(), { ...approval, id: randomUUID(),
      operatorId: this.ownerId, model: higgsfieldModels[doc.source.mode], approvedAt: new Date().toISOString() });
    const state = workspace.events.filter(e => e.package_id === doc.id).at(-1)?.state ?? initialExecution(doc);
    await this.rpc("ugc_v3_write", { p_project: projectId, p_action: "authorization", p_payload: { document: authority,
      expectedRevision: state.revision, eventId: randomUUID(), state: reduceExecution(doc, state, { type: "authorize" }) } });
    return authority;
  }
  private package(workspace: z.infer<typeof workspaceSchema>, packageId: string): FrozenPackage {
    const row = workspace.packages.find(p => p.id === z.uuid().parse(packageId));
    if (!row) throw new Error("PACKAGE_NOT_FOUND");
    return readFrozenPackage(row.document);
  }
  async inspect(projectId: string, packageId: string) {
    const workspace = await this.read(projectId), doc = this.package(workspace, packageId);
    return inspectV3Package(doc, { currentInput: workspace.source?.input, sourceRevision: workspace.source?.revision ?? 0,
      sourceCurrent: workspace.source?.current ?? false, now: new Date().toISOString(),
      authorization: workspace.authorizations.filter(a => a.document.packageId === doc.id).at(-1)?.document,
      execution: workspace.events.filter(e => e.package_id === doc.id).at(-1)?.state });
  }
  generate(): never { return assertPaidV3Execution(); }
  retry(): never { return assertPaidV3Execution(); }
}
// Acting owner is always derived from authenticated Clerk identity, never an argument.
export async function ownedV3Workspace() { return new OwnedV3Workspace((await ensureAppUser()).id); }
