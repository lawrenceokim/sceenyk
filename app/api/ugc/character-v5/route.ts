import { unstable_rethrow } from "next/navigation";
import { characterV5Action, characterV5Preview } from "@/lib/character-v5/server";
import { CharacterV5Error } from "@/lib/character-v5/contract";
import { ReferenceReviewAccessError } from "@/lib/reference-review/server";
import { logV5Failure } from "@/lib/character-v5/database-diagnostics";

const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", Vary: "Cookie",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
function failure(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof CharacterV5Error) logV5Failure(error);
  const savingFailure = error instanceof CharacterV5Error && error.database?.operation === "persist_candidate";
  const startFailure = error instanceof CharacterV5Error && error.database?.operation === "start_workflow";
  return Response.json({ ok: false, message: error instanceof ReferenceReviewAccessError && error.status === 409 ?
    "The reference changed or is not ready. Check status and try again." : startFailure ?
      "Character review could not start. Check database setup and refresh status before retrying." : savingFailure ?
      "The image was generated, but Sceenyk could not finish saving it. Your generation is preserved where possible. Use Retry saving." :
      error instanceof CharacterV5Error && error.code === "CHARACTER_COMMITTED_OBJECT_NOT_FOUND" ?
        "The saved image is missing. It cannot be reviewed until storage is repaired." :
      error instanceof CharacterV5Error && error.code === "CHARACTER_OUTPUT_UNRECOVERABLE" ?
        "Generated image could not be recovered. Regeneration is required." :
      error instanceof CharacterV5Error && ["CHARACTER_EXISTING_OUTPUT_UNAVAILABLE", "CHARACTER_EXISTING_OUTPUT_NOT_READY", "CHARACTER_R2_WRITE_FAILED", "CHARACTER_R2_VERIFY_FAILED"].includes(error.code) ?
        "Saving could not finish. The existing result can be checked again with Retry saving. No new generation was requested." :
      "Character review is unavailable. Check Progress and try again.",
    ...(error instanceof CharacterV5Error ? { code: error.code, phase: error.phase } : {}) },
  { status: error instanceof ReferenceReviewAccessError ? error.status : 503, headers });
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new ReferenceReviewAccessError(403);
    const reader = request.body?.getReader(); if (!reader) throw new ReferenceReviewAccessError(400);
    let size = 0; const chunks: Uint8Array[] = [];
    try { while (true) { const part = await reader.read(); if (part.done) break;
      size += part.value.length; if (size > 2048) throw new ReferenceReviewAccessError(400); chunks.push(part.value); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    let input: unknown; try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ReferenceReviewAccessError(400); }
    return Response.json({ ok: true, review: await characterV5Action(input) }, { headers });
  } catch (error) { return failure(error); }
}
export async function GET(request: Request) {
  try {
    const input = Object.fromEntries(new URL(request.url).searchParams);
    const bytes = await characterV5Preview(input);
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/png", "Content-Length": String(bytes.length) } });
  } catch (error) { return failure(error); }
}
