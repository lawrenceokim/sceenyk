import { unstable_rethrow } from "next/navigation";
import { readOwnedPreparedSegment } from "@/lib/media-preparation/owned";

// Read-only owned capability. Processing is exclusively the trusted workflow's
// authenticated external-worker call; browsers cannot request source timings.
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    const input = Object.fromEntries(new URL(request.url).searchParams);
    return Response.json(await readOwnedPreparedSegment(input), { headers });
  } catch (error) {
    unstable_rethrow(error);
    return Response.json({ code: "UNAVAILABLE" }, { status: 404, headers });
  }
}
