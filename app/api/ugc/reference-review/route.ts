import { unstable_rethrow } from "next/navigation";
import { approveReference, requestReferenceRegeneration, ReferenceReviewAccessError } from "@/lib/reference-review/server";
import { issueReferencePreview } from "@/lib/reference-review/preview";

const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new ReferenceReviewAccessError(403);
    const reader = request.body?.getReader();
    if (!reader) throw new ReferenceReviewAccessError(400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const item = await reader.read(); if (item.done) break;
        size += item.value.length; if (size > 2048) throw new ReferenceReviewAccessError(400); chunks.push(item.value); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const text = Buffer.concat(chunks).toString("utf8");
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new ReferenceReviewAccessError(400); }
    if (!body || typeof body !== "object" || !("action" in body)) throw new ReferenceReviewAccessError(400);
    const { action, ...input } = body;
    if (action === "preview") return Response.json({ ok: true, preview: await issueReferencePreview(input) }, { headers });
    if (action === "approve") return Response.json({ ok: true, review: await approveReference(input) }, { headers });
    if (action === "regenerate") return Response.json({ ok: true, review: await requestReferenceRegeneration(input) }, { headers });
    throw new ReferenceReviewAccessError(400);
  } catch (error) {
    unstable_rethrow(error);
    return Response.json({ ok: false, message: error instanceof ReferenceReviewAccessError && error.status === 409 ?
      "The reference changed or is not ready. Check status and try again." : "Reference review is unavailable. Please try again." },
    { status: error instanceof ReferenceReviewAccessError ? error.status : 503, headers });
  }
}
