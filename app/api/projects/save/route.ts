import { saveProjectAction } from "@/app/actions/projects";

const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const invalid = (status: number) => Response.json({ ok: false, code: "INVALID_INPUT", message: "Your draft couldn’t be saved. Check your project details and try again." }, { status, headers });

// A stable URL keeps Studio saving independent of build-specific Action IDs.
// Reuse the exact action/service: verified identity, ownership, locks, validation,
// same-ID create recovery and successful-save revalidation remain authoritative.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return invalid(403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return invalid(415);
  let input: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return invalid(400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length; if (size > 256 * 1024) return invalid(413);
        chunks.push(part.value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return invalid(400); }
  return Response.json(await saveProjectAction(input), { headers });
}
