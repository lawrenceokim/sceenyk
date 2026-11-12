import { unstable_rethrow } from "next/navigation";
import { readPurchasesGallery } from "@/lib/purchases/gallery-server";

const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || Number(request.headers.get("content-length") ?? 0) > 4096)
    return Response.json({ error: "Invalid purchases request." }, { status: 403, headers });
  try {
    const body = await request.text();
    if (body.length > 4096) return Response.json({ error: "Invalid purchases request." }, { status: 400, headers });
    return Response.json(await readPurchasesGallery(JSON.parse(body)), { headers });
  } catch (error) { unstable_rethrow(error); return Response.json({ error: "Purchases are temporarily unavailable." }, { status: 503, headers }); }
}
