import "server-only";
import sharp from "sharp";
import { CharacterV5Error, v5IsFinalFront, type V5Candidate, type V5FrontReviewDiagnostic } from "./contract";

export function frontReviewDiagnostic(candidate: V5Candidate): V5FrontReviewDiagnostic | undefined {
  if (process.env.NODE_ENV === "production" || !["front_source", "front"].includes(candidate.slot)) return;
  const dimensions = candidate.artifact ?? candidate.output_proof;
  const generation = candidate.generation;
  return { candidateId: candidate.id, providerRequestId: candidate.request_id, objectKey: candidate.artifact?.storageKey ?? null,
    hash: candidate.artifact?.sha256 ?? null, inputSource: candidate.input_asset, generation,
    candidateDimensions: dimensions ? { width: dimensions.width, height: dimensions.height } : null,
    framingContract: generation && "frontFraming" in generation ? generation.frontFraming ?? null : null };
}

// Historical previews use their saved boundary without an adjustment control.
// Cover the top with neutral gray, preserving the canvas and body pixels below.
export async function maskV5Front(bytes: Buffer, maskTop: number) {
  try {
    if (!Number.isInteger(maskTop) || maskTop < 500 || maskTop > 6000) throw new Error();
    const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
    const { width, height } = await image.metadata();
    if (!width || !height) throw new Error();
    const boundary = Math.ceil(height * maskTop / 10_000);
    const overlay = await sharp({ create: { width, height: boundary, channels: 3, background: "#b8b8b8" } }).png().toBuffer();
    const masked = await image.composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();
    if (masked.length > 20 * 1024 * 1024) throw new Error();
    return masked;
  } catch { throw new CharacterV5Error("local_crop", "CHARACTER_FRONT_MASK_INVALID"); }
}

export function logV5Front(event: "intent" | "submitted" | "saved" | "preview" | "concealed", candidate: V5Candidate, concealmentApplied: boolean, maskTop?: number) {
  if (process.env.NODE_ENV === "production" || !["front_source", "front"].includes(candidate.slot)) return;
  const generation = candidate.generation;
  console.info("UGC_CHARACTER_V5_FRONT", JSON.stringify({ event, slot: candidate.slot, candidateId: candidate.id,
    providerRequestId: candidate.request_id, referenceAssetId: candidate.input_asset?.id ?? null,
    referenceKey: candidate.input_asset?.storageKey ?? null,
    faceAssetUsed: candidate.slot === "front" ? null : candidate.input_asset?.kind === "accepted_face",
    backAssetUsed: candidate.slot === "front" ? null : candidate.input_asset?.kind === "accepted_back",
    prompt: generation && "prompt" in generation ? generation.prompt : null,
    promptRevision: generation && "promptRevision" in generation ? generation.promptRevision ?? null : null,
    aspectRatio: generation && "aspectRatio" in generation ? generation.aspectRatio : null,
    enhancement: generation && "enhancePrompt" in generation ? generation.enhancePrompt : null,
    batchSize: generation && "batchSize" in generation ? generation.batchSize : null,
    providerPreparedFinal: v5IsFinalFront(generation),
    candidateDimensions: frontReviewDiagnostic(candidate)?.candidateDimensions ?? null,
    framingContract: frontReviewDiagnostic(candidate)?.framingContract ?? null,
    visualFramingVerified: false, framingReview: "manual_accept_reject",
    savedObjectKey: candidate.artifact?.storageKey ?? null, savedHash: candidate.artifact?.sha256 ?? null,
    concealmentApplied, ...(maskTop === undefined ? {} : { maskTop }), fallbackUsed: false }));
}
