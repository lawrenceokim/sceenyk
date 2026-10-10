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
      generation_jobs: {
        Row: GenerationRow;
        Insert: Pick<
          GenerationRow,
          "owner_user_id" | "project_id" | "request_id" | "input_snapshot"
        >;
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
