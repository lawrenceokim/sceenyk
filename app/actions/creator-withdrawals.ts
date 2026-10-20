"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getWithdrawalAccount, requestWithdrawal, savePayoutDestination } from "@/lib/marketplace/withdrawals/server";

async function mutation(work: () => Promise<unknown>) {
  try {
    await work();
    revalidatePath("/credits/earnings");
    revalidatePath("/settings/earnings");
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false as const, message: "Withdrawal couldn’t be saved. Check your payout email, available earnings and the $5 minimum, then refresh before trying again." };
  }
}
export async function payoutDestinationAction(input: unknown) { return mutation(() => savePayoutDestination(input)); }
export async function withdrawalRequestAction(input: unknown) { return mutation(() => requestWithdrawal(input)); }
export async function withdrawalAccountAction(page = 1) {
  try { return { ok: true as const, data: await getWithdrawalAccount(page) }; }
  catch (error) { unstable_rethrow(error); return { ok: false as const, message: "Withdrawal history couldn’t be refreshed." }; }
}
