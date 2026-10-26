import { unstable_rethrow } from "next/navigation";
import { locationAction, locationPreview } from "@/lib/location-reference/server";
import { ReferenceReviewAccessError } from "@/lib/reference-review/server";
import { LocationError } from "@/lib/location-reference/errors";
import { locationErrorMessage } from "@/lib/location-reference/contract";

const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", Vary: "Cookie",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
function failure(error: unknown) {
  unstable_rethrow(error);
  return Response.json({ ok: false, ...(error instanceof LocationError ? { code: error.code } : {}), message: error instanceof LocationError ? locationErrorMessage(error.code) : error instanceof ReferenceReviewAccessError && error.status === 409 ?
    "Location changed or is not ready. Check status and try again." : "Location is unavailable. Check setup and refresh status." },
  { status: error instanceof ReferenceReviewAccessError ? error.status : 503, headers });
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new ReferenceReviewAccessError(403);
    const reader = request.body?.getReader(); if (!reader) throw new ReferenceReviewAccessError(400);
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break;
      size += part.value.length; if (size > 48_000) throw new ReferenceReviewAccessError(400); chunks.push(part.value); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ReferenceReviewAccessError(400); }
    return Response.json({ ok: true, location: await locationAction(input) }, { headers });
  } catch (error) { return failure(error); }
}
export async function GET(request: Request) {
  try {
    const bytes = await locationPreview(Object.fromEntries(new URL(request.url).searchParams), AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]));
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/png", "Content-Length": String(bytes.length) } });
  } catch (error) { return failure(error); }
}
