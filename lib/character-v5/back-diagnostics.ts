import "server-only";
import type { V5Candidate } from "./contract";

// Temporary local diagnostics. Never log presigned inputs, provider output URLs,
// status URLs, credentials, image bytes or raw provider/database responses.
export function logV5Back(event: "intent" | "submitted" | "saved" | "preview", candidate: V5Candidate,
  preview?: { source: "back_candidate" | "none"; served: boolean }) {
  if (process.env.NODE_ENV === "production" || candidate.slot !== "back") return;
  const generation = candidate.generation;
  console.info("UGC_CHARACTER_V5_BACK", JSON.stringify({ event, slot: "back", candidateId: candidate.id,
    providerRequestId: candidate.request_id, inputSourceId: candidate.input_asset?.id ?? null,
    inputSourceKey: candidate.input_asset?.storageKey ?? null,
    prompt: generation && "prompt" in generation ? generation.prompt : null,
    savedCandidateKey: candidate.artifact?.storageKey ?? null, savedCandidateHash: candidate.artifact?.sha256 ?? null,
    ...(preview ? { previewSource: preview.source, previewServed: preview.served, fallbackUsed: false } : {}) }));
}
