export class PreparationError extends Error {
  constructor(public readonly code: string, public readonly temporary = false) { super(code); this.name = "PreparationError"; }
}
export type PreparedSegment = {
  id: string; owner_user_id: string; project_id: string; source_asset_id: string;
  created_job_id: string; created_scene_id: string; source_etag: string;
  start_ms: number; end_ms: number; requested_duration_ms: number;
  normalization_key: string; normalization: Record<string, unknown>;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number; lease_id: string | null; lease_expires_at: string | null;
  storage_key: string; mime_type: "video/mp4"; verified_etag: string | null;
  source_duration_ms: number | null; source_size_bytes: number;
  duration_ms: number | null; size_bytes: number | null;
  width: number | null; height: number | null; fps: number | null;
  source_width: number | null; source_height: number | null; source_rotation: number | null;
  source_has_audio: boolean | null; processing_mode: "copy" | "transcode" | null;
  error_code: string | null; created_at: string; completed_at: string | null;
};
