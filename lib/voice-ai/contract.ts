export const narrationStatuses = ["pending", "generating", "completed", "failed", "skipped"] as const;
export type NarrationStatus = (typeof narrationStatuses)[number];
export class VoiceError extends Error {
  constructor(public code: string, public retryable = false) { super(code); }
}
export type VoiceConfiguration = {
  provider: "elevenlabs";
  voiceId: string;
  modelId: string;
  format: "mp3_44100_128";
  version: string;
  settings: { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean; speed: number };
};
export type NarrationSegment = {
  id: string; job_id: string; scene_execution_id: string; owner_user_id: string; project_id: string;
  scene_order: number; text: string | null; status: NarrationStatus;
  voice_provider: "elevenlabs"; voice_id: string; model_id: string; configuration: VoiceConfiguration;
  expected_duration_ms: number; actual_duration_ms: number | null; timing_mismatch: boolean;
  character_count: number; submission_started_at: string | null; submission_attempts: number;
  provider_request_id: string | null; provider_usage: Record<string, unknown>; estimated_provider_cost: number | null;
  output_asset_id: string | null; error_code: string | null;
  created_at: string; updated_at: string; completed_at: string | null;
};
export type NarrationAsset = {
  id: string; narration_segment_id: string; job_id: string; owner_user_id: string; project_id: string;
  storage_key: string; mime_type: "audio/mpeg"; size_bytes: number; verified_etag: string;
  duration_ms: number; sample_rate: number; channels: number; created_at: string;
};
