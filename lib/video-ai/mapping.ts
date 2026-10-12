import type { ProductionPlan } from "@/lib/ai/plan";
import type { PlanMedia } from "@/lib/ai/plan";
import { getVisualConfiguration, runwayModels } from "./config";
import type { VisualOperation } from "./contract";

export function mapVisualScenes(plan: ProductionPlan, media: PlanMedia[]) {
  const config = getVisualConfiguration();
  let budget = 0;
  return plan.scenePlan.map(scene => {
    const asset = media.find(m => m.id === scene.assetId);
    const operation: VisualOperation = scene.source === "original" ? "reuse" : scene.source === "generated" ? "text_to_video" : asset?.mimeType.startsWith("image/") ? "image_to_video" : "video_to_video";
    const model = operation === "reuse" ? null : operation === "text_to_video" ? config.textModel : operation === "image_to_video" ? config.imageModel : config.videoModel;
    const resolution = operation === "video_to_video" ? "source (up to 1080p)" : plan.aspectRatio === "16:9" ? "1280:720" : plan.aspectRatio === "9:16" ? "720:1280" : "960:960";
    const prompt = scene.transformationInstruction ?? scene.description;
    const credits = model ? scene.durationSeconds * runwayModels[model].creditsPerSecond : 0;
    let unsupported: string | null = null;
    if (model) {
      const limits = runwayModels[model];
      if (scene.durationSeconds < limits.minimumSeconds || scene.durationSeconds > limits.maximumSeconds || scene.durationSeconds > config.maximumSceneSeconds || (operation !== "video_to_video" && !Number.isInteger(scene.durationSeconds)) || (model === "gen4_turbo" && ![5, 10].includes(scene.durationSeconds))) unsupported = "UNSUPPORTED_DURATION";
      if (operation === "text_to_video" && plan.aspectRatio === "1:1") unsupported = "UNSUPPORTED_ASPECT_RATIO";
      if (prompt.length > 1000) unsupported = "UNSUPPORTED_PROMPT_LENGTH";
      if (asset && (asset.sizeBytes > config.maximumInputBytes || !["video/mp4", "video/webm", "image/png", "image/jpeg", "image/webp"].includes(asset.mimeType))) unsupported = "UNSUPPORTED_MEDIA";
      if (operation === "video_to_video") {
        const duration = asset?.durationSeconds;
        // Aleph edits the whole input; there is no input trim parameter. Never
        // send a longer upload when Gemini selected only a short segment.
        if (!duration || scene.startTime !== 0 || scene.endTime === null || Math.abs(scene.endTime - duration) > 0.05 || Math.abs(scene.durationSeconds - duration) > 0.05) unsupported = "SOURCE_SEGMENT_REQUIRED";
      }
      if (credits * 0.01 > config.maximumSceneUsd || budget + credits * 0.01 > config.maximumJobUsd) unsupported = "COST_GUARD";
      if (!unsupported) budget += credits * 0.01;
    }
    // Schema v1 has only visual scenes. Narration/edit notes stay on the plan;
    // never fabricate a non_visual scene or turn notes into a paid request.
    return { scene_order: scene.order, operation, model, prompt, duration_seconds: scene.durationSeconds, resolution: model ? resolution : null, input_asset_id: scene.assetId, source_start: scene.startTime, source_end: scene.endTime, estimated_credits: model ? credits : null, error_code: unsupported };
  });
}
