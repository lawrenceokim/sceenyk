import { unstable_rethrow } from "next/navigation";
import { getOwnedCaptions } from "@/lib/captions/server";
import { exportCaptions } from "@/lib/captions/export";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request) {
  const url = new URL(request.url), format = url.searchParams.get("format");
  if (format && !["srt", "vtt"].includes(format)) return Response.json({ code: "INVALID_FORMAT" }, { status: 400, headers });
  try {
    const captions = await getOwnedCaptions({ projectId: url.searchParams.get("projectId"), jobId: url.searchParams.get("jobId") });
    if (!captions) return Response.json({ code: "NOT_FOUND" }, { status: 404, headers });
    if (!format) return Response.json(captions, { headers });
    if (!captions.track || captions.track.status !== "ready") return Response.json({ code: "NOT_READY" }, { status: 409, headers });
    return new Response(exportCaptions(captions.track, format as "srt" | "vtt"), { headers: {
      ...headers, "Content-Type": format === "vtt" ? "text/vtt; charset=utf-8" : "application/x-subrip; charset=utf-8",
      "Content-Disposition": `attachment; filename="captions.${format}"`, "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    unstable_rethrow(error);
    return Response.json({ code: "UNAVAILABLE" }, { status: 503, headers });
  }
}
