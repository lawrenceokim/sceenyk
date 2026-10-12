export const sceneStatuses = ["pending", "submitted", "processing", "completed", "failed", "skipped"] as const;
export type SceneStatus = (typeof sceneStatuses)[number];
export type VisualOperation = "reuse" | "text_to_video" | "image_to_video" | "video_to_video";
export type SceneExecution = {
  id: string; job_id: string; owner_user_id: string; project_id: string;
  scene_order: number; operation: VisualOperation; status: SceneStatus;
  provider: "runway" | null; model: string | null; prompt: string;
  duration_seconds: number; resolution: string | null;
  input_asset_id: string | null; source_start: number | null; source_end: number | null;
  provider_task_id: string | null; submission_started_at: string | null;
  submission_attempts: number;
  estimated_credits: number | null; provider_credits: number | null;
  provider_cost_usd: number | null; cost_measured_at: string | null;
  error_code: string | null; output_asset_id: string | null;
  created_at: string; updated_at: string; completed_at: string | null;
};
export type SceneAsset = {
  id: string; scene_execution_id: string; job_id: string; owner_user_id: string; project_id: string;
  storage_key: string; mime_type: "video/mp4"; size_bytes: number; verified_etag: string; created_at: string;
};
export class VisualError extends Error {
  constructor(public readonly code: string, public readonly temporary = false) {
    super(code); this.name = "VisualError";
  }
}
