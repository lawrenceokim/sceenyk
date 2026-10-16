"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCreationPreferences, saveCreationPreferences } from "@/lib/settings/server";

async function run(operation: typeof getCreationPreferences) {
  try { return { ok: true as const, data: await operation() }; }
  catch (error) {
    unstable_rethrow(error);
    return { ok: false as const, message: "Creation defaults couldn’t be loaded or saved. Check your connection and try again." };
  }
}
export async function creationPreferencesAction() { return run(getCreationPreferences); }
export async function saveCreationPreferencesAction(input: unknown) {
  return run(async () => {
    const result = await saveCreationPreferences(input);
    revalidatePath("/dashboard/settings/creation");
    return result;
  });
}
