import { unstable_rethrow } from "next/navigation";
import { detailVideoInput, detailVideoRange, resolveDetailVideo } from "@/lib/media/detail-video-server";
import { signR2Read } from "@/lib/storage/r2";

const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store", Vary: "Cookie",
  "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site" || request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
    return new Response("Video unavailable", { status: 403, headers });
  try {
    const { kind, id, version } = detailVideoInput.parse(Object.fromEntries(new URL(request.url).searchParams));
    const resolved = await resolveDetailVideo(kind, id);
    if (!resolved || resolved.video.version !== version) return new Response("Video unavailable", { status: 404, headers });
    const { video } = resolved, etag = `"${video.version}"`;
    let range;
    try { range = detailVideoRange(request.headers.has("if-range") && request.headers.get("if-range") !== etag ? null : request.headers.get("range"), video.sizeBytes); }
    catch { return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${video.sizeBytes}` } }); }
    // The existing immutable storage capability is used server-side only. Never
    // redirect a public viewer to a creator's private key or signed storage URL.
    const signed = await signR2Read(video.storageKey, video.etag, "video/mp4");
    const upstream = await fetch(signed.url, { cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(120000)]),
      headers: { "If-Match": video.etag, ...(range ? { Range: range.header } : {}) } });
    try {
      if (!upstream.body || upstream.status !== (range ? 206 : 200) || upstream.headers.get("etag") !== video.etag ||
        Number(upstream.headers.get("content-length")) !== (range?.length ?? video.sizeBytes) ||
        upstream.headers.get("content-type")?.split(";")[0].trim() !== "video/mp4" ||
        range && upstream.headers.get("content-range") !== range.contentRange || !await resolved.stillAllowed()) throw new Error("DETAIL_VIDEO_UNAVAILABLE");
    } catch (error) { await upstream.body?.cancel(); throw error; }
    return new Response(upstream.body, { status: range ? 206 : 200, headers: { ...headers, "Content-Type": "video/mp4", "Accept-Ranges": "bytes", ETag: etag,
      "Content-Length": String(range?.length ?? video.sizeBytes), ...(range ? { "Content-Range": range.contentRange } : {}) } });
  } catch (error) { unstable_rethrow(error); return new Response("Video unavailable", { status: 404, headers }); }
}
