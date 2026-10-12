import { getOwnedComposition } from "@/lib/composition/server";
import { unstable_rethrow } from "next/navigation";
export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const plan = await getOwnedComposition({ projectId: url.searchParams.get("projectId"), jobId: url.searchParams.get("jobId") });
    return Response.json(plan ? { plan } : { code: "NOT_FOUND" }, { status: plan ? 200 : 404, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) {
    unstable_rethrow(error);
    return Response.json({ code: "UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  }
}
