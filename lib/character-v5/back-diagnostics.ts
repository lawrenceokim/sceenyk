import "server-only";
import type { V5BackReviewDiagnostic, V5Candidate, v5ProviderPayload } from "./contract";

export function backReviewDiagnostic(candidate: V5Candidate): V5BackReviewDiagnostic | undefined {
  if (process.env.NODE_ENV === "production" || candidate.slot !== "back") return;
  return { candidateId: candidate.id, providerRequestId: candidate.request_id, objectKey: candidate.artifact?.storageKey ?? null,
    hash: candidate.artifact?.sha256 ?? null, inputSource: candidate.input_asset, generation: candidate.generation };
}

export function logV5BackPayload(model: string, candidateId: string, payload: ReturnType<typeof v5ProviderPayload>, source?: V5Candidate["input_asset"]) {
  if (process.env.NODE_ENV === "production") return;
  const image = new URL(payload.image_url);
  // R2 query parameters are access credentials. Keep the exact resolved object
  // path and source fingerprint inspectable without logging the signing token.
  console.info("UGC_CHARACTER_V5_BACK_PAYLOAD", JSON.stringify({ model, candidateId, ...payload,
    image_url: `${image.origin}${image.pathname}${image.search ? "?[signature redacted]" : ""}`,
    resolvedSource: source ?? null, custom_reference_id: "custom_reference_id" in payload ? payload.custom_reference_id : null,
    custom_reference_strength: "custom_reference_strength" in payload ? payload.custom_reference_strength : null,
    payloadFieldNames: Object.keys(payload),
    imageUrlSignatureRedacted: !!image.search }));
}

// Temporary local diagnostics. Never log presigned inputs, provider output URLs,
// status URLs, credentials, image bytes or raw provider/database responses.
export function logV5Back(event: "intent" | "submitted" | "saved" | "preview", candidate: V5Candidate,
  preview?: { source: "back_candidate" | "none"; served: boolean }) {
  if (process.env.NODE_ENV === "production" || candidate.slot !== "back") return;
  const generation = candidate.generation;
  console.info("UGC_CHARACTER_V5_BACK", JSON.stringify({ event, slot: "back", candidateId: candidate.id,
    providerRequestId: candidate.request_id, inputSourceId: candidate.input_asset?.id ?? null,
    inputSourceKey: candidate.input_asset?.storageKey ?? null,
    selectedSourceType: candidate.input_asset?.kind === "original" ? "original_upload" : candidate.input_asset?.kind ?? null,
    prompt: generation && "prompt" in generation ? generation.prompt : null,
    savedCandidateKey: candidate.artifact?.storageKey ?? null, savedCandidateHash: candidate.artifact?.sha256 ?? null,
    ...(preview ? { previewSource: preview.source, previewSourceKey: preview.served ? candidate.artifact?.storageKey ?? null : null,
      previewServed: preview.served, fallbackUsed: false } : {}) }));
}
