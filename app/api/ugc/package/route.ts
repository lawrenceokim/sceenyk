import { unstable_rethrow } from "next/navigation";
import { ReferenceReviewAccessError } from "@/lib/reference-review/server";
import { generationPackageAction, PackageSetupError } from "@/lib/video-generation-package/server";
import { PackageValidationError } from "@/lib/video-generation-package/builder";
import { packageErrorMessage } from "@/lib/video-generation-package/contract";
import { StoryboardValidationError } from "@/lib/storyboard/validation-diagnostics";
import { FinalPreflightError } from "@/lib/final-video-generation/capabilities";

const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", Vary: "Cookie",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new ReferenceReviewAccessError(403);
    const reader = request.body?.getReader(); if (!reader) throw new ReferenceReviewAccessError(400);
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break;
      size += part.value.length; if (size > 4096) throw new ReferenceReviewAccessError(413); chunks.push(part.value); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ReferenceReviewAccessError(400); }
    return Response.json({ ok: true, generationPackage: await generationPackageAction(input) }, { headers });
  } catch (error) {
    unstable_rethrow(error);
    const status = error instanceof StoryboardValidationError || error instanceof FinalPreflightError ? 422 : error instanceof PackageValidationError ? error.code === "PACKAGE_INVALID" ? 422 : 409 :
      error instanceof ReferenceReviewAccessError ? error.status : 503;
    return Response.json({ ok: false, ...(error instanceof StoryboardValidationError ? { validation: error.report } : {}), ...(error instanceof FinalPreflightError ? { issues: error.diagnostics } : {}),
      message: error instanceof StoryboardValidationError ? "Repair/review the Storyboard's canonical V1 execution settings and reapprove before preparing a new package." :
      error instanceof FinalPreflightError ? error.diagnostics[0]?.message : error instanceof PackageSetupError ? "Package preparation requires manual migration 070 after 068/069 and UGC_PACKAGE_ENABLED=1 in the app and local worker. No provider request was made." :
      error instanceof PackageValidationError ? packageErrorMessage(error.code) : status === 409 ? "Package or approved inputs changed. Check status before continuing." :
      status === 401 ? "Sign in to review this package." : "Package action unavailable. Check status and local setup; saved work is preserved." }, { status, headers });
  }
}
