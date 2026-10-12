import { unstable_rethrow } from "next/navigation";
import { readOwnedNarration } from "@/lib/voice-ai/owned";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    return Response.json(await readOwnedNarration(Object.fromEntries(new URL(request.url).searchParams)), { headers });
  } catch (error) {
    unstable_rethrow(error);
    return Response.json({ code: "UNAVAILABLE" }, { status: 404, headers });
  }
}
