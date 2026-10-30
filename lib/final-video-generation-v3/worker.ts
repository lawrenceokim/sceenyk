import "server-only";
import OpenAI, { toFile } from "openai";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { createDatabaseClient } from "@/lib/db/server";
import { OpenAICreativeDirectorProvider } from "./adapters/openai";
import { HiggsfieldVideoGenerationProvider } from "./adapters/higgsfield";
import { HiggsfieldV3Transport, HiggsfieldTransportError, exactBodyHash } from "./adapters/higgsfield-transport";
import { bindEstimateResponse } from "./adapters/higgsfield-pricing";
import { assertV3Operator, assertV3Transport, v3OpenAIConfig, v3TransportConfig } from "./runtime-config";
import { V3Store, type RuntimeWorkspace } from "./runtime-store";
import { taskSchema, privateAssetSchema, quoteSchema, type Task } from "./runtime-contract";
import { executeV3Segment } from "./execution";
import { joinV3Segments } from "./join";
import { directorStoryboardSchema, type PlanningContext } from "./contract";
import { buildFrozenPackage, restoreSegment, readFrozenPackage } from "./package";
import { initialExecution } from "./recovery";
import { normalizeCapabilities, v3Digest } from "./identity";
import { bytesHash, readPrivate, inspectImage, publishPrivate, signPrivate, saveSpool, readSpool, inspectVideo, deletePrivate, spoolFile } from "./runtime-media";
import { projectBrief, validityEvidence } from "./runtime-server";
import { higgsfieldRequestIssues } from "./adapters/higgsfield-validity";

async function approvedBytes(w: RuntimeWorkspace, ids: unknown, signal: AbortSignal) {
  if (!Array.isArray(ids) || !ids.length || ids.some(v => typeof v !== "string")) throw new Error("V3_REFERENCES_REQUIRED");
  return Promise.all(ids.map(async id => {
    const a = w.artifacts.find(a => a.id === id);
    if (!a?.approved_at || a.rejected_at || w.artifacts.some(n => n.kind === a.kind && n.version > a.version)) throw new Error("V3_REFERENCE_STALE");
    const asset = privateAssetSchema.parse(a.document.asset);
    return { asset, bytes: await readPrivate(asset.storageKey, asset.etag, asset.sizeBytes, signal, asset.sha256) };
  }));
}
async function imageTask(store: V3Store, task: Task, w: RuntimeWorkspace, signal: AbortSignal) {
  const model = z.string().min(1).parse(task.input.model), brief = await projectBrief(w.project.owner_user_id, task.project_id);
  if (v3Digest("brief", brief) !== task.input.briefHash) throw new Error("V3_CREATIVE_INPUT_STALE");
  let original: { id: string; sha256: string } | null = null, inputs: Buffer[] = [];
  if (task.kind !== "location") {
    const asset = await createDatabaseClient().from("project_assets").select("id,storage_key,verified_etag,size_bytes,mime_type,created_at")
      .eq("id", String(task.input.originalId)).eq("project_id", task.project_id).eq("owner_user_id", w.project.owner_user_id).eq("upload_status", "uploaded").maybeSingle();
    if (asset.error || !asset.data?.verified_etag || asset.data.size_bytes > 20 * 1024 * 1024) throw new Error("FRESH_PRIVATE_ORIGINAL_REQUIRED");
    const raw = await readPrivate(asset.data.storage_key, asset.data.verified_etag, asset.data.size_bytes, signal);
    original = { id: asset.data.id, sha256: bytesHash(raw) }; inputs = [(await inspectImage(raw)).bytes];
  } else inputs = (await approvedBytes(w, task.input.references, signal)).map(r => r.bytes);
  let raw = await readSpool(task.id, "openai-response.json");
  if (!raw) {
    if (task.provider_started) throw new Error("V3_OPENAI_OUTCOME_UNKNOWN");
    const config = v3OpenAIConfig();
    const client = new OpenAI({ apiKey: config.apiKey, maxRetries: 0, timeout: 600_000, logLevel: "off" });
    const prompt = `Create a single approved-reference candidate for this fresh project. Role: ${task.kind}. ` +
      (task.kind === "character" ? "Regenerate the supplied Character with preserved identity and requested visual style, clear full-body appearance and outfit, one subject, neutral presentation. " :
        task.kind === "product" ? "Regenerate the supplied Product/Prop faithfully, preserving shape, colors and visible identifiers, one product, neutral presentation. " :
          "Create one primary Location suitable for the approved Character/Product and project. Show the environment clearly and preserve approved visual continuity. ") +
      `Creative brief: ${brief.prompt}. Visual style: ${brief.visual_style}. Tone: ${brief.tone}. Do not invent extra people or products.`;
    await store.checkpoint(task, "intent");
    const response = await client.images.edit({ model, image: await Promise.all(inputs.map((b, i) => toFile(b, `reference-${i}.png`, { type: "image/png" }))),
      prompt, n: 1, size: "1024x1024", quality: "high", output_format: "png", background: "opaque" },
    { signal, headers: { "X-Client-Request-Id": task.id } });
    raw = Buffer.from(JSON.stringify({ response, requestId: response._request_id ?? null })); await saveSpool(task.id, "openai-response.json", raw);
  }
  const saved = JSON.parse(raw.toString("utf8")) as { response: { data?: { b64_json?: string }[] }; requestId: string | null }, response = saved.response;
  const encoded = response.data?.length === 1 ? response.data[0].b64_json : null;
  if (!encoded || encoded.length > 30 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("V3_IMAGE_RESPONSE_INVALID");
  const image = await inspectImage(Buffer.from(encoded, "base64")); await saveSpool(task.id, "image.png", image.bytes);
  const asset = await publishPrivate(w.project.owner_user_id, task.project_id, task.id, image.bytes, image.metadata, signal);
  await store.checkpoint(task, "artifact", { id: task.id, document: { asset, original, input: task.input, provider: "openai", model,
    responseHash: bytesHash(raw), requestId: saved.requestId } });
}
async function storyboardTask(store: V3Store, task: Task, w: RuntimeWorkspace, signal: AbortSignal) {
  const model = z.string().min(1).parse(task.input.model), brief = await projectBrief(w.project.owner_user_id, task.project_id);
  if (v3Digest("brief", brief) !== task.input.briefHash) throw new Error("V3_CREATIVE_INPUT_STALE");
  const refs = await approvedBytes(w, task.input.references, signal);
  let raw = await readSpool(task.id, "openai-response.json");
  if (!raw) {
    if (task.provider_started) throw new Error("V3_OPENAI_OUTCOME_UNKNOWN");
    const config = v3OpenAIConfig(), provider = new OpenAICreativeDirectorProvider({ model, maxOutputTokens: 14_000 });
    const request = provider.prepareStoryboard({ instruction: `${brief.prompt}\nAspect ratio: ${brief.aspect_ratio}. Visual style: ${brief.visual_style}. Tone: ${brief.tone}. ` +
      `Approved reference roles in image order: ${(task.input.references as string[]).map(id => w.artifacts.find(a => a.id === id)!.kind).join(", ")}. ` +
      "Use whole-second contiguous scenes with exact total duration; scenes may share one continuous generation. Include realistic dialogue windows, pacing and all film direction. Without a supplied Product reference do not invent a product.",
      durationMs: Number(brief.duration) * 1000, referenceUrls: [] });
    request.body.input = [{ role: "user", content: [{ type: "input_text", text: `${brief.prompt}\nExact duration: ${Number(brief.duration) * 1000}ms. Aspect ratio: ${brief.aspect_ratio}. ` +
      `Visual style: ${brief.visual_style}. Tone: ${brief.tone}. Approved roles: ${(task.input.references as string[]).map(id => w.artifacts.find(a => a.id === id)!.kind).join(", ")}. ` +
      "Use contiguous whole-second scene boundaries, realistic speech windows and explicit camera, action, reaction, lighting, pacing, continuity and sound direction. Do not invent an absent Product." },
      ...refs.map(r => ({ type: "input_image" as const, image_url: `data:image/png;base64,${r.bytes.toString("base64")}`, detail: "high" as const }))] }];
    const client = new OpenAI({ apiKey: config.apiKey, maxRetries: 0, timeout: 600_000, logLevel: "off" });
    await store.checkpoint(task, "intent");
    const response = await client.responses.create(request.body, { signal, headers: { "X-Client-Request-Id": task.id } });
    raw = Buffer.from(JSON.stringify({ response, requestId: response._request_id ?? null })); await saveSpool(task.id, "openai-response.json", raw);
  }
  const captured = JSON.parse(raw.toString("utf8")) as { response: { output?: { type: string; content?: { type: string; text?: string }[] }[] }; requestId: string | null }, response = captured.response;
  const text = response.output?.flatMap(o => o.type === "message" ? o.content?.filter(c => c.type === "output_text").map(c => c.text ?? "") ?? [] : []).join("");
  const storyboard = directorStoryboardSchema.parse(JSON.parse(text ?? ""));
  if (storyboard.durationMs !== Number(brief.duration) * 1000 || storyboard.aspectRatio !== brief.aspect_ratio) throw new Error("V3_DIRECTOR_TIMING_INVALID");
  await store.checkpoint(task, "artifact", { id: task.id, document: { storyboard, input: task.input, provider: "openai", model, responseHash: bytesHash(raw), requestId: captured.requestId } });
}
async function packageTask(store: V3Store, task: Task, w: RuntimeWorkspace, signal: AbortSignal) {
  const source = w.source;
  if (!source?.current || source.revision !== task.input.sourceRevision) throw new Error("PACKAGE_STALE");
  const provider = new HiggsfieldVideoGenerationProvider(), config = v3TransportConfig(), transport = new HiggsfieldV3Transport(config), input = source.input;
  const context: PlanningContext = { current: { workflow: input.workflow, profileId: input.profileId, scope: input.scope, provenance: input.provenance,
    package: input.package, storyboard: input.storyboard, references: input.references }, now: new Date().toISOString(), accountScope: config.accountScope, estimateEvidence: [],
    authorization: { id: randomUUID(), version: 1, projectId: task.project_id, packageHash: input.package.hash, inputFingerprint: v3Digest("input", input),
      capabilityHash: v3Digest("capabilities", normalizeCapabilities(provider.capabilities())), maxRequests: 0, maxCostMicrousd: 0, consumedRequests: 0, committedCostMicrousd: 0 } };
  const identity = { id: String(task.input.packageId), version: Number(task.input.packageVersion), sourceRevision: source.revision };
  const saved = await readSpool(task.id, "package.json");
  let envelope;
  if (saved) envelope = JSON.parse(saved.toString("utf8")) as { document: unknown; quote: unknown };
  else {
    const provisional = buildFrozenPackage(input, provider, context, identity), media = new Map<string, string>();
    let expiry = Date.now() + 5 * 60_000;
    for (const ref of input.references) {
      const binding = privateAssetSchema.parse(source.private_bindings[ref.id]);
      await readPrivate(binding.storageKey, binding.etag, binding.sizeBytes, signal, binding.sha256);
      const signed = await signPrivate(binding); media.set(ref.id, signed.url); expiry = Math.min(expiry, Date.parse(signed.expiresAt) - 30_000);
    }
    const segments = [];
    for (const segment of provisional.segments) {
      const restored = restoreSegment(provisional, segment.id), request = provider.prepareRequest(restored, media);
      const estimate = await transport.estimate(request.model, request.input, signal);
      context.estimateEvidence.push(bindEstimateResponse(restored.command, { usd: estimate.usd }, { providerId: "higgsfield", accountScope: config.accountScope,
        observedAt: context.now, expiresAt: new Date(expiry).toISOString() }));
      const cost = provider.estimateCost(restored.command, context.estimateEvidence, config.accountScope, context.now);
      if (cost.estimatedCostMicrousd === null) throw new Error("COST_ESTIMATE_UNAVAILABLE");
      segments.push({ segmentUuid: randomUUID(), segmentId: segment.id, segmentVersion: 1 as const, fingerprint: segment.fingerprint,
        model: request.model, body: request.input, bodyHash: exactBodyHash(request.input), estimatedCostMicrousd: cost.estimatedCostMicrousd, estimateResponseHash: estimate.responseHash });
    }
    const document = buildFrozenPackage(input, provider, context, identity);
    const quote = quoteSchema.parse({ id: randomUUID(), projectId: task.project_id, packageId: document.id, packageHash: document.hash, currency: "USD", validityEvidence: await validityEvidence(),
      observedAt: context.now, expiresAt: new Date(expiry).toISOString(), segments, totalMicrousd: document.pricing.totalMicrousd });
    envelope = { document, quote }; await saveSpool(task.id, "package.json", Buffer.from(JSON.stringify(envelope)));
  }
  const document = readFrozenPackage(envelope.document), quote = quoteSchema.parse(envelope.quote);
  await store.rpc("ugc_v3_write", { p_owner: w.project.owner_user_id, p_project: task.project_id, p_action: "package", p_payload: {
    document, state: initialExecution(document), eventId: task.id } });
  const refreshed = await store.read(w.project.owner_user_id, task.project_id);
  if (!refreshed.quotes.some(q => q.document.id === quote.id)) await store.action(w.project.owner_user_id, task.project_id, "quote", { document: quote });
  await store.checkpoint(task, "done");
}
async function videoTask(store: V3Store, task: Task, w: RuntimeWorkspace, signal: AbortSignal) {
  const run = w.runs.find(r => r.id === task.input.runId); if (!run) throw new Error("V3_RUN_NOT_FOUND");
  if (run.result) { await store.checkpoint(task, "done"); return; }
  const config = v3TransportConfig(), transport = new HiggsfieldV3Transport(config);
  const doc = readFrozenPackage(w.packages.find(p => p.id === run.package_id)!.document), segment = doc.segments.find(s => s.id === run.intent.segmentId)!;
  await executeV3Segment(run, task.provider_started, { provider: transport, beforeSubmit: async intent => {
    assertV3Transport(config, intent);
    if (config.accountScope !== doc.accountScope) throw new Error("HIGGSFIELD_ESTIMATE_ACCOUNT_CHANGED");
    const quote = w.quotes.find(q => q.document.packageId === run.package_id)?.document;
    const validity = await validityEvidence(), issues = higgsfieldRequestIssues(intent.body, doc.source.references, quote?.validityEvidence, new Date().toISOString());
    if (!quote || v3Digest("validity-evidence", validity) !== v3Digest("validity-evidence", quote.validityEvidence)) issues.push("VALIDITY_EVIDENCE_CHANGED");
    if (issues.length) throw new Error(issues[0]);
  },
    checkpoint: (action, payload) => store.checkpoint(task, action, payload), readSaved: name => readSpool(run.id, name),
    save: (name, bytes) => saveSpool(run.id, name, bytes), validateAndPublish: async bytes => {
      const metadata = await inspectVideo(run.id, bytes, { durationMs: segment.durationMs, aspectRatio: doc.source.storyboardContent.aspectRatio, generateAudio: true });
      return publishPrivate(w.project.owner_user_id, task.project_id, run.id, bytes, metadata, signal);
    } }, signal);
}
async function deleteTask(store: V3Store, task: Task, w: RuntimeWorkspace, signal: AbortSignal) {
  const run = w.runs.find(r => r.id === task.input.runId);
  const joined = w.artifacts.find(a => a.id === task.input.artifactId && a.kind === "joined" && !!a.rejected_at);
  const asset = run?.state === "deleting" ? run.result : joined ? privateAssetSchema.parse(joined.document.asset) : null;
  if (!asset) throw new Error("V3_DELETE_UNAVAILABLE");
  await deletePrivate(w.project.owner_user_id, task.project_id, asset, signal);
  for (const name of ["result.bytes", "video.mp4"]) {
    try { await fs.unlink(await spoolFile(asset.id, name)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  }
  if (joined) { try { await fs.unlink(await spoolFile(asset.id, "joined.mp4")); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; } }
  await store.checkpoint(task, "deleted");
}
export async function runV3Task(projectId: string, ownerId: string, store = new V3Store(), signal = AbortSignal.timeout(14 * 60_000)) {
  assertV3Operator(ownerId);
  const w = await store.read(ownerId, projectId);
  const claim = await store.rpc("ugc_v3_task_claim", { p_project: projectId }); if (!claim) return false;
  const task = taskSchema.parse(claim);
  try {
    if (["character", "product", "location"].includes(task.kind)) await imageTask(store, task, w, signal);
    else if (task.kind === "storyboard") await storyboardTask(store, task, w, signal);
    else if (task.kind === "package") await packageTask(store, task, w, signal);
    else if (task.kind === "video") await videoTask(store, task, w, signal);
    else if (task.kind === "delete") await deleteTask(store, task, w, signal);
    else {
      const doc = readFrozenPackage(w.packages.find(p => p.id === task.input.packageId)?.document);
      if (!w.source?.current || w.source.revision !== doc.sourceRevision) throw new Error("PACKAGE_STALE");
      const document = await joinV3Segments(task.id, doc, w.runs, signal);
      await store.checkpoint(task, "artifact", { id: task.id, document });
    }
  } catch (error) {
    const refreshed = await store.read(ownerId, projectId), run = refreshed.runs.find(r => r.id === task.input.runId);
    const started = refreshed.tasks.find(t => t.id === task.id)?.provider_started;
    const code = error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "V3_TASK_FAILED";
    const rejected = error instanceof HiggsfieldTransportError && error.outcome === "rejected";
    const unknown = !rejected && (started || !!run?.observation) && !["PAID_V3_EXECUTION_DISABLED", "V3_ACTIVATION_SCOPE_MISMATCH"].includes(code);
    const paused = ["PAID_V3_EXECUTION_DISABLED", "V3_ACTIVATION_SCOPE_MISMATCH"].includes(code);
    await store.checkpoint(task, paused ? "pending" : unknown ? "unknown" : "failed", { code,
      ...(error instanceof HiggsfieldTransportError ? { httpStatus: error.httpStatus, correlationId: error.correlationId, outcome: error.outcome } : {}) });
  }
  return true;
}
