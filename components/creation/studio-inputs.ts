import type { ProjectAsset, StudioMediaRole } from "@/lib/media/types";
import type { ProjectDraft } from "@/lib/projects/types";
import type { LocalMedia } from "./creation-options";
import { ugcV1GenerationInputsSchema } from "@/lib/projects/ugc-v1";
import { ugcDefaultNarration, ugcIssuesFromSchema } from "@/lib/ugc-jobs/input-contract";

export type StudioReference = {
  id: string;
  images: { local?: LocalMedia; asset?: ProjectAsset }[];
};

export function studioReferenceImages(references: StudioReference[]) {
  return references.flatMap(reference => reference.images.map(image => ({ ...image, referenceId: reference.id })));
}

export function collectStudioSources(files: LocalMedia[], assets: ProjectAsset[]) {
  const retained = assets.filter(asset => !asset.removedFromDraft);
  const references = (role: StudioMediaRole): StudioReference[] => {
    const groups = new Map<string, StudioReference>();
    for (const local of files.filter(file => file.studioRole === role)) {
      const id = local.referenceId ?? local.id;
      const group = groups.get(id) ?? { id, images: [] };
      group.images.push({ local });
      groups.set(id, group);
    }
    for (const asset of retained.filter(asset => asset.studioRole === role)) {
      const id = asset.referenceId ?? asset.id;
      const group = groups.get(id) ?? { id, images: [] };
      // A restored local retry owns its thumbnail until finalization succeeds.
      if (!group.images.some(image => image.local)) group.images.push({ asset });
      groups.set(id, group);
    }
    return [...groups.values()];
  };
  return {
    characters: references("character"),
    products: references("product"),
    projectMedia: {
      files: files.filter(file => (file.studioRole ?? "freestyle") === "freestyle"),
      assets: retained.filter(asset => (asset.studioRole ?? "freestyle") === "freestyle"),
    },
  };
}

// Preparation only. This does not submit to the legacy generation pipeline.
export function prepareStudioInputs(brief: ProjectDraft, sources: ReturnType<typeof collectStudioSources>) {
  const shared = {
    projectTitle: brief.title,
    sceneDescription: brief.prompt,
    ...brief.settings,
    narration: ugcDefaultNarration,
  };
  if (brief.creationType !== "ugc") return { ...shared, creationType: "freestyle" as const, projectMedia: sources.projectMedia };
  const readyReferences = (references: StudioReference[]) => studioReferenceImages(references).map(({ referenceId, asset, local }) => ({
    referenceId,
    assetId: !local && asset?.status === "uploaded" && asset.kind === "image" && !asset.removedFromDraft ? asset.id : undefined,
  }));
  const validation = ugcV1GenerationInputsSchema.safeParse({ ...brief, narration: shared.narration,
    characters: readyReferences(sources.characters), products: readyReferences(sources.products) });
  return { ...shared, creationType: "ugc" as const, ugcType: brief.ugcType, characters: sources.characters, products: sources.products,
    generationValidation: { ready: validation.success, issues: validation.success ? [] : ugcIssuesFromSchema(validation.error), errors: validation.success ? [] : [...new Set(validation.error.issues.map(issue => issue.message))] } };
}
