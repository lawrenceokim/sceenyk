import "server-only";
import { HiggsfieldSoul2CharacterSheetProvider } from "@/lib/character-sheet/higgsfield";
import { CharacterSheetError } from "@/lib/character-sheet/provider";
import { CharacterV5Error, type V5Candidate } from "./contract";
import { technicalPng, v5OutputProof } from "./storage";

// Retrieval-only adapter. Never submit/create an identity or an image request.
// URLs are validated by the existing provider adapter and never leave the server.
export async function retrieveV5CompletedBytes(candidate: V5Candidate, signal: AbortSignal) {
  if (!candidate.request_id || !candidate.status_url || !candidate.output_proof ||
    !["face", "back", "front_source"].includes(candidate.slot)) {
    throw new CharacterV5Error("provider_output_download", "CHARACTER_OUTPUT_UNRECOVERABLE");
  }
  try {
    const provider = new HiggsfieldSoul2CharacterSheetProvider();
    const result = await provider.viewStatus(candidate.request_id, candidate.status_url, signal,
      candidate.slot === "front_source" ? "front" : candidate.slot as "face" | "back");
    if (result.state === "failed") throw new CharacterV5Error("provider_status", "CHARACTER_OUTPUT_UNRECOVERABLE");
    if (result.state !== "completed") throw new CharacterV5Error("provider_status", "CHARACTER_EXISTING_OUTPUT_NOT_READY");
    if (!result.imageUrl) throw new CharacterV5Error("provider_output_download", "CHARACTER_OUTPUT_UNRECOVERABLE");
    const output = await provider.downloadImage(result.imageUrl, signal);
    const bytes = await technicalPng(output.bytes);
    const proof = await v5OutputProof(candidate.id, bytes);
    if (proof.sha256 !== candidate.output_proof.sha256 || proof.sizeBytes !== candidate.output_proof.sizeBytes ||
      proof.width !== candidate.output_proof.width || proof.height !== candidate.output_proof.height) {
      throw new CharacterV5Error("image_decode", "CHARACTER_OUTPUT_PROOF_MISMATCH");
    }
    return bytes;
  } catch (error) {
    if (error instanceof CharacterV5Error) throw error;
    if (error instanceof CharacterSheetError && [404, 410].includes(error.diagnostic?.httpStatus ?? 0)) {
      throw new CharacterV5Error("provider_output_download", "CHARACTER_OUTPUT_UNRECOVERABLE");
    }
    // Authorization, rate limits and transport failures do not prove expiry.
    throw new CharacterV5Error("provider_output_download", "CHARACTER_EXISTING_OUTPUT_UNAVAILABLE");
  }
}
