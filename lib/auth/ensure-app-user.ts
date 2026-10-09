import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { DatabaseConfigurationError } from "@/lib/db/config";
import { createDatabaseClient } from "@/lib/db/server";
import type { AppUser } from "@/lib/db/types";
import { requireClerkUser } from "./require-user";

export class AppUserSyncError extends Error {
  constructor() {
    super("Your account is signed in, but the workspace could not be opened.");
    this.name = "AppUserSyncError";
  }
}

function safeErrorCode(error: unknown) {
  if (error instanceof DatabaseConfigurationError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    if (typeof error.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code))
      return error.code;
  }
  return "UNAVAILABLE";
}

// No identity argument: every call resolves the acting user from this request.
// Do not wrap this in a shared cache or expose the privileged client to the UI.
export async function ensureAppUser(): Promise<AppUser> {
  // Identity writes belong to real requests, not speculative prerendering.
  await connection();
  const { userId } = await requireClerkUser();
  let stage = "configuration";
  try {
    const database = createDatabaseClient();
    stage = "clerk_profile";
    const user = await (await clerkClient()).users.getUser(userId);
    if (user.id !== userId) throw new Error("Identity mismatch.");

    const primaryEmail = user.emailAddresses.find(
      (email) => email.id === user.primaryEmailAddressId,
    );
    stage = "database_upsert";
    const { data, error } = await database
      .from("app_users")
      .upsert(
        {
          clerk_user_id: userId,
          email:
            primaryEmail?.verification?.status === "verified"
              ? primaryEmail.emailAddress
              : null,
          first_name: user.firstName || null,
          last_name: user.lastName || null,
          image_url: user.imageUrl || null,
        },
        { onConflict: "clerk_user_id" },
      )
      .select(
        "id,clerk_user_id,email,first_name,last_name,image_url,created_at,updated_at",
      )
      .single();
    if (error) throw error;
    if (!data || data.clerk_user_id !== userId)
      throw new Error("Application identity unavailable.");
    return data;
  } catch (error: unknown) {
    // Clerk request reads can postpone partial prerendering. Those framework
    // signals must reach Next.js rather than becoming synchronization failures.
    unstable_rethrow(error);
    console.error("Application identity synchronization failed.", {
      operation: "ensureAppUser",
      stage,
      code: safeErrorCode(error),
    });
    throw new AppUserSyncError();
  }
}
