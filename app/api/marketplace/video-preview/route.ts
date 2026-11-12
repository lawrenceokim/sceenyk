import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { readMarketplacePoster, readMarketplaceVideoPreview } from "@/lib/marketplace/video-preview-server";

const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const inputSchema = z.strictObject({ listingId: z.uuid(), kind: z.enum(["video", "poster"]).default("video"), version: z.string().regex(/^[a-f0-9]{64}$/).optional() });
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || Number(request.headers.get("content-length") ?? 0) > 512)
    return Response.json({ state: "unavailable" }, { status: 403, headers });
  try {
    const body = await request.text();
    if (body.length > 512) return Response.json({ state: "unavailable" }, { status: 400, headers });
    const input = inputSchema.parse(JSON.parse(body));
    const media = await (input.kind === "poster" ? readMarketplacePoster : readMarketplaceVideoPreview)(input.listingId, input.version);
    if (media.state === "ready" && media.bytes) return new Response(new Uint8Array(media.bytes), { headers: {
      ...headers, "Content-Type": media.mimeType!, "X-Project-Media-Version": media.version, "X-Project-Media-Expires": media.expiresAt,
    } });
    return Response.json(media, { headers });
  } catch (error) {
    unstable_rethrow(error);
    return Response.json({ state: "unavailable" }, { status: 404, headers });
  }
}
