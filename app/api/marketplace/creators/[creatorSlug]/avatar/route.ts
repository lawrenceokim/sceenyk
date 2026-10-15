import { readPublicCreatorAvatar } from "@/lib/marketplace/creators/avatar";

export async function GET(_request: Request, { params }: { params: Promise<{ creatorSlug: string }> }) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" };
  try {
    const asset = await readPublicCreatorAvatar((await params).creatorSlug);
    if (!asset) return new Response(null, { status: 404, headers });
    return new Response(asset.stream, { headers: { ...headers, "Content-Type": "image/webp", "Content-Length": String(asset.size) } });
  } catch { return new Response(null, { status: 503, headers }); }
}
