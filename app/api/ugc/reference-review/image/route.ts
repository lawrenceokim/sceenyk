import { unstable_rethrow } from "next/navigation";
import { readReferencePreview } from "@/lib/reference-review/preview";
import { ReferenceReviewAccessError } from "@/lib/reference-review/server";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", Vary: "Cookie",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin" };
  try {
    const media = await readReferencePreview(new URL(request.url).searchParams.get("token"), request.signal);
    return new Response(media.body, { headers: { ...headers, "Content-Type": "image/png", "Content-Length": String(media.sizeBytes) } });
  } catch (error) {
    unstable_rethrow(error);
    return Response.json({ ok: false, message: "This private preview is unavailable. Reopen it to try again." },
      { status: error instanceof ReferenceReviewAccessError ? error.status : 503, headers });
  }
}
