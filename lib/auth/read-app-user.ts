import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { createDatabaseClient } from "@/lib/db/server";
import { ServiceOperationError } from "@/lib/diagnostics/service-failure";
import { AppUserSyncError, ensureAppUser } from "./ensure-app-user";
import { requireClerkUser } from "./require-user";

// Request-derived identity, not profile synchronization. React cache deduplicates
// render reads only; actions/handlers still authenticate on every invocation.
// Never put this result in a shared cache or accept a browser-supplied owner.
export const readAppUser = cache(async () => {
  await connection();
  const { userId } = await requireClerkUser();
  try {
    const result = await createDatabaseClient().from("app_users").select("id,clerk_user_id").eq("clerk_user_id", userId).maybeSingle();
    if (result.error) throw new AppUserSyncError(new ServiceOperationError(result.error, "database", "account_lookup", undefined, undefined, result.status), "account_lookup");
    if (result.data) {
      if (result.data.clerk_user_id !== userId || !result.data.id) throw new AppUserSyncError(undefined, "account_lookup");
      return result.data;
    }
  } catch (error) {
    unstable_rethrow(error);
    const failure = error instanceof AppUserSyncError ? error : new AppUserSyncError(error, "account_lookup");
    console.error("Application identity lookup failed.", JSON.stringify({ context: "readAppUser", code: failure.code, ...failure.diagnostic }));
    throw failure;
  }
  // A genuinely missing mapping still uses the existing verified provisioning.
  const user = await ensureAppUser();
  return { id: user.id, clerk_user_id: user.clerk_user_id };
});
