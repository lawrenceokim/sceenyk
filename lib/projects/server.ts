import "server-only";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import type { ProjectFields, ProjectRow } from "@/lib/db/types";
import { projectPageSize } from "./options";
import {
  projectIdSchema,
  projectPageSchema,
  saveProjectSchema,
} from "./validation";
import type {
  ProjectPage,
  ProjectSummary,
  SavedProject,
  SaveProjectResult,
} from "./types";

const briefColumns =
  "id,title,category,prompt,aspect_ratio,duration,visual_style,tone,status,created_at,updated_at";
const summaryColumns =
  "id,title,category,aspect_ratio,duration,visual_style,tone,status,created_at,updated_at";

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
  row: Omit<ProjectRow, "owner_user_id" | "prompt">,
): ProjectSummary {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
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

function toBrief(row: Omit<ProjectRow, "owner_user_id">): SavedProject {
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
  const { id, mode, title, category, prompt, settings } = parsed.data;
  const fields: ProjectFields = {
    title,
    category,
    prompt,
    aspect_ratio: settings.aspectRatio,
    duration: settings.duration,
    visual_style: settings.visualStyle,
    tone: settings.tone,
  };
  const database = createDatabaseClient();
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
    .maybeSingle();
  if (error) {
    logDatabaseError("read", error);
    throw new ProjectAccessError();
  }
  return data ? toBrief(data) : null;
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
