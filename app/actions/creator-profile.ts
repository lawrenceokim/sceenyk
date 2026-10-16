"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CreatorProfileError, saveCreatorProfile, removeCreatorAvatar } from "@/lib/marketplace/creators/server";
async function run(operation: () => ReturnType<typeof saveCreatorProfile>) {
  try {
    const profile = await operation();
    revalidatePath("/marketplace", "layout");
    revalidatePath("/dashboard/settings/creator-profile");
    return { ok: true as const, profile };
  }
  catch (error) {
    unstable_rethrow(error);
    return { ok: false as const, code: error instanceof CreatorProfileError ? error.code : "UNAVAILABLE", message: error instanceof CreatorProfileError ? error.message : "Your public profile couldn’t be saved. Please try again." };
  }
}
export async function saveCreatorProfileAction(input: unknown) { return run(() => saveCreatorProfile(input)); }
export async function removeCreatorAvatarAction() { return run(removeCreatorAvatar); }
