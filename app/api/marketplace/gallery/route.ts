import { unstable_rethrow } from "next/navigation";
import { readMarketplaceGallery } from "@/lib/marketplace/gallery-server";

const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store", Vary: "Cookie" };
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || Number(request.headers.get("content-length") ?? 0) > 32768)
    return Response.json({ error: "Invalid listing request." }, { status: 403, headers });
  try {
    const body = await request.text();
    if (body.length > 32768) return Response.json({ error: "Invalid listing request." }, { status: 400, headers });
    return Response.json(await readMarketplaceGallery(JSON.parse(body)), { headers });
  } catch (error) {
    unstable_rethrow(error);
    return Response.json({ error: "Listings are temporarily unavailable." }, { status: 503, headers });
  }
}
