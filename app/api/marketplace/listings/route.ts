import { unstable_rethrow } from "next/navigation";
import { browseMarketplace } from "@/lib/marketplace/server";
import { browseSchema } from "@/lib/marketplace/contract";

const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = params.get("page") ?? "1";
  const parsed = browseSchema.safeParse({ query: params.get("q") ?? "", category: params.get("category") || null, page: /^\d{1,6}$/.test(page) ? Number(page) : 0 });
  if (!parsed.success) return Response.json({ error: "Invalid listing filters." }, { status: 400, headers });
  try { return Response.json(await browseMarketplace(parsed.data), { headers }); }
  catch (error) {
    unstable_rethrow(error);
    return Response.json({ error: "Listings are temporarily unavailable." }, { status: 503, headers });
  }
}
