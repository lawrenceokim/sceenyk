import { unstable_rethrow } from "next/navigation";
import { readOwnedScenePreview } from "@/lib/composition/preview";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const media = await readOwnedScenePreview({
      projectId: url.searchParams.get("projectId"), jobId: url.searchParams.get("jobId"),
      sceneId: url.searchParams.get("sceneId"),
    });
    return Response.json(media ?? { code: "NOT_FOUND" }, { status: media ? 200 : 404, headers });
  } catch (error) {
    unstable_rethrow(error);
    return Response.json({ code: "UNAVAILABLE" }, { status: 404, headers });
  }
}
