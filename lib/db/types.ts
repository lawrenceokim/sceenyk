import type { CategoryId, CreationSettings } from "@/lib/projects/options";

// Authored migration contracts. app_users is hosted-verified; projects is
// pending hosted application/verification until recorded in the tracker.
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

export type Database = {
  public: {
    Tables: {
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
