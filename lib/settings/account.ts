import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";

// Clerk enforces this flag in its API as well as its account UI. A CSS-hidden
// delete button would still allow deletion without Sceenyk's retention policy.
export async function prepareSettingsAccount() {
  const user = await ensureAppUser();
  const client = await clerkClient();
  const account = await client.users.getUser(user.clerk_user_id);
  if (account.id !== user.clerk_user_id) throw new Error("ACCOUNT_UNAVAILABLE");
  if (account.deleteSelfEnabled) {
    const updated = await client.users.updateUser(account.id, { deleteSelfEnabled: false });
    if (updated.deleteSelfEnabled) throw new Error("ACCOUNT_UNAVAILABLE");
  }
  return { clerkUserId: user.clerk_user_id };
}
