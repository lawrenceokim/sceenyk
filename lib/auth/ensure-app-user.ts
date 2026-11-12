import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { ServiceOperationError, serviceFailureMessage } from "@/lib/diagnostics/service-failure";
import { createDatabaseClient } from "@/lib/db/server";
import type { AppUser } from "@/lib/db/types";
import { requireClerkUser } from "./require-user";

export class AppUserSyncError extends ServiceOperationError {
  constructor(error?: unknown, stage = "database_upsert") {
    super(error, stage === "clerk_profile" ? "clerk" : "database", stage);
    this.message = serviceFailureMessage(this.diagnostic);
    this.name = "AppUserSyncError";
  }
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
    const { data, error, status } = await database
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
    if (error) throw new ServiceOperationError(error, "database", "database_upsert", undefined, undefined, status);
    if (!data || data.clerk_user_id !== userId)
      throw new Error("Application identity unavailable.");
    return data;
  } catch (error: unknown) {
    // Clerk request reads can postpone partial prerendering. Those framework
    // signals must reach Next.js rather than becoming synchronization failures.
    unstable_rethrow(error);
    const failure = new AppUserSyncError(error, stage);
    console.error("Application identity synchronization failed.", JSON.stringify({
      context: "ensureAppUser",
      stage,
      code: failure.code,
      ...failure.diagnostic,
    }));
    throw failure;
  }
}
