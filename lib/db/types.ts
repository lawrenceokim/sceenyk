import type { CategoryId, CreationSettings } from "@/lib/projects/options";
import type { MediaKind } from "@/lib/media/types";
import type { GenerationSnapshot } from "@/lib/generation/types";
import type { DispatchStatus } from "@/lib/generation/dispatch-contract";
import type {
  GenerationFailureCode,
  GenerationStage,
  GenerationStatus,
} from "@/lib/generation/contract";

// Authored migration contracts. Hosted identity/projects/assets are exercised
// in development acceptance; full catalog/grant auditing remains separate.
export type AppUser = {
  id: string;
  clerk_user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type AppUserProfile = Pick<
  AppUser,
  "clerk_user_id" | "email" | "first_name" | "last_name" | "image_url"
>;

export type ProjectFields = {
  title: string;
  category: CategoryId;
  prompt: string;
  aspect_ratio: CreationSettings["aspectRatio"];
  duration: CreationSettings["duration"];
  visual_style: CreationSettings["visualStyle"];
  tone: CreationSettings["tone"];
};
export type ProjectRow = ProjectFields & {
  id: string;
  owner_user_id: string;
  status: "draft";
  created_at: string;
  updated_at: string;
};

export type AssetRow = {
  id: string;
  owner_user_id: string;
  project_id: string;
  upload_request_id: string;
  storage_provider: "r2";
  storage_key: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  media_type: MediaKind;
  upload_status: "pending" | "uploaded" | "rejected";
  verified_etag: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      creator_withdrawals: { Row: import("@/lib/marketplace/withdrawals/contract").WithdrawalRow; Insert: never; Update: never; Relationships: [] };
      creator_withdrawal_allocations: { Row: { id: string; withdrawal_id: string; purchase_id: string; amount_minor: number; remaining_minor: number }; Insert: never; Update: never; Relationships: [] };
      caption_tracks: { Row: import("@/lib/captions/contract").CaptionRow; Insert: never; Update: never; Relationships: [] };
      caption_preferences: { Row: import("@/lib/captions/contract").CaptionPreferenceRow; Insert: never; Update: never; Relationships: [] };
      marketplace_purchases: { Row: import("@/lib/marketplace/payments/types").MarketplacePurchaseRow; Insert: never; Update: never; Relationships: [] };
      credit_purchases: { Row: import("@/lib/payments/types").PurchaseRow; Insert: never; Update: never; Relationships: [] };
      render_jobs: { Row: import("@/lib/final-render/contract").RenderJob; Insert: never; Update: never; Relationships: [] };
      final_video_assets: { Row: import("@/lib/final-render/contract").FinalVideoAsset; Insert: never; Update: never; Relationships: [] };
      composition_plans: { Row: import("@/lib/composition/contract").CompositionRow; Insert: never; Update: never; Relationships: [] };
      composition_asset_checks: { Row: import("@/lib/composition/contract").CompositionAssetCheck; Insert: never; Update: never; Relationships: [] };
      narration_segments: { Row: import("@/lib/voice-ai/contract").NarrationSegment; Insert: never; Update: never; Relationships: [] };
      narration_assets: { Row: import("@/lib/voice-ai/contract").NarrationAsset; Insert: never; Update: never; Relationships: [] };
      prepared_segments: { Row: import("@/lib/media-preparation/contract").PreparedSegment; Insert: never; Update: never; Relationships: [] };
      scene_executions: { Row: import("@/lib/video-ai/contract").SceneExecution; Insert: never; Update: never; Relationships: [] };
      scene_assets: { Row: import("@/lib/video-ai/contract").SceneAsset; Insert: never; Update: never; Relationships: [] };
      generation_plans: {
        Row: { job_id: string; owner_user_id: string; schema_version: number; provider: "gemini"; model: string; plan: import("@/lib/ai/plan").ProductionPlan; created_at: string };
        Insert: never; Update: never; Relationships: [];
      };
      generation_analysis_attempts: {
        Row: { id: string; job_id: string; owner_user_id: string; worker_run_id: string; attempt: number; provider: "gemini"; requested_model: string; model: string | null; state: "started" | "succeeded" | "failed" | "invalid"; failure_code: string | null; response_id: string | null; usage: import("@/lib/ai/types").ProviderUsage | null; started_at: string; finished_at: string | null };
        Insert: never; Update: never; Relationships: [];
      };
      generation_quotes: {
        Row: {
          id: string;
          owner_user_id: string;
          project_id: string;
          request_id: string;
          input_snapshot: GenerationSnapshot;
          eligible_free: boolean;
          required_credits: number | null;
          available_credits: number;
          free_remaining: number;
          pricing_version: string;
          pricing_mode: "unconfigured" | "test";
          created_at: string;
          expires_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      generation_pricing_records: {
        Row: {
          job_id: string;
          owner_user_id: string;
          quote_id: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      generation_accounts: {
        Row: {
          owner_user_id: string;
          free_total: number;
          free_reserved: number;
          free_consumed: number;
          credit_available: number;
          credit_reserved: number;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      generation_reservations: {
        Row: {
          job_id: string;
          owner_user_id: string;
          kind: "free" | "credits";
          amount: number;
          state: "reserved" | "consumed" | "released";
          reason: "generation_admission" | "stored_result_verified" | "generation_failed";
          created_at: string;
          settled_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          id: string;
          owner_user_id: string;
          job_id: string | null;
          purchase_id: string | null;
          paypal_order_id: string | null;
          paypal_capture_id: string | null;
          amount: number;
          type: "reservation" | "consumption" | "release" | "purchase";
          direction: "hold" | "debit" | "restore" | "credit";
          available_delta: number;
          reserved_delta: number;
          reason: string;
          reference_key: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      generation_result_receipts: {
        Row: {
          job_id: string;
          owner_user_id: string;
          worker_run_id: string;
          storage_provider: "r2";
          storage_key: string;
          mime_type: "video/mp4" | "video/webm";
          size_bytes: number;
          verified_etag: string;
          verified_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      generation_jobs: {
        Row: GenerationRow;
        Insert: never; // New jobs are admitted with their reservation via RPC.
        Update: Partial<
          Pick<
            GenerationRow,
            "status" | "current_stage" | "error_code" | "error_message"
          >
        >;
        Relationships: [];
      };
      project_assets: {
        Row: AssetRow;
        Insert: Omit<
          AssetRow,
          "created_at" | "updated_at" | "upload_status" | "verified_etag"
        >;
        Update: Partial<Pick<AssetRow, "upload_status" | "verified_etag">>;
        Relationships: [];
      };
      app_users: {
        Row: AppUser;
        Insert: AppUserProfile;
        Update: Partial<AppUserProfile>;
        Relationships: [];
      };
      projects: {
        Row: ProjectRow;
        Insert: ProjectFields & { id: string; owner_user_id: string };
        Update: Partial<ProjectFields>;
        Relationships: [
          {
            foreignKeyName: "projects_owner_user_id_fkey";
            columns: ["owner_user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      creator_payout_refund_observe: { Args: { p_purchase: string; p_refund: string; p_pending: boolean }; Returns: boolean };
      creator_payout_refund_candidates: { Args: { p_purchase: string }; Returns: unknown };
      creator_payout_account: { Args: { p_creator: string; p_page: number }; Returns: unknown };
      creator_payout_destination: { Args: { p_creator: string; p_email: string }; Returns: boolean };
      creator_payout_request: { Args: { p_creator: string; p_request: string; p_amount: number }; Returns: string };
      creator_payout_candidates: { Args: Record<string, never>; Returns: unknown };
      creator_payout_eligible: { Args: { p_id: string }; Returns: boolean };
      creator_payout_claim: { Args: { p_id: string }; Returns: unknown };
      creator_payout_defer: { Args: { p_id: string }; Returns: boolean };
      creator_payout_observe: { Args: { p_id: string; p_batch: string | null; p_item: string | null; p_status: string; p_failure_code?: string }; Returns: boolean };
      marketplace_browse: { Args: { p_query: string; p_category: string | null; p_page: number }; Returns: unknown };
      marketplace_detail: { Args: { p_listing_id: string }; Returns: unknown };
      marketplace_owned: { Args: { p_owner_user_id: string; p_page: number }; Returns: unknown };
      marketplace_owned_listing: { Args: { p_owner_user_id: string; p_listing_id: string | null; p_project_id: string | null }; Returns: unknown };
      marketplace_origin: { Args: { p_owner_user_id: string; p_project_id: string }; Returns: unknown };
      marketplace_create: { Args: { p_owner_user_id: string; p_listing_id: string; p_project_id: string; p_title: string; p_description: string; p_category: string; p_tags: string[]; p_instructions: string; p_publish: boolean; p_rights_confirmed: boolean }; Returns: unknown };
      marketplace_create_priced: { Args: { p_owner_user_id: string; p_listing_id: string; p_project_id: string; p_title: string; p_description: string; p_category: string; p_tags: string[]; p_instructions: string; p_publish: boolean; p_rights_confirmed: boolean; p_adoption_type: string; p_price_minor: number }; Returns: unknown };
      marketplace_update_priced: { Args: { p_owner_user_id: string; p_listing_id: string; p_title: string; p_description: string; p_category: string; p_tags: string[]; p_status: string; p_rights_confirmed: boolean; p_adoption_type: string; p_price_minor: number }; Returns: unknown };

      marketplace_prepare_purchase: { Args: { p_buyer_user_id: string; p_listing_id: string; p_fee_bps: number; p_pricing_version: string }; Returns: unknown };
      marketplace_attach_order: { Args: { p_purchase_id: string; p_buyer_user_id: string; p_order_id: string }; Returns: boolean };
      marketplace_purchase_state: { Args: { p_purchase_id: string; p_status: string }; Returns: boolean };
      marketplace_fulfil_purchase: { Args: { p_purchase_id: string; p_order_id: string; p_capture_id: string; p_amount_minor: number; p_currency: string; p_can_available?: boolean }; Returns: boolean };
      marketplace_paid_project: { Args: { p_buyer_user_id: string; p_purchase_id: string }; Returns: unknown };
      marketplace_begin_order: { Args: { p_buyer_user_id: string; p_purchase_id: string }; Returns: unknown };
      marketplace_redeem_purchase: { Args: { p_buyer_user_id: string; p_purchase_id: string }; Returns: unknown };
      marketplace_creator_earnings: { Args: { p_creator_user_id: string; p_page: number }; Returns: unknown };
      marketplace_ensure_settlement: { Args: { p_purchase_id: string; p_policy_version: string; p_hold_seconds: number }; Returns: unknown };
      marketplace_begin_financial_check: { Args: { p_purchase_id: string; p_policy_version: string; p_hold_seconds: number }; Returns: unknown };
      marketplace_financial_candidates: { Args: Record<string, never>; Returns: unknown };
      marketplace_apply_financial_observation: { Args: { p_purchase_id: string; p_order_id: string; p_capture_id: string; p_amount_minor: number; p_currency: string; p_capture_status: string; p_refunded_minor: number; p_can_settle: boolean; p_reason: string; p_reference_key: string }; Returns: unknown };
      marketplace_purchase_financial_status: { Args: { p_buyer_user_id: string; p_purchase_id: string }; Returns: unknown };
      marketplace_update: { Args: { p_owner_user_id: string; p_listing_id: string; p_title: string; p_description: string; p_category: string; p_tags: string[]; p_status: string; p_rights_confirmed: boolean }; Returns: unknown };
      marketplace_adopt: { Args: { p_owner_user_id: string; p_listing_id: string; p_request_id: string }; Returns: unknown };
      caption_source: { Args: { p_job_id: string }; Returns: import("@/lib/captions/contract").CaptionSource | null };
      persist_caption_track: { Args: { p_job_id: string; p_track: import("@/lib/captions/contract").CaptionTrack }; Returns: string | null };
      set_caption_preference: { Args: { p_owner_user_id: string; p_job_id: string; p_project_id: string; p_enabled: boolean }; Returns: boolean };
      set_caption_style: { Args: { p_owner_user_id: string; p_job_id: string; p_project_id: string; p_style: import("@/lib/captions/style").CaptionStyleSelection }; Returns: boolean };
      caption_dispatch_candidates: { Args: Record<string, never>; Returns: { job_id: string }[] };
      prepare_credit_purchase: { Args: { p_owner_user_id: string; p_pack_id: string; p_pack_name: string; p_amount_minor: number; p_currency: string; p_credits: number }; Returns: import("@/lib/payments/types").PurchaseRow };
      attach_paypal_order: { Args: { p_purchase_id: string; p_owner_user_id: string; p_order_id: string }; Returns: boolean };
      set_credit_purchase_state: { Args: { p_owner_user_id: string; p_order_id: string; p_status: string }; Returns: boolean };
      fulfil_paypal_purchase: { Args: { p_owner_user_id: string; p_order_id: string; p_capture_id: string; p_amount_minor: number; p_currency: string }; Returns: boolean };
      ensure_render_job: { Args: { p_job_id: string }; Returns: string | null };
      claim_render_job: { Args: { p_render_id: string; p_lease_id: string }; Returns: string };
      advance_render_job: { Args: { p_render_id: string; p_lease_id: string; p_status: string }; Returns: boolean };
      release_render_lease: { Args: { p_render_id: string; p_lease_id: string }; Returns: boolean };
      complete_render_job: { Args: { p_render_id: string; p_lease_id: string; p_metadata: Record<string, unknown> }; Returns: boolean };
      finalize_render_generation: { Args: { p_render_id: string }; Returns: boolean };
      fail_render_job: { Args: { p_render_id: string; p_lease_id: string; p_error: string }; Returns: boolean };
      render_dispatch_candidates: { Args: Record<string, never>; Returns: { job_id: string }[] };
      composition_asset_ref: { Args: { p_scene_id: string; p_track: string }; Returns: Record<string, unknown> | null };
      claim_composition_generation: { Args: { p_job_id: string; p_run_id: string; p_configuration: typeof import("@/lib/composition/contract").compositionConfiguration }; Returns: string };
      record_composition_asset_check: { Args: { p_job_id: string; p_run_id: string; p_scene_id: string; p_track: string; p_duration_ms: number | null; p_issue: string | null }; Returns: boolean };
      finish_composition_generation: { Args: { p_job_id: string; p_run_id: string }; Returns: string };
      composition_dispatch_candidates: { Args: Record<string, never>; Returns: { job_id: string }[] };
      claim_narration_generation: { Args: { p_job_id: string; p_run_id: string; p_configuration: import("@/lib/voice-ai/contract").VoiceConfiguration }; Returns: string };
      begin_narration_submission: { Args: { p_segment_id: string; p_run_id: string }; Returns: boolean };
      record_narration_response: { Args: { p_segment_id: string; p_run_id: string; p_request_id: string | null; p_usage: Record<string, unknown> }; Returns: boolean };
      record_narration_error: { Args: { p_segment_id: string; p_run_id: string; p_error: string; p_permanent: boolean; p_rejected: boolean }; Returns: boolean };
      complete_narration_segment: { Args: { p_segment_id: string; p_run_id: string; p_metadata: Record<string, unknown> }; Returns: boolean };
      finish_narration_generation: { Args: { p_job_id: string; p_run_id: string }; Returns: string };
      narration_dispatch_candidates: { Args: Record<string, never>; Returns: { job_id: string }[] };
      register_media_worker_request: { Args: { p_nonce: string; p_timestamp_ms: number }; Returns: string };
      reserve_source_segment: { Args: { p_scene_id: string; p_run_id: string; p_normalization_key: string; p_normalization: Record<string, unknown>; p_overlays: Record<string, unknown>; p_lease_id: string }; Returns: { state: string; segment_id?: string } };
      complete_source_segment: { Args: { p_scene_id: string; p_run_id: string; p_segment_id: string; p_lease_id: string; p_metadata: Record<string, unknown> }; Returns: boolean };
      fail_source_segment: { Args: { p_scene_id: string; p_run_id: string; p_segment_id: string; p_lease_id: string; p_error: string; p_permanent: boolean }; Returns: boolean };
      claim_visual_generation: { Args: { p_job_id: string; p_run_id: string }; Returns: string };
      prepare_visual_scenes: { Args: { p_job_id: string; p_run_id: string; p_scenes: ReturnType<typeof import("@/lib/video-ai/mapping").mapVisualScenes> }; Returns: boolean };
      begin_visual_submission: { Args: { p_scene_id: string; p_run_id: string }; Returns: boolean };
      retry_rejected_visual_submission: { Args: { p_scene_id: string; p_run_id: string }; Returns: boolean };
      record_visual_task: { Args: { p_scene_id: string; p_run_id: string; p_task_id: string; p_estimated_credits: number | null }; Returns: boolean };
      record_visual_status: { Args: { p_scene_id: string; p_run_id: string; p_status: string; p_credits: number | null; p_error: string | null }; Returns: boolean };
      record_visual_usage: { Args: { p_scene_id: string; p_run_id: string; p_usage: Record<string, unknown>; p_estimated_usd: number | null }; Returns: boolean };
      complete_visual_scene: { Args: { p_scene_id: string; p_run_id: string; p_size_bytes: number; p_etag: string }; Returns: boolean };
      finish_visual_generation: { Args: { p_job_id: string; p_run_id: string }; Returns: string };
      visual_dispatch_candidates: { Args: Record<string, never>; Returns: { job_id: string }[] };
      advance_generation_analysis: { Args: { p_job_id: string; p_run_id: string; p_stage: "analyzing" | "planning" }; Returns: boolean };
      begin_generation_analysis: { Args: { p_job_id: string; p_run_id: string; p_attempt: number; p_model: string }; Returns: { code: string; attempt_id?: string } };
      finish_generation_analysis: { Args: { p_job_id: string; p_run_id: string; p_attempt_id: string; p_plan: import("@/lib/ai/plan").ProductionPlan | null; p_usage: import("@/lib/ai/types").ProviderUsage | null; p_model: string | null; p_response_id: string | null; p_failure: string | null }; Returns: boolean };
      issue_generation_quote: {
        Args: {
          p_owner_user_id: string;
          p_project_id: string;
          p_request_id: string;
          p_snapshot: GenerationSnapshot;
          p_credit_cost: number | null;
          p_pricing_version: string;
          p_pricing_mode: "unconfigured" | "test";
        };
        Returns: { code: string; quote?: {
          id: string;
          eligible_free: boolean;
          required_credits: number | null;
          available_credits: number;
          free_remaining: number;
          pricing_version: string;
          pricing_mode: "unconfigured" | "test";
          expires_at: string;
        } };
      };
      confirm_generation_quote: {
        Args: { p_owner_user_id: string; p_quote_id: string; p_current_pricing_version: string };
        Returns: { code: string; job_id?: string };
      };
      admit_generation: {
        Args: {
          p_owner_user_id: string;
          p_project_id: string;
          p_request_id: string;
          p_snapshot: GenerationSnapshot;
          p_credit_cost: number | null;
        };
        Returns: { code: string; job_id?: string };
      };
      complete_generation_with_result: {
        Args: {
          p_job_id: string;
          p_run_id: string;
          p_storage_key: string;
          p_mime_type: string;
          p_size_bytes: number;
          p_etag: string;
        };
        Returns: boolean;
      };
      reserve_generation_dispatch: {
        Args: { p_job_id: string };
        Returns: number;
      };
      acknowledge_generation_dispatch: {
        Args: { p_job_id: string; p_attempt: number; p_success: boolean };
        Returns: boolean;
      };
      claim_generation_job: {
        Args: { p_job_id: string; p_run_id: string };
        Returns: string;
      };
      fail_generation_claim: {
        Args: { p_job_id: string; p_run_id: string };
        Returns: boolean;
      };
      generation_dispatch_candidates: {
        Args: Record<string, never>;
        Returns: { job_id: string }[];
      };
      expire_generation_claims: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type GenerationRow = {
  composition_run_id: string | null;
  composition_started_at: string | null;
  composition_pending_at: string | null;
  composition_ready_at: string | null;
  composition_configuration: typeof import("@/lib/composition/contract").compositionConfiguration | null;
  narration_execution_version: 0 | 1;
  narration_run_id: string | null;
  narration_started_at: string | null;
  narration_pending_at: string | null;
  audio_ready_at: string | null;
  visual_execution_version: 0 | 1;
  visual_run_id: string | null;
  visuals_started_at: string | null;
  visuals_ready_at: string | null;
  visuals_pending_at: string | null;
  production_plan_ready_at: string | null;
  accounting_version: 0 | 1;
  dispatch_status: DispatchStatus;
  dispatch_attempts: number;
  last_dispatch_at: string | null;
  dispatched_at: string | null;
  dispatch_error: "SEND_FAILED" | null;
  worker_run_id: string | null;
  worker_started_at: string | null;
  id: string;
  owner_user_id: string;
  project_id: string;
  request_id: string;
  input_snapshot: GenerationSnapshot;
  status: GenerationStatus;
  current_stage: GenerationStage | null;
  error_code: GenerationFailureCode | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
};
