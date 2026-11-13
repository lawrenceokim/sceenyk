import { unstable_rethrow } from "next/navigation";
import { ownedV3Action, readOwnedV3 } from "@/lib/final-video-generation-v3/runtime-server";
import { ServiceOperationError } from "@/lib/diagnostics/service-failure";
import { DatabaseConfigurationError } from "@/lib/db/config";
import { readOwnedV3FinalStatus } from "@/lib/final-video-generation-v3/final-operation-server";
import { HiggsfieldTransportError } from "@/lib/final-video-generation-v3/adapters/higgsfield-transport";

const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", Vary: "Cookie",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
function failure(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof DatabaseConfigurationError) error = new ServiceOperationError(error, "database", "configuration", "V3_DATABASE");
  if (error instanceof ServiceOperationError) {
    console.error("V3_SERVICE_FAILURE", JSON.stringify({ code: error.code, ...error.diagnostic }));
    const status = error.diagnostic.category === "constraint" ? 409 : error.diagnostic.category === "unknown" ? 500 : 503;
    return Response.json({ ok: false, code: error.code, retryable: error.diagnostic.retryable }, { status, headers: {
      ...headers, ...(error.diagnostic.retryable ? { "Retry-After": "5" } : {}),
    } });
  }
  const code = error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "V3_ACTION_UNAVAILABLE";
  // Coded rejections and unexpected validation/runtime errors used to disappear
  // from Production logs. Never log message/stack/input or provider body here.
  console.error("V3_ACTION_FAILURE", JSON.stringify({ code,
    ...(error instanceof HiggsfieldTransportError ? { providerStatus: error.httpStatus, outcome: error.outcome, correlationId: error.correlationId } : {}),
    ...(code === "V3_ACTION_UNAVAILABLE" ? { errorType: error instanceof TypeError ? "TypeError" : error instanceof SyntaxError ? "SyntaxError" : "UnclassifiedError" } : {}),
  }));
  return Response.json({ ok: false, code }, { status: 409, headers });
}
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    if (query.get("scope") === "final") return Response.json({ ok: true, operation: await readOwnedV3FinalStatus(query) }, { headers });
    return Response.json({ ok: true, workspace: await readOwnedV3(query.get("project") ?? "") }, { headers });
  }
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
    const acknowledge = !!input && typeof input === "object" && "response" in input && input.response === "acknowledge";
    const result = acknowledge ? await ownedV3Action(input, true) : await ownedV3Action(input);
    return Response.json("accepted" in result ? { ok: true, receipt: result } : { ok: true, workspace: result }, { headers });
  } catch (error) { return failure(error); }
}
