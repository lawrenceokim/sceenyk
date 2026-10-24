import { getOwnedUgcJobProgress, UgcJobAccessError, UgcJobAuthenticationError, UgcProgressReadError } from "@/lib/ugc-jobs/server";
import { unstable_rethrow } from "next/navigation";

// Ordinary JSON, never a Flight/RSC action response for the Studio route.
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "CDN-Cache-Control": "no-store" };
  try {
    const job = await getOwnedUgcJobProgress(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json({ ok: true, job }, { headers });
  } catch (error) {
    unstable_rethrow(error);
    const code = error instanceof UgcJobAuthenticationError ? "AUTHENTICATION_REQUIRED" :
      error instanceof UgcJobAccessError ? "PROGRESS_UNAVAILABLE" : "PROGRESS_READ_FAILED";
    const status = error instanceof UgcJobAuthenticationError ? 401 : error instanceof UgcJobAccessError ? 404 : 503;
    // Fixed codes only. No request URL, owner, DB/provider error or private data.
    console.error("UGC_PROGRESS_READ_FAILED", {
      code,
      ...(error instanceof UgcProgressReadError ? { phase: error.phase, databaseCode: error.databaseCode } : {}),
    });
    return Response.json({ ok: false, code }, { status, headers });
  }
}
