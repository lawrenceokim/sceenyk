"use server";

import { unstable_rethrow } from "next/navigation";
import { readStudioMode, saveStudioMode } from "@/lib/studio-mode/server";
import type { StudioModeResult } from "@/lib/studio-mode/contract";

export async function readStudioModeAction(projectId: unknown): Promise<StudioModeResult> {
  try { return { ok: true, data: await readStudioMode(projectId) }; }
  catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: "Studio mode couldn’t be loaded. Try again." };
  }
}

export async function saveStudioModeAction(input: unknown): Promise<StudioModeResult> {
  try { return { ok: true, data: await saveStudioMode(input) }; }
  catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: "Studio mode couldn’t be saved. Try again." };
  }
  // Return metadata only: no path revalidation, cookies or router refresh.
}
