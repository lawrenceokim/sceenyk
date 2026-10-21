import type { CategoryId, CreationSettings, CreationType, UgcType } from "./options";

export type ProjectDraft = {
  title: string;
  category: CategoryId;
  prompt: string;
  settings: CreationSettings;
  creationType: CreationType;
  ugcType: UgcType;
};

// Only the brief needed by the workspace; ownership records stay server-side.
export type SavedProject = ProjectDraft & {
  id: string;
  status: "draft";
  createdAt: string;
  updatedAt: string;
};
export type ProjectSummary = Omit<SavedProject, "prompt">;
export type RenameProjectResult =
  | { ok: true; project: Pick<SavedProject, "id" | "title" | "updatedAt"> }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND" | "UNAVAILABLE"; message: string };
export type DeleteProjectResult =
  | { ok: true; projectId: string }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND" | "ACTIVE_GENERATION" | "UNAVAILABLE"; message: string };
export type ProjectPage = {
  projects: ProjectSummary[];
  total: number;
  page: number;
  pageSize: number;
};
export type SaveProjectInput = ProjectDraft & {
  id: string;
  mode: "create" | "update";
};
export type SaveProjectResult =
  | { ok: true; project: SavedProject }
  | {
      ok: false;
      code: "INVALID_INPUT" | "NOT_FOUND" | "UNAVAILABLE";
      message: string;
    };
