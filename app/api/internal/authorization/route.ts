import { unstable_rethrow } from "next/navigation";
import {
  requireAdminOrSupport,
  SupportAuthorizationError,
} from "@/lib/auth/require-admin-or-support";

const headers = { "Cache-Control": "private, no-store" };

// Status only: no role, identity, payout data, or role-management capability.
export async function GET() {
  try {
    await requireAdminOrSupport();
    return Response.json({ authorized: true }, { headers });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof SupportAuthorizationError && error.code === "SUPPORT_ACCESS_DENIED") {
      return Response.json({ code: "ACCESS_DENIED" }, { status: 403, headers });
    }
    return Response.json({ code: "UNAVAILABLE" }, { status: 503, headers });
  }
}
