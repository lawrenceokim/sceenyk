"use server";
import { unstable_rethrow } from "next/navigation";
import { getFreeAllowance } from "@/lib/accounting/server";
import type { FreeAllowance } from "@/lib/accounting/types";

export async function freeAllowanceAction(): Promise<
  { ok: true; value: FreeAllowance } | { ok: false; message: string }
> {
  try {
    return { ok: true, value: await getFreeAllowance() };
  } catch (error: unknown) {
    unstable_rethrow(error);
    console.error("Free allowance read failed.", { code: "UNAVAILABLE" });
    return { ok: false, message: "Free allowance couldn’t be loaded. Please try again." };
  }
}
