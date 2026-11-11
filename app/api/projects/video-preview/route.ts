import { unstable_rethrow } from "next/navigation";
import { readOwnedProjectVideoPreview, readOwnedProjectVideoPreviewMedia } from "@/lib/projects/video-preview-server";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export async function POST(request: Request) {
  // Only the Projects client can ask this browser-session boundary to queue work.
  if (request.headers.get("origin") !== new URL(request.url).origin ||
    Number(request.headers.get("content-length") ?? 0) > 512) return Response.json({ state: "unavailable" }, { status: 403, headers });
  try {
    const body = await request.text();
    if (body.length > 512) return Response.json({ state: "unavailable" }, { status: 400, headers });
    const input = JSON.parse(body);
    if (request.headers.get("accept") === "application/octet-stream") {
      const media = await readOwnedProjectVideoPreviewMedia(input.projectId, typeof input.version === "string" ? input.version : undefined);
      if (media.state === "ready" && media.bytes) return new Response(new Uint8Array(media.bytes), { headers: {
        ...headers, "Content-Type": media.mimeType!, "X-Project-Media-Version": media.version, "X-Project-Media-Expires": media.expiresAt,
      } });
      return Response.json(media, { headers });
    }
    return Response.json(await readOwnedProjectVideoPreview(input.projectId), { headers });
  } catch (error) {
    unstable_rethrow(error);
    return Response.json({ state: "unavailable" }, { status: 404, headers });
  }
}
