import { unstable_rethrow } from "next/navigation";
import { requireAdminOrSupport, SupportAuthorizationError } from "@/lib/auth/require-admin-or-support";
import { PayoutCheckError } from "@/lib/marketplace/withdrawals/observations";
import { PayoutSupportInputError, reconcileSupportPayout } from "@/lib/payout-support/server";

const headers = { "Cache-Control": "private, no-store" };
export const maxDuration = 120;
async function readInput(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new PayoutSupportInputError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1024) { await reader.cancel(); throw new PayoutSupportInputError(); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch { throw new PayoutSupportInputError(); }
  finally { reader.releaseLock(); }
}
export async function POST(request: Request) {
  try {
    await requireAdminOrSupport();
    const origin = request.headers.get("origin");
    // Browser mutations are same-origin. Explicit server-side bearer clients
    // still undergo the same real Clerk and storage-role checks.
    if (origin ? origin !== new URL(request.url).origin : !request.headers.get("authorization")?.startsWith("Bearer ")) {
      console.warn("Payout support access denied.", { boundary: "reconcile_origin" });
      return Response.json({ message: "Internal access denied." }, { status: 403, headers });
    }
    let input: unknown;
    try { input = await readInput(request); }
    catch { return Response.json({ message: "Invalid payout-support request." }, { status: 400, headers }); }
    return Response.json(await reconcileSupportPayout(input), { headers });
  } catch (error) {
    unstable_rethrow(error);
    if ((error instanceof SupportAuthorizationError && error.code === "SUPPORT_ACCESS_DENIED") || (error instanceof PayoutCheckError && error.code === "ACCESS_DENIED")) {
      console.warn("Payout support access denied.", { boundary: "reconcile" });
      return Response.json({ message: "Internal access denied." }, { status: 403, headers });
    }
    if (error instanceof PayoutSupportInputError) return Response.json({ message: "Invalid payout-support request." }, { status: 400, headers });
    if (error instanceof PayoutCheckError && error.code === "NOT_FOUND") return Response.json({ message: "Withdrawal unavailable." }, { status: 404, headers });
    return Response.json({ message: "Payout status couldn’t be checked. Refresh before checking again." }, { status: 503, headers });
  }
}
