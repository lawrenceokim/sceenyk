import "server-only";
import type { VideoGenerationPackage, VideoGenerationRequirements } from "@/lib/video-generation-package/contract";
import type { VideoExecutionContext } from "@/lib/video-generation-package/provider";
import type { VideoGenerationProvider, LipSyncProvider, ProviderContext } from "../providers";
import { FinalVideoError, type ProviderReceipt, type Scene } from "../contract";
import { canonicalJson } from "@/lib/video-generation-package/builder";
import { credential, jsonRequest, retrieveFal, safeId, submitFal } from "./http";

export const visualIdentity = { id: "fal", model: "bytedance/seedance-2.5/reference-to-video", version: "seedance-reference-v2-composition-owned" };
export const lipIdentity = { id: "fal", model: "fal-ai/kling-video/lipsync/audio-to-video", version: "kling-audio-sync-v1" };

export class FalVideoGenerationProvider implements VideoGenerationProvider {
  readonly id = visualIdentity.id; readonly model = visualIdentity.model; readonly adapterVersion = visualIdentity.version;
  getCapabilities() { return { configurationVersion: this.adapterVersion, referenceImages: "supported" as const,
    maxReferenceImages: 30, characterReference: "supported" as const, productReference: "supported" as const,
    locationReference: "supported" as const, audio: "supported" as const, dialogue: "unverified" as const,
    narration: "unverified" as const, consistentVoice: "unverified" as const,
    duration: { minMs: 4000, maxMs: 30_000, incrementsMs: 1000 }, aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: ["480p", "720p", "1080p"], formats: ["mp4"], sceneGeneration: "supported" as const,
    seed: "supported" as const, asynchronousJobs: "supported" as const }; }
  validatePackage(requirements: VideoGenerationRequirements) {
    const issues: { requirement: "sceneDurationsMs" | "referenceImageCount" | "aspectRatio"; scene?: number; code: string }[] = [];
    requirements.sceneDurationsMs.forEach((duration, index) => { if (duration < 4000 || duration > 30_000 || duration % 1000)
      issues.push({ requirement: "sceneDurationsMs", scene: index + 1, code: "VIDEO_DURATION_UNSUPPORTED" }); });
    if (requirements.referenceImageCount > 30) issues.push({ requirement: "referenceImageCount", code: "VIDEO_REFERENCE_LIMIT" });
    if (!this.getCapabilities().aspectRatios.includes(requirements.aspectRatio)) issues.push({ requirement: "aspectRatio", code: "VIDEO_RATIO_UNSUPPORTED" });
    return { support: issues.length ? "unsupported" as const : "supported" as const, issues };
  }
  prepareScene(doc: VideoGenerationPackage, scene: Scene, media: ReadonlyMap<string, string>) {
    if (this.validatePackage(doc.requirements).support !== "supported" ||
      Object.values(doc.approvedReferences).some(ref => ref.sizeBytes > 30_000_000)) throw new FinalVideoError("FINAL_VIDEO_CAPABILITY");
    const images = ["character", "product", "location"].map(role => { const value = media.get(role);
      if (!value) throw new FinalVideoError("FINAL_REFERENCE_MISSING"); return value; });
    // Remove exactly the serialized composition field from the adapter payload.
    // Canonical approved content/hash stays untouched; all visual fields remain.
    const field = `"transition":${canonicalJson(scene.transition)}`;
    const serialized = scene.generationPrompt;
    if (serialized.split(field).length !== 2) throw new FinalVideoError("FINAL_TRANSITION_BINDING_INVALID");
    let visualPrompt = serialized.includes(`${field},`) ? serialized.replace(`${field},`, "") : serialized.replace(`,${field}`, "");
    if (doc.schemaVersion === 2) {
      const { generationPrompt: originalPrompt, ...source } = scene;
      const instructions = { ...source, voice: { characterBinding: "character", description: doc.voice.description, pace: doc.voice.pace } };
      const { transition: finalTransition, transitionNote, audio, ...visual } = instructions;
      void originalPrompt; void finalTransition; void transitionNote; void audio;
      const filtered = { ...visual, speech: visual.speech.map(({ deliveryNote, ...line }) => { void deliveryNote; return line; }) };
      const exact = canonicalJson(instructions);
      if (!serialized.includes(exact)) throw new FinalVideoError("FINAL_TRANSITION_BINDING_INVALID");
      visualPrompt = serialized.replace(exact, canonicalJson(filtered));
    }
    // Speech is a visual performance instruction only; native audio is disabled.
    const prompt = `@Image1 is the exact approved Character sheet. @Image2 is the exact approved Product sheet. ` +
      `@Image3 is the exact approved Location. Render only ${scene.id}; translate absolute timestamps by subtracting ${scene.startMs}ms. ` +
      `Preserve the approved visible performance; dedicated speech is added separately. ` +
      `Generate the complete scene interval without applying scene-to-scene transitions or terminal fades; final composition owns these.\n${visualPrompt}`;
    return { task: "reference", prompt, image_urls: images, duration: String(scene.durationMs / 1000),
      aspect_ratio: doc.output.aspectRatio, resolution: "720p", codec: "H264", generate_audio: false };
  }
  translatePackage(doc: VideoGenerationPackage, media: ReadonlyMap<string, string>) {
    return doc.scenes.map(scene => this.prepareScene(doc, scene, media));
  }
  async submit(payload: unknown, context: VideoExecutionContext) {
    // The inherited M9 entrypoint can submit only one translated scene. Core
    // dispatches a package through separate durable submitScene operations.
    if (Array.isArray(payload)) {
      if (payload.length !== 1) throw new FinalVideoError("FINAL_SINGLE_SCENE_REQUIRED");
      payload = payload[0];
    }
    const receipt = await this.submitScene(payload, { signal: context.signal, received: async () => {} });
    return { jobId: receipt.requestId! };
  }
  submitScene(payload: unknown, context: ProviderContext) { return submitFal(this.model, payload, context); }
  async getStatus(jobId: string, context: VideoExecutionContext) {
    const root = `https://queue.fal.run/${this.model.split("/").slice(0, 2).join("/")}/requests/${safeId(jobId)}`;
    const state = await jsonRequest(`${root}/status`, { method: "GET", headers: { Authorization: `Key ${credential("FAL_KEY")}` } },
      { signal: context.signal, received: async () => {} });
    return state.status === "COMPLETED" ? { status: "completed" as const,
      result: { requestId: jobId, result: { statusLocator: `${root}/status`, resultLocator: root } } } :
      state.status === "IN_QUEUE" ? { status: "pending" as const } : state.status === "IN_PROGRESS" ? { status: "processing" as const } : { status: "failed" as const };
  }
  retrieve(receipt: ProviderReceipt, context: ProviderContext) { return retrieveFal(receipt, context); }
}
export class FalLipSyncProvider implements LipSyncProvider {
  readonly id = lipIdentity.id; readonly model = lipIdentity.model; readonly adapterVersion = lipIdentity.version;
  validate(durationMs: number, width: number, height: number, videoBytes = 0, audioBytes = 0) {
    const issues: string[] = [];
    if (durationMs < 2000 || durationMs > 10_000) issues.push("LIP_SYNC_DURATION_UNSUPPORTED");
    if (Math.min(width, height) < 720 || Math.max(width, height) > 1920) issues.push("LIP_SYNC_DIMENSIONS_UNSUPPORTED");
    if (videoBytes > 100_000_000 || audioBytes > 5_000_000) issues.push("LIP_SYNC_FILE_LIMIT");
    return issues;
  }
  submit(video: string, audio: string, context: ProviderContext) {
    return submitFal(this.model, { video_url: video, audio_url: audio, enable_safety_checker: true }, context);
  }
  retrieve(receipt: ProviderReceipt, context: ProviderContext) { return retrieveFal(receipt, context); }
}
