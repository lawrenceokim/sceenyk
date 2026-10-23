import "server-only";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import type { ProjectFields, ProjectRow } from "@/lib/db/types";
import { legacyDuration, projectPageSize } from "./options";
import { ugcV1ReferenceLimitsSchema } from "./ugc-v1";
import { readOwnedUgcV1References } from "./ugc-v1-server";
import {
  projectIdSchema,
  projectPageSchema,
  saveProjectSchema,
  renameProjectSchema,
  deleteProjectSchema,
} from "./validation";
import type {
  ProjectPage,
  ProjectSummary,
  SavedProject,
  SaveProjectResult,
  RenameProjectResult,
  DeleteProjectResult,
} from "./types";

const briefColumns =
  "id,title,category,prompt,creation_type,ugc_type,aspect_ratio,duration,visual_style,tone,status,created_at,updated_at";
const summaryColumns =
  "id,title,category,creation_type,ugc_type,aspect_ratio,duration,visual_style,tone,status,created_at,updated_at";

export class ProjectAccessError extends Error {
  constructor() {
    super("Your projects couldn’t be loaded. Please try again.");
    this.name = "ProjectAccessError";
  }
}

function logDatabaseError(operation: string, error: unknown) {
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{1,40}$/.test(error.code)
      ? error.code
      : "UNAVAILABLE";
  console.error("Project database operation failed.", { operation, code });
}

function toSummary(
  row: Omit<ProjectRow, "owner_user_id" | "prompt" | "deleted_at">,
): ProjectSummary {
  if (row.status !== "draft") throw new ProjectAccessError();
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    creationType: row.creation_type ?? "freestyle",
    ugcType: row.ugc_type ?? "advertisement",
    settings: {
      aspectRatio: row.aspect_ratio,
      duration: row.duration,
      visualStyle: row.visual_style,
      tone: row.tone,
    },
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toBrief(row: Omit<ProjectRow, "owner_user_id" | "deleted_at">): SavedProject {
  return { ...toSummary(row), prompt: row.prompt };
}

const notFoundResult = {
  ok: false,
  code: "NOT_FOUND",
  message: "This project is unavailable. Open a project from your dashboard.",
} as const;

// Exported services never accept an owner: each independently verifies this
// request and resolves its application identity before touching projects.
export async function saveOwnedProject(
  input: unknown,
): Promise<SaveProjectResult> {
  const user = await ensureAppUser();
  const parsed = saveProjectSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message =
      issue.path[0] === "title" || issue.path[0] === "prompt"
        ? issue.message
        : "Check your project details and selected settings.";
    return { ok: false, code: "INVALID_INPUT", message };
  }
  const { id, mode, title, category, prompt, settings, creationType, ugcType } = parsed.data;
  const fields: ProjectFields = {
    title,
    category,
    prompt,
    creation_type: creationType,
    ugc_type: ugcType,
    aspect_ratio: settings.aspectRatio,
    duration: settings.duration,
    visual_style: settings.visualStyle,
    tone: settings.tone,
  };
  const database = createDatabaseClient();
  if (settings.duration === legacyDuration.value) {
    const existing = await database.from("projects").select("duration").eq("id", id).eq("owner_user_id", user.id).eq("status", "draft").maybeSingle();
    if (existing.error || existing.data?.duration !== legacyDuration.value) {
      return { ok: false, code: "INVALID_INPUT", message: "Choose a supported Studio duration." };
    }
  }
  if (creationType === "ugc") {
    const references = await readOwnedUgcV1References(database, user.id, id);
    if (!references) return { ok: false, code: "UNAVAILABLE", message: "Your UGC references couldn’t be checked. Please try again." };
    const limits = ugcV1ReferenceLimitsSchema.safeParse(references);
    if (!limits.success) return { ok: false, code: "INVALID_INPUT", message: limits.error.issues[0].message };
  }
  if (mode === "create") {
    const { data, error } = await database
      .from("projects")
      .insert({ id, owner_user_id: user.id, ...fields })
      .select(briefColumns)
      .single();
    if (!error && data) return { ok: true, project: toBrief(data) };
    if (error?.code !== "23505") {
      logDatabaseError("create", error);
      return {
        ok: false,
        code: "UNAVAILABLE",
        message: "Your draft couldn’t be saved. Please try again.",
      };
    }
    // A first-save retry keeps its UUID. A collision can only update a record
    // belonging to this verified owner; never use unrestricted project upsert.
  }
  const { data, error } = await database
    .from("projects")
    .update(fields)
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .eq("status", "draft")
    .select(briefColumns)
    .maybeSingle();
  if (error) {
    logDatabaseError("update", error);
    return {
      ok: false,
      code: "UNAVAILABLE",
      message: "Your draft couldn’t be saved. Please try again.",
    };
  }
  return data ? { ok: true, project: toBrief(data) } : notFoundResult;
}

export async function getOwnedProject(
  input: unknown,
): Promise<SavedProject | null> {
  const user = await ensureAppUser();
  const parsed = projectIdSchema.safeParse(input);
  if (!parsed.success) return null;
  const { data, error } = await createDatabaseClient()
    .from("projects")
    .select(briefColumns)
    .eq("id", parsed.data)
    .eq("owner_user_id", user.id)
    .eq("status", "draft")
    .maybeSingle();
  if (error) {
    logDatabaseError("read", error);
    throw new ProjectAccessError();
  }
  return data ? toBrief(data) : null;
}

export async function renameOwnedProject(input: unknown): Promise<RenameProjectResult> {
  const user = await ensureAppUser();
  const parsed = renameProjectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Enter a project name between 1 and 120 characters." };
  // Update only the title: renaming must not overwrite a concurrently edited brief.
  const { data, error } = await createDatabaseClient().from("projects")
    .update({ title: parsed.data.title })
    .eq("id", parsed.data.id).eq("owner_user_id", user.id).eq("status", "draft")
    .select("id,title,updated_at").maybeSingle();
  if (error) {
    logDatabaseError("rename", error);
    return { ok: false, code: "UNAVAILABLE", message: "Your project couldn’t be renamed. Please try again." };
  }
  return data ? { ok: true, project: { id: data.id, title: data.title, updatedAt: data.updated_at } } : notFoundResult;
}

export async function deleteOwnedProject(input: unknown): Promise<DeleteProjectResult> {
  const user = await ensureAppUser();
  const parsed = deleteProjectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Choose a saved project to delete." };
  const { data, error } = await createDatabaseClient().rpc("delete_owned_project", { p_owner_user_id: user.id, p_project_id: parsed.data.id });
  if (error) {
    logDatabaseError("delete", error);
    return { ok: false, code: "UNAVAILABLE", message: "Your project couldn’t be deleted. Please try again." };
  }
  const result = z.object({ code: z.enum(["DELETED", "NOT_FOUND", "ACTIVE_GENERATION"]) }).safeParse(data);
  if (!result.success) return { ok: false, code: "UNAVAILABLE", message: "Your project couldn’t be deleted. Please try again." };
  if (result.data.code === "DELETED") return { ok: true, projectId: parsed.data.id };
  if (result.data.code === "ACTIVE_GENERATION") return { ok: false, code: "ACTIVE_GENERATION", message: "This project is still generating. Wait for it to finish before deleting." };
  return { ok: false, code: "NOT_FOUND", message: "This project is no longer available." };
}

export async function listOwnedProjects(
  input: unknown = 1,
): Promise<ProjectPage> {
  const user = await ensureAppUser();
  const parsed = projectPageSchema.safeParse(input);
  const page = parsed.success ? parsed.data : 1;
  const offset = (page - 1) * projectPageSize;
  const { data, error, count } = await createDatabaseClient()
    .from("projects")
    .select(summaryColumns, { count: "exact" })
    .eq("owner_user_id", user.id)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + projectPageSize - 1);
  if (error || !data || count === null) {
    logDatabaseError("list", error);
    throw new ProjectAccessError();
  }
  return {
    projects: data.map(toSummary),
    total: count,
    page,
    pageSize: projectPageSize,
  };
}
