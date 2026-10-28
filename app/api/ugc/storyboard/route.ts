import { unstable_rethrow } from "next/navigation";
import { storyboardAction, StoryboardRecoveryUnavailableError, StoryboardExecutionSetupError } from "@/lib/storyboard/server";
import { ReferenceReviewAccessError } from "@/lib/reference-review/server";
import { StoryboardValidationError } from "@/lib/storyboard/validation-diagnostics";
import { StoryboardManualRecoveryError } from "@/lib/storyboard/manual-recovery";

const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", Vary: "Cookie",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new ReferenceReviewAccessError(403);
    const reader = request.body?.getReader(); if (!reader) throw new ReferenceReviewAccessError(400);
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break;
      size += part.value.length; if (size > 250_000) throw new ReferenceReviewAccessError(413); chunks.push(part.value); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ReferenceReviewAccessError(400); }
    return Response.json({ ok: true, storyboard: await storyboardAction(input) }, { headers });
  } catch (error) {
    unstable_rethrow(error);
    const status = error instanceof StoryboardManualRecoveryError ? error.code === "STORYBOARD_DIALOGUE_ONLY" ? 422 : 409 :
      error instanceof StoryboardValidationError ? 422 : error instanceof ReferenceReviewAccessError ? error.status : 503;
    return Response.json({ ok: false, ...(error instanceof StoryboardValidationError ? { validation: error.report } : {}),
      message: error instanceof StoryboardExecutionSetupError ? "Local V1 execution repair requires manual migration 070 after 069. The existing approval/package is unchanged; no provider request was made." : error instanceof StoryboardManualRecoveryError ? error.code === "STORYBOARD_MANUAL_RECOVERY_SETUP" ? "Manual dialogue recovery requires migration 067. Keep the saved response; no job was queued or provider called." :
        error.code === "STORYBOARD_DIALOGUE_ONLY" ? "Manual recovery can change only spoken words. Keep timestamps, voice, actions, camera and approved assets unchanged." : "This saved response is not eligible for dialogue-only recovery. Check status; original responses are preserved." :
      error instanceof StoryboardRecoveryUnavailableError ? "No saved response currently passes local validation. No retry was queued and no provider request was made. Check the field-level errors; keep the existing record for investigation." : status === 422 ? "Check scene timestamps, speech length, required details and approved asset references before saving." :
      status === 409 ? "Storyboard or project inputs changed. Check status before continuing." : "Storyboard is unavailable. Check server setup and status." }, { status, headers });
  }
}
