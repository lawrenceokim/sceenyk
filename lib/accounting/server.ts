import "server-only";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import type { GenerationSnapshot } from "@/lib/generation/types";
import type { FreeAllowance } from "./types";

export async function getFreeAllowance(): Promise<FreeAllowance> {
  const user = await ensureAppUser();
  const { data, error } = await createDatabaseClient()
    .from("generation_accounts")
    .select("free_total,free_reserved,free_consumed")
    .eq("owner_user_id", user.id)
    .single();
  if (error || !data) throw new Error("ALLOWANCE_UNAVAILABLE");
  return {
    total: data.free_total,
    available: data.free_total - data.free_reserved - data.free_consumed,
    reserved: data.free_reserved,
    consumed: data.free_consumed,
  };
}

// Deliberately no prices or client override. A later approved tariff resolver
// can return an exact positive integer cost for this authoritative snapshot.
export function trustedGenerationCost(
  snapshot: GenerationSnapshot,
): number | null {
  void snapshot;
  return null;
}
