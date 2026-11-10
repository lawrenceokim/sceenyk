import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getAcquiredTemplatePreview } from "@/lib/marketplace/purchases/server";
import { readR2AnalysisMedia } from "@/lib/storage/r2";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const preview = await getAcquiredTemplatePreview((await params).id);
    if (!preview) return new Response(null, { status: 404, headers });
    const stream = await readR2AnalysisMedia(preview.key, preview.etag, preview.size, AbortSignal.timeout(15000));
    return new Response(stream, { headers: { ...headers, "Content-Type": "image/webp", "Content-Length": String(preview.size) } });
  } catch (error) {
    unstable_rethrow(error);
    return new Response(null, { status: 404, headers });
  }
}
