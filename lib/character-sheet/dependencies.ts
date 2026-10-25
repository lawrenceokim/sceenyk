import type { CharacterAsset, CharacterView } from "./contract";
import { characterGenerationRevision, type CharacterInputReference, type CharacterUpstream } from "./generation-contract";
import { hasCharacterValidation } from "./validation-contract";
import { characterOutputError } from "./diagnostics";

type Asset = Pick<CharacterAsset, "id" | "sha256" | "storageKey" | "etag" | "generation" | "characterValidation" | "sourceValidation" | "frontCrop" | "strategyRevision" | "faceOrigin">;
export function characterUpstream(view: CharacterView, assets: Partial<Record<CharacterView, Asset>>): CharacterUpstream {
  if (view === "face") return {};
  const face = assets.face;
  if (!hasCharacterValidation(face, "face") || !face?.characterValidation?.observations?.neutralBackground) throw characterOutputError("CHARACTER_FACE_DEPENDENCY_INVALID", "output_validation", { view });
  const upstream: CharacterUpstream = { face: { assetId: face.id, sha256: face.sha256 } };
  if (view === "front") {
    const back = assets.back;
    if (!hasCharacterValidation(back, "back")) throw characterOutputError("CHARACTER_BACK_DEPENDENCY_INVALID", "output_validation", { view });
    // V4 Back must refer to the same Face selected for this operation.
    if (back?.generation?.contractVersion === 4 && back.generation.upstream.face?.sha256 !== face.sha256) throw characterOutputError("CHARACTER_BACK_DEPENDENCY_INVALID", "output_validation", { view });
    upstream.back = { assetId: back!.id, sha256: back!.sha256 };
  }
  return upstream;
}
export function backCharacterReference(back: Asset): CharacterInputReference {
  if (!hasCharacterValidation(back, "back")) throw characterOutputError("CHARACTER_BACK_DEPENDENCY_INVALID", "output_validation", { view: "front" });
  return { kind: "back_reference", assetId: back.id, sha256: back.sha256, storageKey: back.storageKey, etag: back.etag };
}
export function characterDependencyViews(view: CharacterView) {
  return view === "face" ? ["face", "back", "front"] as const : view === "back" ? ["back", "front"] as const : ["front"] as const;
}
export function characterV4InputsValid(assets: Partial<Record<CharacterView, Asset>>) {
  if (!(["face", "back", "front"] as const).every(view => hasCharacterValidation(assets[view], view))) return false;
  const face = assets.face!, back = assets.back!, front = assets.front!;
  if (!face.characterValidation?.observations?.neutralBackground) return false;
  for (const [view, asset] of [["back", back], ["front", front]] as const) {
    if (view === "back" && asset.generation?.contractVersion !== 4) continue; // Preserve a valid historical Back on an explicit Front-only request.
    if (asset.generation?.contractVersion !== 4 || asset.generation.upstream.face?.sha256 !== face.sha256 ||
      asset.generation.upstream.face.assetId !== face.id || asset.generation.slot !== view) return false;
  }
  return front.generation?.contractVersion === 4 && front.generation.upstream.back?.sha256 === back.sha256 &&
    front.generation.upstream.back.assetId === back.id && front.generation.reference.kind === "back_reference" &&
    front.generation.reference.sha256 === back.sha256 && front.strategyRevision === characterGenerationRevision;
}
