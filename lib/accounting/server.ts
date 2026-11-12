import "server-only";
import { readAppUser } from "@/lib/auth/read-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import type { FreeAllowance } from "./types";
import { lowCreditThreshold } from "./config";
import { generationAccess } from "./generation-policy-server";

export async function getCreditSummary() {
  const available = await getPaidCreditBalance();
  return { available, lowBalance: available <= lowCreditThreshold() };
}

export async function getPaidCreditBalance() {
  const user = await readAppUser();
  const { data, error } = await createDatabaseClient().from("generation_accounts")
    .select("credit_available").eq("owner_user_id", user.id).single();
  if (error || !data) throw new Error("CREDIT_BALANCE_UNAVAILABLE");
  return data.credit_available;
}

export async function getFreeAllowance(): Promise<FreeAllowance> {
  const user = await readAppUser();
  const data = await generationAccess(user.id);
  return {
    total: data.total,
    available: data.remaining,
    reserved: data.reserved,
    consumed: data.consumed,
    reviewRequired: data.historyReview,
  };
}

