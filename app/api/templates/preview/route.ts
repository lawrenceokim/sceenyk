import { unstable_rethrow } from "next/navigation";
import { readTemplateMedia } from "@/lib/templates/media-server";

const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || Number(request.headers.get("content-length") ?? 0) > 512)
    return Response.json({ state: "unavailable" }, { status: 403, headers });
  try {
    const body = await request.text();
    if (body.length > 512) return Response.json({ state: "unavailable" }, { status: 400, headers });
    const media = await readTemplateMedia(JSON.parse(body));
    if (media.state === "ready" && media.bytes) return new Response(new Uint8Array(media.bytes), { headers: {
      ...headers, "Content-Type": media.mimeType!, "X-Project-Media-Version": media.version, "X-Project-Media-Expires": media.expiresAt,
    } });
    return Response.json(media, { headers });
  } catch (error) { unstable_rethrow(error); return Response.json({ state: "unavailable" }, { status: 404, headers }); }
}
