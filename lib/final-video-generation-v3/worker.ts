import "server-only";
import OpenAI, { toFile } from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { createDatabaseClient } from "@/lib/db/server";
import { OpenAICreativeDirectorProvider } from "./adapters/openai";
import { HiggsfieldV3Transport, HiggsfieldTransportError } from "./adapters/higgsfield-transport";
import { assertV3Access, assertV3Transport, v3OpenAIConfig, v3ReferenceConfig, v3TransportConfig } from "./runtime-config";
import { prepareV3VideoRecovery } from "./worker-recovery";
import { V3Store, type RuntimeWorkspace } from "./runtime-store";
import { taskSchema, privateAssetSchema, type Task } from "./runtime-contract";
import { executeV3Segment } from "./execution";
import { joinV3Segments } from "./join";
import { directorStoryboardSchema, castDirectorStoryboardSchema, connectedDirectorStoryboardSchema, connectedCastDirectorStoryboardSchema } from "./contract";
import { CONNECTED_STORY_DIRECTOR_VERSION, validateConnectedStory, connectedStoryInstructions } from "./connected-story";
import { requiresProDuration } from "@/lib/projects/pro-duration";
import { packageClips } from "./clip-runtime";
import { readFrozenPackage } from "./package";
import { v3Digest } from "./identity";
import { packageTask } from "./package-task";
import { bytesHash, readPrivate, inspectImage, publishPrivate, saveSpool, readSpool, inspectVideo, deletePrivate, purgeVideoSpool } from "./runtime-media";
import { generationContext, generationContextSchema, referenceSubjectSchema, originalCharacters, latestArtifact, characterSubject } from "./generation-context";
import { validateCharacterCast } from "./character-cast";
import { projectBrief, creativeBriefHash, referenceOriginals, approvedArtifacts } from "./creative-inputs";
import { prepareOpenAIReference } from "./adapters/openai-reference";
import { assertReferenceSheetPrompt, referenceSourceSchema } from "./reference-sheet-prompt";
import { savedReferenceResult, recordReferenceStage, referenceStageError, ReferenceTaskError, safeReferenceRequestId } from "./reference-diagnostics";
import { higgsfieldRequestIssues } from "./adapters/higgsfield-validity";
import { runLocationTask } from "./location-worker";
import { isLocationDirectorTask, locationDocument } from "./location-runtime";
import { discardableReferences, discardReference } from "./reference-retention";
import { STORYBOARD_DIRECTOR_VERSION, storyboardDirectorInput, validateDirectedStoryboard } from "./storyboard-director";

async function approvedBytes(w: RuntimeWorkspace, ids: unknown, signal: AbortSignal) {
  if (!Array.isArray(ids) || !ids.length || ids.some(v => typeof v !== "string")) throw new Error("V3_REFERENCES_REQUIRED");
  return Promise.all(ids.map(async id => {
    const a = w.artifacts.find(a => a.id === id);
    if (!a?.approved_at || a.rejected_at || latestArtifact(w, a.kind, a.kind === "character" ? characterSubject(a) : undefined)?.id !== a.id) throw new Error("V3_REFERENCE_STALE");
    const asset = privateAssetSchema.parse(a.document.asset);
    return { asset, bytes: await readPrivate(asset.storageKey, asset.etag, asset.sizeBytes, signal, asset.sha256) };
  }));
}
async function imageTask(store: V3Store, task: Task, w: RuntimeWorkspace, signal: AbortSignal) {
  let stage = "source", httpStatus: number | null = null, requestId: string | null = null;
  try {
    const model = z.string().min(1).parse(task.input.model), brief = await projectBrief(w.project.owner_user_id, task.project_id);
    if (creativeBriefHash(brief) !== task.input.briefHash) throw new Error("V3_CREATIVE_INPUT_STALE");
    const context = generationContextSchema.parse(task.input.generationContext);
    if (v3Digest("generation-context", context) !== v3Digest("generation-context", generationContext(brief))) throw new Error("V3_CREATIVE_INPUT_STALE");
    const originals = await referenceOriginals(w.project.owner_user_id, task.project_id);
    if (task.kind !== "location" && (task.kind === "character" ? !originalCharacters(originals).some(c => c.id === task.input.originalId) : task.input.originalId !== originals.product)) throw new Error("CURRENT_STUDIO_REFERENCE_REQUIRED");
    stage = "response_parse";
    let saved = await savedReferenceResult(task.id);
    httpStatus = saved.httpStatus; requestId = saved.requestId;
    const subject = task.input.referenceSubject === undefined ? undefined : referenceSubjectSchema.parse(task.input.referenceSubject);
    if (subject && (subject.role !== task.kind || subject.originalId !== task.input.originalId || subject.name !==
      (subject.role === "character" ? originalCharacters(originals).find(c => c.id === subject.originalId)?.name : originals.names?.product ?? ""))) throw new Error("V3_CREATIVE_INPUT_STALE");
    const hasSavedOutput = !!saved.raw || !!saved.imageBytes;
    if (!hasSavedOutput && (task.provider_started || task.input.recoveryOnly === true)) { stage = "recovery"; throw new Error("V3_REFERENCE_SAVED_RESPONSE_UNUSABLE"); }
    stage = "source";
    if (!hasSavedOutput && (task.kind === "character" || task.kind === "product")) {
      if (!subject) throw new Error("V3_REFERENCE_PROMPT_OUTDATED_REGENERATE");
      assertReferenceSheetPrompt(task.input.referencePrompt, task.kind, context, subject);
      referenceSourceSchema.parse(task.input.referenceSource);
    }
    let original: { id: string; sha256: string } | null = null, inputs: Buffer[] = [];
    if (task.kind !== "location") {
      const asset = await createDatabaseClient().from("project_assets").select("id,storage_key,verified_etag,size_bytes,mime_type,created_at")
        .eq("id", String(task.input.originalId)).eq("project_id", task.project_id).eq("owner_user_id", w.project.owner_user_id).eq("upload_status", "uploaded").eq("removed_from_draft", false).maybeSingle();
      if (asset.error || !asset.data?.verified_etag || asset.data.size_bytes > 20 * 1024 * 1024) throw new Error("FRESH_PRIVATE_ORIGINAL_REQUIRED");
      if (task.input.referenceSource !== undefined) {
        const source = referenceSourceSchema.parse(task.input.referenceSource);
        if (source.id !== asset.data.id || source.etag !== asset.data.verified_etag || source.sizeBytes !== asset.data.size_bytes || source.mimeType !== asset.data.mime_type) throw new Error("V3_REFERENCE_SOURCE_STALE");
      }
      const raw = await readPrivate(asset.data.storage_key, asset.data.verified_etag, asset.data.size_bytes, signal);
      original = { id: asset.data.id, sha256: bytesHash(raw) };
      if (!hasSavedOutput) inputs = [(await inspectImage(raw)).bytes];
    } else if (!hasSavedOutput) inputs = (await approvedBytes(w, task.input.references, signal)).map(r => r.bytes);
    if (!hasSavedOutput) {
      // The only provider branch. Recovery and provider-started tasks can never enter it.
      const config = v3ReferenceConfig();
      if (model !== config.imageModel || task.input.provider !== undefined && task.input.provider !== "openai") throw new Error("V3_OPENAI_REFERENCE_PROVIDER_UNAVAILABLE");
      const client = new OpenAI({ apiKey: config.apiKey, maxRetries: 0, timeout: 600_000, logLevel: "off" });
      await store.checkpoint(task, "intent"); stage = "provider";
      await recordReferenceStage(task.id, { stage, httpStatus, requestId, errorCode: null });
      const response = await client.images.edit(prepareOpenAIReference(model, await Promise.all(inputs.map((b, i) => toFile(b, `reference-${i}.png`, { type: "image/png" }))),
        task.kind as "character" | "product" | "location", context, subject), { signal, headers: { "X-Client-Request-Id": task.id } }).asResponse();
      httpStatus = response.status; requestId = safeReferenceRequestId(response.headers.get("x-request-id"));
      stage = "response_receive";
      const responseText = await response.text(); stage = "response_save";
      await saveSpool(task.id, "openai-response.json", Buffer.from(JSON.stringify({ responseText, requestId, httpStatus })));
      stage = "response_parse"; saved = await savedReferenceResult(task.id);
    }
    stage = saved.responseError === "V3_REFERENCE_IMAGE_VALIDATION_FAILED" ? "image_validation" : "response_parse";
    if (!saved.image) throw new Error(saved.responseError ?? "V3_REFERENCE_SAVED_RESPONSE_UNUSABLE");
    const image = saved.image;
    stage = "image_save";
    if (!saved.imageBytes) await saveSpool(task.id, "image.png", image.bytes);
    stage = "storage";
    await recordReferenceStage(task.id, { stage, httpStatus, requestId, errorCode: null });
    const asset = await publishPrivate(w.project.owner_user_id, task.project_id, task.id, image.bytes, image.metadata, signal);
    stage = "publication";
    await store.checkpoint(task, "artifact", { id: task.id, document: { asset, original, input: task.input, provider: "openai", model,
      responseHash: bytesHash(saved.raw ?? image.bytes), requestId, httpStatus, recoveredFrom: hasSavedOutput ? saved.recoveredFrom : null } });
    await recordReferenceStage(task.id, { stage: "complete", httpStatus, requestId, errorCode: null });
  } catch (error) {
    const failure = referenceStageError(error, stage, httpStatus, requestId);
    await recordReferenceStage(task.id, failure.metadata);
    throw failure;
  }
}
async function storyboardTask(store: V3Store, task: Task, w: RuntimeWorkspace, signal: AbortSignal) {
  const model = z.string().min(1).parse(task.input.model), brief = await projectBrief(w.project.owner_user_id, task.project_id);
  if (creativeBriefHash(brief) !== task.input.briefHash) throw new Error("V3_CREATIVE_INPUT_STALE");
  const connected = task.input.directorVersion === CONNECTED_STORY_DIRECTOR_VERSION;
  if (requiresProDuration(brief.duration) && w.project.studio_mode !== "pro") throw new Error("V3_PRO_DURATION_REQUIRED");
  if (Number(brief.duration) > 30 && (!connected || w.project.studio_mode !== "pro")) throw new Error("V3_PRO_DURATION_REQUIRED");
  const approved = approvedArtifacts({ ...w, tasks: w.tasks.filter(t => t.id !== task.id) }, brief, await referenceOriginals(w.project.owner_user_id, task.project_id));
  if (JSON.stringify(task.input.references) !== JSON.stringify(approved.map(a => a.id)) ||
    v3Digest("generation-context", generationContextSchema.parse(task.input.generationContext)) !== v3Digest("generation-context", generationContext(brief)))
    throw new Error("V3_CREATIVE_INPUT_STALE");
  const refs = await approvedBytes(w, task.input.references, signal);
  let raw = await readSpool(task.id, "openai-response.json");
  if (!raw) {
    if (task.provider_started) throw new Error("V3_OPENAI_OUTCOME_UNKNOWN");
    const config = v3OpenAIConfig(), provider = new OpenAICreativeDirectorProvider({ model, maxOutputTokens: connected ? 28_000 : 14_000 });
    const location = locationDocument(w.artifacts.find(a => a.kind === "location" && (task.input.references as string[]).includes(a.id)));
    if (location) await store.rpc("ugc_v3_location_input_current", { p_project: task.project_id, d: w.artifacts.find(a => a.id === location.artifactId)!.document.input }).then(current => { if (current !== true) throw new Error("V3_CREATIVE_INPUT_STALE"); });
    const cast = task.input.cast;
    const instruction = storyboardDirectorInput(brief, approved.map(a => a.kind), location, cast, connected ? task.input.clipBoundaries : undefined);
    const request = provider.prepareStoryboard({ instruction, durationMs: Number(brief.duration) * 1000, referenceUrls: [] });
    if (connected) {
      request.body.instructions = String(request.body.instructions).replace("Shots are creative units in ONE continuous audiovisual generation, not individual provider requests.", "Shots are creative units in ONE connected story divided into the supplied planned clips.") + "\n" + connectedStoryInstructions;
      request.body.text = { format: cast ? zodTextFormat(connectedCastDirectorStoryboardSchema, "director_storyboard_connected_cast_v1") : zodTextFormat(connectedDirectorStoryboardSchema, "director_storyboard_connected_v1") };
    } else if (cast) request.body.text = { format: zodTextFormat(castDirectorStoryboardSchema, "director_storyboard_cast_v1") };
    request.body.input = [{ role: "user", content: [{ type: "input_text", text: instruction },
      ...refs.map(r => ({ type: "input_image" as const, image_url: `data:image/png;base64,${r.bytes.toString("base64")}`, detail: "high" as const }))] }];
    const client = new OpenAI({ apiKey: config.apiKey, maxRetries: 0, timeout: 600_000, logLevel: "off" });
    await store.checkpoint(task, "intent");
    const response = await client.responses.create(request.body, { signal, headers: { "X-Client-Request-Id": task.id } });
    raw = Buffer.from(JSON.stringify({ response, requestId: response._request_id ?? null })); await saveSpool(task.id, "openai-response.json", raw);
  }
  const captured = JSON.parse(raw.toString("utf8")) as { response: { output?: { type: string; content?: { type: string; text?: string }[] }[] }; requestId: string | null }, response = captured.response;
  const text = response.output?.flatMap(o => o.type === "message" ? o.content?.filter(c => c.type === "output_text").map(c => c.text ?? "") ?? [] : []).join("");
  const storyboard = directorStoryboardSchema.parse(JSON.parse(text ?? ""));
  if (task.input.cast) {
    if (!("cast" in storyboard) || v3Digest("character-cast", storyboard.cast) !== v3Digest("character-cast", task.input.cast)) throw new Error("V3_CHARACTER_BINDINGS_CHANGED");
    validateCharacterCast(storyboard, approved.filter(a => a.kind === "character").map(a => ({ id: a.id,
      role: "character", characterId: characterSubject(a), name: (task.input.cast as { characterId: string; name: string }[]).find(c => c.characterId === characterSubject(a))?.name ?? "",
    })));
  }
  if (storyboard.durationMs !== Number(brief.duration) * 1000 || storyboard.aspectRatio !== brief.aspect_ratio) throw new Error("V3_DIRECTOR_TIMING_INVALID");
  if (storyboard.visualStyle !== brief.visual_style || storyboard.tone !== brief.tone) throw new Error("V3_DIRECTOR_STYLE_INVALID");
  if (connected) validateConnectedStory(storyboard, task.input.clipBoundaries);
  if (task.input.directorVersion === STORYBOARD_DIRECTOR_VERSION || connected) validateDirectedStoryboard(storyboard, {
    durationMs: Number(brief.duration) * 1000, aspectRatio: brief.aspect_ratio, visualStyle: brief.visual_style, tone: brief.tone });
  await store.checkpoint(task, "artifact", { id: task.id, document: { storyboard, input: task.input, provider: "openai", model, responseHash: bytesHash(raw), requestId: captured.requestId } });
}
async function videoTask(store: V3Store, task: Task, w: RuntimeWorkspace, signal: AbortSignal) {
  const run = w.runs.find(r => r.id === task.input.runId); if (!run) throw new Error("V3_RUN_NOT_FOUND");
  if (run.result) { await store.checkpoint(task, "done"); return; }
  const config = v3TransportConfig(), transport = new HiggsfieldV3Transport(config);
  const doc = readFrozenPackage(w.packages.find(p => p.id === run.package_id)!.document), segment = doc.segments.find(s => s.id === run.intent.segmentId)!;
  if (doc.source.storyboardContent.durationMs > 30_000 && !packageClips(doc)) throw new Error("V3_CONNECTED_STORY_REQUIRED");
  const stage = async (value: string, requestId?: string) => {
    const changed = await store.rpc("ugc_v3_video_stage", { p_task: task.id, p_token: task.lease_token, p_stage: value });
    if (changed) console.info(JSON.stringify({ stage: value, projectId: task.project_id, packageId: run.package_id, runId: run.id, ...(requestId ? { requestId } : {}) }));
  };
  await stage("V3_FINAL_VIDEO_JOB_CLAIMED");
  await executeV3Segment(run, task.provider_started, { provider: transport, beforeSubmit: async intent => {
    assertV3Transport(config, intent);
    if (intent.body.resolution !== doc.source.resolution || intent.authorization.resolution !== doc.source.resolution) throw new Error("V3_RESOLUTION_BINDING_INVALID");
    // Do not mark a request started when its signed inputs have already expired.
    if (Date.parse(intent.deliveryExpiresAt) <= Date.now()) throw new Error("V3_REFERENCE_DELIVERY_EXPIRED");
    if (doc.pricing.source !== "manual_provider_estimate" && config.accountScope !== doc.accountScope) throw new Error("HIGGSFIELD_ESTIMATE_ACCOUNT_CHANGED");
    const quote = w.quotes.find(q => q.document.packageId === run.package_id)?.document;
    const issues = higgsfieldRequestIssues(intent.body, doc.source.references, quote?.validityEvidence, new Date().toISOString());
    if (!quote) issues.push("V3_QUOTE_REQUIRED");
    if (issues.length) throw new Error(issues[0]);
  },
    stage,
    checkpoint: (action, payload) => store.checkpoint(task, action, payload), readSaved: name => readSpool(run.id, name),
    save: (name, bytes) => saveSpool(run.id, name, bytes), validateAndPublish: async bytes => {
      const metadata = await inspectVideo(run.id, bytes, { durationMs: segment.durationMs, aspectRatio: doc.source.storyboardContent.aspectRatio, generateAudio: true, resolution: run.intent.authorization.resolution });
      return publishPrivate(w.project.owner_user_id, task.project_id, run.id, bytes, metadata, signal);
    } }, signal);
}
async function deleteTask(store: V3Store, task: Task, w: RuntimeWorkspace, signal: AbortSignal) {
  const run = w.runs.find(r => r.id === task.input.runId);
  const joined = w.artifacts.find(a => a.id === task.input.artifactId && a.kind === "joined" && !!a.rejected_at);
  const asset = run?.state === "deleting" ? run.result : joined ? privateAssetSchema.parse(joined.document.asset) : null;
  if (!asset) throw new Error("V3_DELETE_UNAVAILABLE");
  await deletePrivate(w.project.owner_user_id, task.project_id, asset, signal);
  await purgeVideoSpool(asset.id);
  await store.checkpoint(task, "deleted");
}
export async function runV3Task(projectId: string, ownerId: string, store = new V3Store(), signal = AbortSignal.timeout(14 * 60_000)) {
  assertV3Access(ownerId);
  let w = await store.read(ownerId, projectId);
  if (w.tasks.some(t => t.input.referenceCleanup && t.status !== "done" && w.referenceDeletions.some(d => d.id === (t.input.referenceCleanup as { id: string }).id && d.state === "completed"))) {
    await store.rpc("ugc_v3_reconcile_reference_cleanup", { p_owner: ownerId, p_project: projectId });
    w = await store.read(ownerId, projectId);
  }
  if(w.referenceCleanupPolicy&&discardableReferences(w).length){
    const queued=await store.rpc("ugc_v3_queue_reference_cleanup",{p_owner:ownerId,p_project:projectId,p_retry:false});
    if(queued)w=await store.read(ownerId,projectId);
  }
  w = await prepareV3VideoRecovery(store, w, signal);
  const claim = await store.rpc("ugc_v3_worker_claim", { p_project: projectId, p_submit: v3TransportConfig().enabled }); if (!claim) return false;
  const task = taskSchema.parse(claim);
  try {
    if (isLocationDirectorTask(task)) await runLocationTask(store, task, w, signal);
    else if (["character", "product", "location"].includes(task.kind)) await imageTask(store, task, w, signal);
    else if (task.kind === "storyboard") await storyboardTask(store, task, w, signal);
    else if (task.kind === "package") await packageTask(store, task, w, signal);
    else if (task.kind === "video") await videoTask(store, task, w, signal);
    else if (task.kind === "delete" && task.input.referenceCleanup) {
      const target=z.object({id:z.uuid(),version:z.number().int().positive()}).parse(task.input.referenceCleanup);
      await discardReference(store,ownerId,projectId,target,signal,false);await store.checkpoint(task,"done");
    }
    else if (task.kind === "delete") await deleteTask(store, task, w, signal);
    else {
      const doc = readFrozenPackage(w.packages.find(p => p.id === task.input.packageId)?.document);
      if (packageClips(doc)) throw new Error("V3_CLIP_MERGE_NOT_IMPLEMENTED");
      if (!w.source?.current || w.source.revision !== doc.sourceRevision) throw new Error("PACKAGE_STALE");
      const document = await joinV3Segments(task.id, doc, w.runs, signal);
      await store.checkpoint(task, "artifact", { id: task.id, document });
    }
  } catch (error) {
    const refreshed = await store.read(ownerId, projectId), run = refreshed.runs.find(r => r.id === task.input.runId);
    if(task.input.referenceCleanup&&refreshed.referenceDeletions.some(d=>d.id===(task.input.referenceCleanup as {id:string}).id&&d.state==="completed")){
      await store.checkpoint(task,"done");return true;
    }
    const started = refreshed.tasks.find(t => t.id === task.id)?.provider_started;
    const code = error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "V3_TASK_FAILED";
    const rejected = error instanceof HiggsfieldTransportError && error.outcome === "rejected" || error instanceof ReferenceTaskError && error.knownRejected;
    const deliveryPaused = !started && !run?.observation && code === "V3_REFERENCE_DELIVERY_EXPIRED";
    const unknown = !rejected && (started || !!run?.observation) && !["PAID_V3_EXECUTION_DISABLED", "V3_ACTIVATION_SCOPE_MISMATCH"].includes(code) && !deliveryPaused;
    const paused = deliveryPaused || ["PAID_V3_EXECUTION_DISABLED", "V3_ACTIVATION_SCOPE_MISMATCH"].includes(code) ||
      !!task.input.referenceCleanup && ["V3_REFERENCE_CLEANUP_IN_PROGRESS", "V3_REFERENCE_CLEANUP_PENDING"].includes(code);
    if (error instanceof ReferenceTaskError && task.lease_token) {
      try { await store.rpc("ugc_v3_record_reference_diagnostic", { p_task: task.id, p_token: task.lease_token, p_document: error.metadata }); }
      catch { /* Still preserve the original code/HTTP/request ID through the normal task checkpoint. */ }
    }
    await store.checkpoint(task, paused ? "pending" : unknown ? "unknown" : "failed", { code,
      ...(error instanceof ReferenceTaskError && (started || error.metadata.httpStatus !== null || error.metadata.requestId !== null) ?
        { httpStatus: error.metadata.httpStatus, correlationId: error.metadata.requestId, outcome: error.knownRejected ? "rejected" : "unknown" } : {}),
      ...(error instanceof HiggsfieldTransportError ? { httpStatus: error.httpStatus, correlationId: error.correlationId, outcome: error.outcome } : {}) });
    if (task.kind === "video" && task.error_code !== code) console.info(JSON.stringify({ stage: paused ? "V3_VIDEO_REQUEST_PAUSED" : "V3_VIDEO_REQUEST_NEEDS_ATTENTION",
      projectId, runId: run?.id ?? null, code, providerStarted: !!started }));
  }
  return true;
}
