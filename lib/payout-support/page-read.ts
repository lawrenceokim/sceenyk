import "server-only";
import { notFound, unstable_rethrow } from "next/navigation";
import { SupportAuthorizationError } from "@/lib/auth/require-admin-or-support";
import { PayoutCheckError } from "@/lib/marketplace/withdrawals/observations";
import { PayoutSupportInputError } from "./server";

export async function readSupportPage<T>(read: () => Promise<T>) {
  try { return { ok: true as const, data: await read() }; }
  catch (error) {
    unstable_rethrow(error);
    const denied = (error instanceof SupportAuthorizationError && error.code === "SUPPORT_ACCESS_DENIED") || (error instanceof PayoutCheckError && error.code === "ACCESS_DENIED");
    if (denied) console.warn("Payout support access denied.", { boundary: "page" });
    if (denied || (error instanceof PayoutCheckError && error.code === "NOT_FOUND") || error instanceof PayoutSupportInputError) notFound();
    return { ok: false as const };
  }
}
export function supportPageNumber(value: string | string[] | undefined) {
  return typeof value === "string" && /^\d{1,6}$/.test(value) ? Math.max(1, Math.min(100000, Number(value))) : 1;
}
