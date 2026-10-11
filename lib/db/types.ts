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
          job_id: string;
          amount: number;
          type: "reservation" | "consumption" | "release";
          direction: "hold" | "debit" | "restore";
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
