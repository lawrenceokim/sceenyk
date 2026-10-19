"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { AppUserSyncError } from "@/lib/auth/ensure-app-user";
import { renameOwnedProject, saveOwnedProject } from "@/lib/projects/server";
import type { RenameProjectResult, SaveProjectResult } from "@/lib/projects/types";

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
