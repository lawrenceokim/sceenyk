import type { ProductionPlan, PlanMedia } from "@/lib/ai/plan";
import { getVisualConfiguration } from "./config";
import type { VisualOperation } from "./contract";

export function mapVisualScenes(plan: ProductionPlan, media: PlanMedia[]) {
  const c = getVisualConfiguration(); let budget = 0;
  return plan.scenePlan.map(scene => {
    const asset = media.find(m => m.id === scene.assetId);
    const operation: VisualOperation = scene.source === "original" ? "reuse" : scene.source === "generated" ? "text_to_video" : asset?.mimeType.startsWith("image/") ? "image_to_video" : "video_to_video";
    const model = operation === "reuse" ? null : operation === "text_to_video" ? c.textModel : operation === "image_to_video" ? c.imageModel : c.videoModel;
    const transform = operation === "video_to_video", frames = Math.round(scene.durationSeconds * 24) + 1;
    // Built-in control estimation is near 720p. Budget a conservative envelope.
    const estimate = transform ? Math.ceil(1280 * 768 * frames / 1e6) * c.transformMegapixelUsd : scene.durationSeconds * c.videoSecondUsd;
    const prompt = scene.transformationInstruction ?? scene.description;
    let unsupported: string | null = null;
    if (model) {
      if (scene.durationSeconds > c.maximumSceneSeconds || (transform ? scene.durationSeconds < 1 || frames > 121 : ![6, 8, 10].includes(scene.durationSeconds))) unsupported = "UNSUPPORTED_DURATION";
      if (plan.aspectRatio === "1:1" && !transform) unsupported = "UNSUPPORTED_ASPECT_RATIO";
      if (prompt.length > (transform ? 3700 : 4000)) unsupported = "UNSUPPORTED_PROMPT_LENGTH";
      if (asset && (asset.sizeBytes > c.maximumInputBytes || !["video/mp4", "video/webm", "image/png", "image/jpeg", "image/webp"].includes(asset.mimeType))) unsupported = "UNSUPPORTED_MEDIA";
      if (transform) {
        const duration = asset?.durationSeconds;
        if (!duration || scene.startTime !== 0 || scene.endTime === null || Math.abs(scene.endTime - duration) > .05 || Math.abs(scene.durationSeconds - duration) > .05) unsupported = "SOURCE_SEGMENT_REQUIRED";
      }
      if (estimate > c.maximumSceneUsd || budget + estimate > c.maximumJobUsd) unsupported = "COST_GUARD";
      if (!unsupported) budget += estimate;
    }
    const pricing = model ? { version: c.pricingVersion, currency: "USD", unit: transform ? "megapixels" : "second", unitPrice: transform ? c.transformMegapixelUsd : c.videoSecondUsd, generateAudio: false, fps: transform ? 24 : 25, aspectRatio: plan.aspectRatio, numFrames: transform ? frames : null, inputDuration: transform ? asset?.durationSeconds ?? null : null, maximumWidth: transform ? 1280 : null, maximumHeight: transform ? 768 : null } : {};
    // Audio/editing notes stay on schema-v1 plans; they never become paid work.
    return { scene_order: scene.order, operation, provider: model ? "fal" : null, model, prompt, duration_seconds: scene.durationSeconds, resolution: model ? transform ? "source-control-720p" : "720p" : null, input_asset_id: scene.assetId, source_start: scene.startTime, source_end: scene.endTime, estimated_credits: null, estimated_cost_usd: model ? estimate : null, pricing_snapshot: pricing, error_code: unsupported };
  });
}
