import { unstable_rethrow } from "next/navigation";
import { ownedV3Action, readOwnedV3 } from "@/lib/final-video-generation-v3/runtime-server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", Vary: "Cookie",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
function failure(error: unknown) {
  unstable_rethrow(error);
  const code = error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "V3_ACTION_UNAVAILABLE";
  return Response.json({ ok: false, code }, { status: 409, headers });
}
export async function GET(request: Request) {
  try { return Response.json({ ok: true, workspace: await readOwnedV3(new URL(request.url).searchParams.get("project") ?? "") }, { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ ok: false, code: "V3_ORIGIN_REQUIRED" }, { status: 403, headers });
    const reader = request.body?.getReader(); if (!reader) throw new Error("V3_INPUT_REQUIRED");
    const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
      if (size > 32 * 1024) throw new Error("V3_INPUT_TOO_LARGE"); chunks.push(part.value); } }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return Response.json({ ok: true, workspace: await ownedV3Action(input) }, { headers });
  } catch (error) { return failure(error); }
}
