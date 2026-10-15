import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { ensureAppUser } from "./ensure-app-user";

export class SupportAuthorizationError extends Error {
  constructor(
    readonly code: "SUPPORT_ACCESS_DENIED" | "SUPPORT_AUTHORIZATION_UNAVAILABLE",
  ) {
    super("Internal access is unavailable.");
    this.name = "SupportAuthorizationError";
  }
}

const roleRecord = z.strictObject({
  user_id: z.uuid(),
  role: z.enum(["user", "support", "admin"]),
});

// Call independently at every internal data/action boundary. No input identity,
// shared cache, client role, or Clerk profile metadata can establish authority.
export async function requireAdminOrSupport() {
  const user = await ensureAppUser();
  let record: z.infer<typeof roleRecord> | null;
  try {
    const { data, error } = await createDatabaseClient()
      .from("internal_user_roles")
      .select("user_id,role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    record = data === null ? null : roleRecord.parse(data);
    if (record && record.user_id !== user.id) {
      throw new Error("Role identity mismatch.");
    }
  } catch (error) {
    unstable_rethrow(error);
    // Never expose database diagnostics or use a stale role on lookup failure.
    throw new SupportAuthorizationError("SUPPORT_AUTHORIZATION_UNAVAILABLE");
  }

  if (!record || record.role === "user") {
    throw new SupportAuthorizationError("SUPPORT_ACCESS_DENIED");
  }
  return { userId: user.id, clerkUserId: user.clerk_user_id, role: record.role };
}
