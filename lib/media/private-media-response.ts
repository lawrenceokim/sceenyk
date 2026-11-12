import "server-only";
import { signR2Read } from "@/lib/storage/r2";
import { detailVideoRange } from "./detail-video-server";

export const privateMediaHeaders = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store", Vary: "Cookie",
  "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin", "X-Content-Type-Options": "nosniff" };

// Same immutable range validation as full-video playback. Storage capabilities
// stay on the server; returned bytes retain the caller's existing authorization.
export async function privateMediaResponse(request: Request, media: { version: string; storageKey: string; etag: string; sizeBytes: number; mimeType: string }, stillAllowed: () => Promise<boolean>) {
  const headers = privateMediaHeaders, etag = `"${media.version}"`;
  let range;
  try { range = detailVideoRange(request.headers.has("if-range") && request.headers.get("if-range") !== etag ? null : request.headers.get("range"), media.sizeBytes); }
  catch { return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${media.sizeBytes}` } }); }
  const signed = await signR2Read(media.storageKey, media.etag, media.mimeType);
  const upstream = await fetch(signed.url, { cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(120000)]),
    headers: { "If-Match": media.etag, ...(range ? { Range: range.header } : {}) } });
  try {
    if (!upstream.body || upstream.status !== (range ? 206 : 200) || upstream.headers.get("etag") !== media.etag ||
      Number(upstream.headers.get("content-length")) !== (range?.length ?? media.sizeBytes) ||
      upstream.headers.get("content-type")?.split(";")[0].trim() !== media.mimeType ||
      range && upstream.headers.get("content-range") !== range.contentRange || !await stillAllowed()) throw new Error("PRIVATE_MEDIA_UNAVAILABLE");
  } catch (error) { await upstream.body?.cancel(); throw error; }
  return new Response(upstream.body, { status: range ? 206 : 200, headers: { ...headers, "Content-Type": media.mimeType, "Accept-Ranges": "bytes", ETag: etag,
    "Content-Length": String(range?.length ?? media.sizeBytes), ...(range ? { "Content-Range": range.contentRange } : {}) } });
}
