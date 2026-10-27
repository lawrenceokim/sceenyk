import "server-only";
import { readReviewAsset } from "@/lib/reference-review/media";
import { validatePackageInput, PackageValidationError } from "./builder";

export async function verifyPackageMedia(value: unknown, signal: AbortSignal) {
  const input = validatePackageInput(value);
  // Sequential bounded private conditional reads use the existing ETag/size/
  // SHA256 verifier. No signing, paid provider, media write or derivative.
  for (const role of ["character", "product", "location"] as const) {
    signal.throwIfAborted();
    try { await readReviewAsset(input.source[role], signal); }
    catch { signal.throwIfAborted(); throw new PackageValidationError("PACKAGE_ASSET_UNAVAILABLE"); }
  }
  return input;
}
