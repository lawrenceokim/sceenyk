"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { AppUserSyncError } from "@/lib/auth/ensure-app-user";
import { deleteOwnedProject, getOwnedProject, renameOwnedProject, saveOwnedProject } from "@/lib/projects/server";
import type { DeleteProjectResult, RenameProjectResult, SaveProjectResult } from "@/lib/projects/types";

export async function projectAvailabilityAction(id: string): Promise<{ ok: true; available: boolean } | { ok: false }> {
  try {
    return { ok: true, available: !!await getOwnedProject(id) };
  } catch (error: unknown) {
    unstable_rethrow(error);
    return { ok: false };
  }
}

export async function saveProjectAction(
  input: unknown,
): Promise<SaveProjectResult> {
  let result: SaveProjectResult;
  try {
    result = await saveOwnedProject(input);
  } catch (error: unknown) {
    unstable_rethrow(error);
    if (!(error instanceof AppUserSyncError)) {
      console.error("Project save failed.", {
        operation: "save",
        code: "UNAVAILABLE",
      });
    }
    return {
      ok: false,
      code: "UNAVAILABLE",
      message: "Your draft couldn’t be saved. Please try again.",
    };
  }
  if (result.ok) {
    revalidatePath("/projects");
    revalidatePath(`/projects/${result.project.id}`);
  }
  return result;
}

export async function renameProjectAction(input: unknown): Promise<RenameProjectResult> {
  try {
    const result = await renameOwnedProject(input);
    if (result.ok) {
      revalidatePath("/projects");
      revalidatePath(`/projects/${result.project.id}`);
    }
    return result;
  } catch (error: unknown) {
    unstable_rethrow(error);
    return { ok: false, code: "UNAVAILABLE", message: "Your project couldn’t be renamed. Please try again." };
  }
}

export async function deleteProjectAction(input: unknown): Promise<DeleteProjectResult> {
  try {
    const result = await deleteOwnedProject(input);
    if (result.ok) {
      revalidatePath("/projects");
      revalidatePath(`/projects/${result.projectId}`);
      revalidatePath("/studio");
    }
    return result;
  } catch (error: unknown) {
    unstable_rethrow(error);
    return { ok: false, code: "UNAVAILABLE", message: "Your project couldn’t be deleted. Please try again." };
  }
}
