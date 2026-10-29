import "server-only";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@/lib/db/server";
import { packageDigest, validateVideoGenerationPackage } from "@/lib/video-generation-package/builder";
import { verifyPackageMedia } from "@/lib/video-generation-package/media";
import { signR2Read, deleteR2UgcFinalObject } from "@/lib/storage/r2";
import type { LocalExecutionResult } from "@/lib/ugc-jobs/claim-contract";
import { finalConfiguration } from "./config";
import { finalConfigurationDiagnostic } from "./configuration-diagnostics";
import { FinalPreflightError } from "./capabilities";
import { voiceDeliverySchema } from "@/lib/execution-v1/contract";
import { finalProviders, assertFinalProviderConfiguration } from "./adapters/registry";
import { FinalVideoError, type FinalExecution, type Operation, type ProviderReceipt, type FinalAsset, type StageKind } from "./contract";
import type { ProviderContext, VoiceResponse } from "./providers";
import { speech } from "./planning";
import { finalPreflight } from "./preflight";
import { recordProviderUsage } from "./usage";
import type { EffectiveAuthorization } from "./retry";
import { voiceLabelValidationMessage } from "./diagnostics";
import { planSpeechTiming } from "@/lib/speech-timing/plan";
import { fitSpeechFile, SpeechFitLimitError } from "./speech-fitting";
import { measure, normalizeVisual, alignedAudio, muxScene, stitch, validateVideo, verifyCompositionProcessor } from "./media";
import { readPrivateAsset, readResponse, readSpool, recoveryFile, savePrivateAsset, saveResponse, spool, sha256, cleanScratch, deleteFinalSpool } from "./storage";

class AwaitingProvider extends Error {}
const phases = { video: ["video_generating", "video_saving"], voice: ["voice_generating", "voice_saving"],
  lip_sync: ["lip_syncing", "lip_sync_saving"], design: ["voice_preparing", "voice_preparing"],
  binding: ["voice_preparing", "voice_preparing"], composition: ["combining", "finalizing"] } as const;

export async function runFinalVideo(claim: FinalExecution, shutdown: AbortSignal): Promise<LocalExecutionResult> {
  if (!claim.id || !claim.claim_token || claim.state !== "running" || Date.parse(claim.lease_expires_at ?? "") <= Date.now())
    return { ok: false, category: "lease_lost" };
  const db = createDatabaseClient(); let row = claim; let lost = false; let pending: Promise<unknown> = Promise.resolve();
  const abort = new AbortController(); const signal = AbortSignal.any([shutdown, abort.signal]);
  let effective: EffectiveAuthorization | undefined;
  async function checkpoint(command: string, payload: Record<string, unknown> = {}) {
    const task = pending.then(async () => {
      if (lost) throw new FinalVideoError("FINAL_LEASE_LOST");
      const result = await db.rpc("ugc_final_checkpoint", { p_execution: row.id, p_token: claim.claim_token!, p_operation: command, p_payload: payload });
      if (result.error || !result.data?.execution || result.data.execution.id !== row.id) {
        lost = true; abort.abort(); throw new FinalVideoError("FINAL_LEASE_LOST");
      }
      row = result.data.execution;
      if (result.data.effectiveAuthorization) effective = result.data.effectiveAuthorization;
      if (result.data.blocked) throw new FinalVideoError(result.data.blocked);
      return result.data;
    });
    pending = task.catch(() => {}); return task;
  }
  const heartbeat = setInterval(() => { void checkpoint("heartbeat").catch(() => {}); }, 20_000);
  const providers = finalProviders();
  let costPlan: ReturnType<typeof finalPreflight>["breakdown"] = [];
  let designPreviewText: string | undefined;
  let activeOperation: Operation | undefined;
  let activeSceneNumber: number | undefined;
  async function stored(operation: Operation) {
    const bytes = await readPrivateAsset(row, operation.output!, signal); await spool(row, operation.id, "bytes", bytes); return bytes;
  }
  async function intent(key: string, kind: StageKind, input: Record<string, unknown>, sceneId?: string) {
    const costEstimate = kind === "composition" ? null : costPlan.find(item => item.operationKey === key);
    if (kind !== "composition" && (!costEstimate || costEstimate.estimatedCostMicrousd === null)) throw new FinalVideoError("COST_ESTIMATE_UNAVAILABLE");
    const identity = kind === "composition" ? { id: "ffmpeg", model: "h264-aac-720p25-transitions-v2" } : row.configuration.providers[kind];
    const fingerprint = packageDigest("sceenyk-final-operation", { key, kind, input, configurationHash: row.configuration_hash,
      packageHash: row.package_hash, owner: row.owner_user_id, project: row.project_id });
    const result = await checkpoint("intent", { key, kind, input, sceneId: sceneId ?? null, fingerprint,
      provider: identity.id, model: identity.model, costEstimate });
    if (!result.operation) throw new FinalVideoError("FINAL_OPERATION_UNAVAILABLE");
    if (result.amendmentsEnforced !== true) throw new FinalVideoError("FINAL_RETRY_SETUP_REQUIRED");
    activeOperation = result.operation;
    if (row.configuration.pricing?.elevenLabsIncludedCredits && result.creditAllowanceEnforced !== true)
      throw new FinalVideoError("FINAL_PRICING_MIGRATION_REQUIRED");
    const storedEstimate = result.operation.input?.costEstimate;
    // Applied 069 still copies ceilings. Stop before provider I/O unless the
    // database confirms both the independent estimate and its pricing evidence.
    if (kind !== "composition" && (result.operation.estimated_cost_microusd !== costEstimate!.estimatedCostMicrousd ||
      !storedEstimate || typeof storedEstimate !== "object" || !("pricingVersion" in storedEstimate) ||
      storedEstimate.pricingVersion !== costEstimate!.pricingVersion)) throw new FinalVideoError("FINAL_PRICING_MIGRATION_REQUIRED");
    return { operation: result.operation, created: result.created };
  }
  async function paid(key: string, kind: Exclude<StageKind, "composition">, input: Record<string, unknown>,
    submit: (context: ProviderContext) => Promise<VoiceResponse | ProviderReceipt>, retrieve: (receipt: ProviderReceipt, context: ProviderContext) => Promise<Buffer | null>,
    validate: (bytes: Buffer, receipt: ProviderReceipt) => Promise<{ bytes: Buffer; metadata: Omit<FinalAsset, "key" | "sha256" | "etag" | "sizeBytes">; receipt?: ProviderReceipt }>, sceneId?: string, prepareNew?: () => Promise<void>) {
    if (prepareNew) {
      const known = await db.from("ugc_final_operations").select("id").eq("execution_id", row.id).eq("operation_key", key).maybeSingle();
      if (known.error) throw new FinalVideoError("FINAL_OPERATION_UNAVAILABLE");
      if (!known.data && row.dispatch_mode === "recover") throw new FinalVideoError("FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST");
      if (!known.data) await prepareNew();
    }
    const admitted = await intent(key, kind, input, sceneId); let operation = admitted.operation;
    if (operation.state === "ready") { if (operation.output) await stored(operation); return operation; }
    if (operation.state === "failed") throw new FinalVideoError(operation.error_code ?? "FINAL_PROVIDER_FAILED");
    await checkpoint("phase", { phase: phases[kind][0], sceneId });
    const savedMeta = admitted.created ? null : await readSpool(row, operation.id, "receipt.json");
    let receipt: ProviderReceipt = { ...(savedMeta ? JSON.parse(savedMeta.toString("utf8")) : {}), ...operation.receipt };
    const raw = admitted.created ? null : await readSpool(row, operation.id, "response.json") ?? await readResponse(row, operation.id, signal, receipt.recovery);
    let bytes: Buffer | null = admitted.created ? null : await readSpool(row, operation.id, "source.bytes");
    const context: ProviderContext = { signal,
      replayResponse: raw ?? undefined,
      preserveResponse: async value => { await context.received({ recovery: await saveResponse(row, operation.id, value, signal) }); },
      received: async value => {
        receipt = recordProviderUsage({ ...receipt, ...value, usage: { ...receipt.usage, ...value.usage } }, kind, row.configuration.pricing,
          costPlan.find(item => item.operationKey === key)?.estimatedCredits);
        // Local durable metadata first, then fenced SQL; lost SQL replies are safe.
        await spool(row, operation.id, "receipt.json", Buffer.from(JSON.stringify(receipt)));
        const result = await checkpoint("receipt", { operationId: operation.id, receipt }); operation = result.operation!;
      } };
    // A committed intent without a recoverable response/ID must NEVER POST again.
    if (admitted.created || raw && !bytes && (kind !== "binding" || !receipt.result)) {
      let response: VoiceResponse | ProviderReceipt;
      try { response = await submit(context); }
      catch (error) {
        if (error instanceof FinalVideoError && ["FINAL_PROVIDER_REJECTED", "FINAL_PROVIDER_RATE_LIMIT"].includes(error.code))
          await checkpoint("operation_failed", { operationId: operation.id, code: error.code });
        throw error;
      }
      if ("receipt" in response) { await context.received(response.receipt); bytes = response.bytes ?? null; }
      else await context.received(response);
      if (bytes) await spool(row, operation.id, "source.bytes", bytes);
    } else if (!bytes && !receipt.requestId && !receipt.result) throw new FinalVideoError("FINAL_UNCERTAIN_PROVIDER_OUTCOME");
    if (kind === "binding") {
      if (!receipt.result) throw new FinalVideoError("FINAL_UNCERTAIN_PROVIDER_OUTCOME");
      const done = await checkpoint("output", { operationId: operation.id, asset: null }); return done.operation!;
    }
    if (!bytes) bytes = await retrieve(receipt, context);
    if (!bytes) {
      if (kind === "video" || kind === "lip_sync") { await checkpoint("release"); throw new AwaitingProvider(); }
      throw new FinalVideoError("FINAL_RECOVERY_REQUIRED");
    }
    // Preserve downloaded success even when decoding/normalization/storage fails.
    await spool(row, operation.id, "source.bytes", bytes);
    await checkpoint("phase", { phase: phases[kind][1], sceneId });
    let value;
    try { value = await validate(bytes, receipt); }
    catch (error) {
      if (error instanceof SpeechFitLimitError) await context.received({ speechFitFailure: error.details });
      throw error;
    }
    if (value.receipt) await context.received(value.receipt);
    if (kind === "voice") providers.voice.validateTiming(receipt, value.metadata.durationMs);
    const asset = await savePrivateAsset(row, operation, value.bytes, value.metadata, signal);
    const done = await checkpoint("output", { operationId: operation.id, asset }); return done.operation!;
  }
  async function localOutput(key: string, input: Record<string, unknown>, work: () => Promise<{ bytes: Buffer; metadata: Omit<FinalAsset, "key" | "sha256" | "etag" | "sizeBytes"> }>, sceneId?: string) {
    const { operation } = await intent(key, "composition", input, sceneId);
    if (operation.state === "ready") { await stored(operation); return operation; }
    const value = await work();
    const asset = await savePrivateAsset(row, operation, value.bytes, value.metadata, signal);
    return (await checkpoint("output", { operationId: operation.id, asset })).operation!;
  }
  try {
    if (claim.phase === "deleting") {
      if (row.final_asset) await deleteR2UgcFinalObject(row.final_asset.key, row.final_asset.etag, signal);
      const finalOperation = await db.from("ugc_final_operations").select("id").eq("execution_id", row.id).eq("operation_key", `final:${row.revision}`).maybeSingle();
      if (finalOperation.error) throw new FinalVideoError("FINAL_DELETE_FAILED");
      if (finalOperation.data) await deleteFinalSpool(row, finalOperation.data.id);
      await checkpoint("deleted"); return { ok: true };
    }
    const config = finalConfiguration();
    if (config.hash !== row.configuration_hash) throw new FinalVideoError("FINAL_CONFIGURATION_CHANGED");
    if (!row.dispatch_mode) throw new FinalVideoError("FINAL_RETRY_SETUP_REQUIRED");
    const saved = await db.from("ugc_generation_packages").select("*").eq("id", row.package_id)
      .eq("owner_user_id", row.owner_user_id).eq("project_id", row.project_id).single();
    if (saved.error || !saved.data) throw new FinalVideoError("FINAL_PACKAGE_UNAVAILABLE");
    const doc = validateVideoGenerationPackage(saved.data.document, saved.data.input, row.package_version);
    if (doc.packageHash !== row.package_hash) throw new FinalVideoError("FINAL_PACKAGE_CHANGED");
    await checkpoint("phase", { phase: "capability_check" });
    const preflight = finalPreflight(doc, { ...row.configuration, maxRequests: effective?.effectiveRequests ?? row.configuration.maxRequests,
      maxEstimatedCostMicrousd: effective?.effectiveCostMicrousd ?? row.configuration.maxEstimatedCostMicrousd }, providers);
    if (preflight.diagnostics.length) throw new FinalPreflightError(preflight.diagnostics);
    costPlan = preflight.breakdown;
    designPreviewText = preflight.designPreviewText;
    const compositionPlan = preflight.composition.plan!;
    await verifyCompositionProcessor(compositionPlan, doc.requirements.dialogue || doc.requirements.narration);
    assertFinalProviderConfiguration(doc.scenes.some(scene => speech(scene).length > 0));
    const media = new Map<string, string>();
    const prepareReferences = async () => {
      await verifyPackageMedia(saved.data.input, signal);
      for (const role of ["character", "product", "location"] as const) {
        const image = saved.data.input.source[role];
        media.set(role, (await signR2Read(image.storageKey, image.etag, image.mimeType)).url);
      }
    };
    let binding = row.profile_binding as ProviderReceipt | null;
    const sceneOutputs: FinalAsset[] = []; const priorSpeech: string[] = [];
    for (const scene of doc.scenes) {
      activeSceneNumber = scene.number;
      const already = await db.from("ugc_final_scenes").select("*").eq("execution_id", row.id).eq("scene_id", scene.id).single();
      if (already.error) throw new FinalVideoError("FINAL_SCENE_UNAVAILABLE");
      if (already.data.phase === "scene_ready" && already.data.output) {
        await readPrivateAsset(row, already.data.output, signal); sceneOutputs.push(already.data.output); continue;
      }
      const video = await paid(`video:${scene.id}`, "video", { scene, referenceHashes: Object.values(doc.approvedReferences).map(ref => ref.sha256) },
        context => providers.video.submitScene(providers.video.prepareScene(doc, scene, context.replayResponse ? new Map(["character", "product", "location"].map(role => [role, "https://replay.invalid/"])) : media), context),
        (receipt, context) => providers.video.retrieve(receipt, context),
        bytes => normalizeVisual(row, bytes, scene.durationMs, doc.output.aspectRatio), scene.id, prepareReferences);
      if (speech(scene).length && row.profile && !binding) {
        const cached = await db.from("ugc_character_voice_profiles").select("provider_binding").eq("id", row.profile.id)
          .eq("owner_user_id", row.owner_user_id).eq("project_id", row.project_id).maybeSingle();
        if (cached.error) throw new FinalVideoError("FINAL_PROFILE_UNAVAILABLE");
        if (cached.data) binding = cached.data.provider_binding;
        else {
          const preview = await paid("voice:design", "design", { profile: row.profile, previewText: designPreviewText }, context => providers.voice.design(row.profile!, context, designPreviewText),
            (receipt, context) => providers.voice.retrieve(receipt, context), async bytes => {
              const file = await spool(row, randomUUID(), "preview.mp3", bytes); return { bytes, metadata: await measure(file, "audio/mpeg") }; });
          const committed = await paid("voice:binding", "binding", { profileId: row.profile.id, previewFingerprint: preview.fingerprint },
            context => providers.voice.bind(row.profile!, preview.receipt!, context), async () => null,
            async () => { throw new FinalVideoError("FINAL_PROFILE_UNAVAILABLE"); });
          binding = committed.receipt!;
        }
        await checkpoint("profile", { binding });
      }
      const audioParts: { bytes: Buffer; offsetMs: number; windowMs: number; speaker: string; hash: string; operationId: string }[] = [];
      for (const [index, line] of speech(scene).entries()) {
        if (!row.profile || !binding) throw new FinalVideoError("FINAL_PROFILE_UNAVAILABLE");
        const delivery = voiceDeliverySchema.parse(line.delivery);
        const target = planSpeechTiming(line.text, line.startMs, line.endMs, delivery.pace);
        if (!target.feasible) throw new FinalVideoError("FINAL_SPEECH_TARGET_INVALID");
        const utterance = await paid(`voice:${scene.id}:${index}`, "voice", { text: line.text, delivery: line.delivery,
          startMs: line.startMs, endMs: line.endMs, segmentIndex: index, profileId: row.profile.id, previousRequestIds: priorSpeech.slice(-3), timingTarget: target },
          context => providers.voice.synthesize(line.text, delivery, row.profile!, binding!, priorSpeech, context, target),
          (receipt, context) => providers.voice.retrieve(receipt, context), async (bytes, receipt) => {
            const file = await spool(row, randomUUID(), "utterance.mp3", bytes);
            const fitted = await fitSpeechFile(file, await recoveryFile(row, randomUUID(), "fitted.wav"), line.text, target.windowMs,
              providers.voice.timing?.(receipt));
            return { bytes: fitted.bytes, metadata: fitted.metadata, receipt: { speechFit: fitted.proof } }; }, scene.id);
        if (utterance.request_id && Date.now() - Date.parse(utterance.created_at) < 2 * 60 * 60_000) priorSpeech.push(utterance.request_id);
        audioParts.push({ bytes: await stored(utterance), offsetMs: line.startMs - scene.startMs,
          windowMs: line.endMs - line.startMs, speaker: line.speaker, hash: utterance.output!.sha256, operationId: utterance.id });
      }
      const allAudio = audioParts.length ? await alignedAudio(row, audioParts, scene.durationMs) : null;
      let picture = await stored(video); let syncId: string | null = null;
      const mouthParts = audioParts.filter(part => part.speaker === "character");
      if (mouthParts.length) {
        const guide = await localOutput(`guide:${scene.id}`, { hashes: mouthParts.map(part => part.hash), windows: mouthParts.map(part => [part.offsetMs, part.windowMs]) },
          () => alignedAudio(row, mouthParts, scene.durationMs), scene.id);
        const limits = providers.lip.validate(video.output!.durationMs, video.output!.width, video.output!.height, video.output!.sizeBytes, guide.output!.sizeBytes);
        if (limits.length) throw new FinalVideoError(`FINAL_CAPABILITY:${limits[0]}`);
        const synced = await paid(`sync:${scene.id}`, "lip_sync", { videoHash: video.output!.sha256, audioGuideHash: guide.output!.sha256,
          profileId: row.profile!.id, durationMs: scene.durationMs }, async context => {
            const videoUrl = context.replayResponse ? "https://replay.invalid/video" : (await signR2Read(video.output!.key, video.output!.etag, "video/mp4")).url;
            const audioUrl = context.replayResponse ? "https://replay.invalid/audio" : (await signR2Read(guide.output!.key, guide.output!.etag, "audio/mpeg")).url;
            return providers.lip.submit(videoUrl, audioUrl, context);
          }, (receipt, context) => providers.lip.retrieve(receipt, context), bytes => normalizeVisual(row, bytes, scene.durationMs, doc.output.aspectRatio), scene.id);
        picture = await stored(synced); syncId = synced.id;
      }
      const completed = await localOutput(`scene:${scene.id}`, { videoHash: video.output!.sha256, syncId,
        audioHashes: audioParts.map(part => part.hash), durationMs: scene.durationMs },
        () => muxScene(row, picture, allAudio?.bytes ?? null, scene.durationMs, doc.output.aspectRatio), scene.id);
      await checkpoint("scene", { sceneId: scene.id, asset: completed.output, manifest: { videoOperation: video.id,
        voiceOperations: audioParts.map(part => part.operationId), syncOperation: syncId, profileId: row.profile?.id ?? null } });
      sceneOutputs.push(completed.output!);
    }
    await checkpoint("phase", { phase: "combining" });
    const fingerprint = packageDigest("sceenyk-final-composition", { packageHash: row.package_hash, packageVersion: row.package_version,
      sceneHashes: sceneOutputs.map(asset => asset.sha256), configurationHash: row.configuration_hash, revision: row.revision });
    const final = await localOutput(`final:${row.revision}`, { fingerprint, sceneHashes: sceneOutputs.map(asset => asset.sha256), compositionPlan }, async () => {
      async function* sceneBytes() { for (const asset of sceneOutputs) yield await readPrivateAsset(row, asset, signal); }
      return stitch(row, sceneBytes(), doc.timeline.totalDurationMs, doc.output.aspectRatio, doc.scenes.some(scene => speech(scene).length > 0), compositionPlan);
    });
    const finalBytes = await stored(final); const file = await recoveryFile(row, final.id, "bytes");
    const metadata = await measure(file, "video/mp4"); validateVideo(metadata, doc.timeline.totalDurationMs, doc.output.aspectRatio, doc.requirements.dialogue || doc.requirements.narration);
    if (sha256(finalBytes) !== final.output!.sha256) throw new FinalVideoError("FINAL_ASSET_CHANGED");
    await checkpoint("phase", { phase: "finalizing" });
    await checkpoint("review", { asset: final.output, fingerprint }); return { ok: true };
  } catch (error) {
    if (error instanceof AwaitingProvider) return { ok: true };
    // Graceful local shutdown relinquishes this same run. On restart, existing
    // intents/receipts decide recovery; an uncertain POST still cannot repeat.
    if (shutdown.aborted && !lost) {
      try { await checkpoint("release"); return { ok: true }; } catch {}
    }
    const code = error instanceof FinalVideoError ? error.code : "FINAL_LOCAL_RECOVERY_REQUIRED";
    let saved = false;
    if (!lost) { try { await checkpoint("fail", { code }); saved = true; } catch {} }
    console.error("UGC_FINAL_VIDEO_STOPPED", { executionId: row.id, jobId: row.job_id, phase: row.phase,
      sceneNumber: activeSceneNumber, stage: activeOperation?.kind, provider: activeOperation?.provider, model: activeOperation?.model,
      operationId: activeOperation?.id, fingerprint: activeOperation?.fingerprint, attempt: activeOperation?.attempt,
      code: /^[A-Z0-9_:.-]{1,160}$/.test(code) || voiceLabelValidationMessage(code) ? code : "FINAL_FAILED", failureSaved: saved,
      configuration: finalConfigurationDiagnostic(error) ?? undefined,
      providerFailure: error instanceof FinalVideoError ? error.providerFailure : undefined,
      speechTiming: error instanceof SpeechFitLimitError ? error.details : undefined,
      preflight: error instanceof FinalPreflightError ? error.diagnostics : undefined });
    return { ok: false, category: lost ? "lease_lost" : "failed", failureSaved: saved };
  } finally { clearInterval(heartbeat); await pending; await cleanScratch(claim).catch(() => {}); }
}
