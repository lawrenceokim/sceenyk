import { unstable_rethrow } from "next/navigation";
import { ReferenceReviewAccessError } from "@/lib/reference-review/server";
import { FinalVideoError } from "@/lib/final-video-generation/contract";
import { FinalPreflightError } from "@/lib/final-video-generation/capabilities";
import { finalVideoAction, finalErrorMessage } from "@/lib/final-video-generation/server";

const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", Vary: "Cookie",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new ReferenceReviewAccessError(403);
    const reader = request.body?.getReader(); if (!reader) throw new FinalVideoError("FINAL_INVALID_ACTION", 400);
    let size = 0; const chunks: Uint8Array[] = [];
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
      if (size > 4096) throw new FinalVideoError("FINAL_INVALID_ACTION", 413); chunks.push(part.value); } }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    let input: unknown; try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new FinalVideoError("FINAL_INVALID_ACTION", 400); }
    return Response.json({ ok: true, finalVideo: await finalVideoAction(input) }, { headers });
  } catch (error) {
    unstable_rethrow(error);
    const status = error instanceof FinalVideoError ? error.status : error instanceof ReferenceReviewAccessError ? error.status : 503;
    return Response.json({ ok: false, ...(error instanceof FinalPreflightError ? { issues: error.diagnostics } : {}),
      message: error instanceof FinalVideoError ? finalErrorMessage(error.code, error instanceof FinalPreflightError ? error.diagnostics : undefined) :
      status === 401 ? "Sign in to review this video." : "Final video is unavailable. Check status before continuing." }, { status, headers });
  }
}
