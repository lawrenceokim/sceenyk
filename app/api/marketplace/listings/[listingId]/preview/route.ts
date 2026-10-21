import { z } from "zod";
import { connection } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { unstable_rethrow } from "next/navigation";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { readR2AnalysisMedia } from "@/lib/storage/r2";

export async function GET(_request: Request, { params }: { params: Promise<{ listingId: string }> }) {
  await connection();
  const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const id = z.uuid().parse((await params).listingId);
    const database = createDatabaseClient();
    // A public request may only read a reviewed, published derivative.
    let result = await database.rpc("marketplace_template_preview", { p_listing_id: id, p_owner_user_id: null });
    if (!result.data && (await auth()).userId) {
      const user = await ensureAppUser();
      result = await database.rpc("marketplace_template_preview", { p_listing_id: id, p_owner_user_id: user.id });
    }
    if (result.error || !result.data) return new Response(null, { status: 404, headers });
    const preview = z.object({ key: z.string().regex(new RegExp(`^marketplace-previews/${id}/[a-f0-9-]{36}\\.webp$`)), etag: z.string().min(1), size: z.number().int().min(1).max(524288) }).parse(result.data);
    const stream = await readR2AnalysisMedia(preview.key, preview.etag, preview.size, AbortSignal.timeout(15000));
    return new Response(stream, { headers: { ...headers, "Content-Type": "image/webp", "Content-Length": String(preview.size) } });
  } catch (error) { unstable_rethrow(error); return new Response(null, { status: 404, headers }); }
}
