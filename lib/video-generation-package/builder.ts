import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { validateStoryboard, storyboardBinding, type StoryboardInput } from "@/lib/storyboard/contract";
import { packageInputSchema, videoGenerationPackageSchema, type PackageInput, type VideoGenerationPackage } from "./contract";

export class PackageValidationError extends Error {
  constructor(readonly code: "PACKAGE_INPUT_CHANGED" | "PACKAGE_INVALID" | "PACKAGE_ASSET_UNAVAILABLE" = "PACKAGE_INVALID") { super(code); }
}
// Recipe v1: sorted object keys, preserved array order, JSON numbers/strings,
// explicit null, UTF-8, no whitespace. Undefined/non-JSON values are rejected.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))).map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  throw new PackageValidationError();
}
export const packageDigest = (domain: string, value: unknown) => createHash("sha256").update(`${domain}:v1\n${canonicalJson(value)}`, "utf8").digest("hex");
export function validatePackageInput(value: unknown): PackageInput {
  const parsed = packageInputSchema.safeParse(value);
  if (!parsed.success) throw new PackageValidationError();
  const input = parsed.data;
  const { character, product, location } = input.source;
  const deps = input.source.dependencies;
  if (deps.character !== input.approvals.character.version || deps.product !== input.approvals.product.version ||
    deps.locationId !== input.approvals.location.id || deps.locationVersion !== input.approvals.location.version ||
    deps.locationCandidateId !== input.approvals.location.candidateId) throw new PackageValidationError("PACKAGE_INPUT_CHANGED");
  if (new Set([character.id, product.id, location.id]).size !== 3) throw new PackageValidationError();
  for (const ref of [character, product, location]) {
    if (!ref.storageKey.startsWith(`ugc/${input.ownerId}/${input.projectId}/${input.jobId}/`) || ref.storageKey.includes("..") || ref.storageKey.includes("?")) throw new PackageValidationError();
  }
  try { validateStoryboard(input.storyboard.document, storyboardBinding(input.source as StoryboardInput)); }
  catch { throw new PackageValidationError(); }
  return input;
}
export const packageInputFingerprint = (value: unknown) => { const input = validatePackageInput(value);
  return packageDigest("sceenyk-package-input", { compilerVersion: input.storyboard.document.schemaVersion, input }); };

function content(input: PackageInput, packageVersion: number) {
  const storyboard = input.storyboard.document;
  const { scene, character, product, location } = input.source;
  const reference = (role: "character" | "product" | "location", name: string) => {
    const image = input.source[role]; const approval = input.approvals[role];
    return { id: image.id, approvalId: approval.id, approvalVersion: approval.version, approvedAt: approval.approvedAt,
      name, sha256: image.sha256, mimeType: image.mimeType, sizeBytes: image.sizeBytes, width: image.width, height: image.height };
  };
  // The approved source prompt is retained by documentHash. The package prompt
  // is a deterministic serialization of approved instructions using logical
  // bindings, so adapters never need to reinterpret the Storyboard creatively.
  const scenes = storyboard.scenes.map(source => {
    const { characterAssetId, productAssetId, locationAssetId, generationPrompt: sourcePrompt, speech, ...details } = source;
    if (characterAssetId !== character.id || productAssetId !== product.id || locationAssetId !== location.id || !sourcePrompt) throw new PackageValidationError();
    const instructions = { ...details, speech: speech.map(({ characterAssetId: speaker, ...line }) => {
      if (speaker !== character.id) throw new PackageValidationError();
      return { ...line, characterBinding: "character" as const };
    }), id: `scene-${source.number}`, durationMs: source.endMs - source.startMs,
      bindings: { character: "character" as const, product: "product" as const, location: "location" as const }, voice: storyboard.voice };
    // Voice's private image UUID is replaced with a logical role in prose.
    const promptInstructions = { ...instructions, voice: { characterBinding: "character", description: storyboard.voice.description, pace: storyboard.voice.pace } };
    return { ...instructions, generationPrompt: `Generate only this approved UGC scene, at its exact absolute millisecond interval. ` +
      `Use the approved character, product and location bindings; preserve identity, outfit, product appearance and environment. ` +
      `No additional people/products or unsupported claims. Character: ${JSON.stringify(scene.character.name)}. Product: ${JSON.stringify(scene.product.name)}. ` +
      `Settings: ${canonicalJson({ visualStyle: scene.settings.visualStyle, tone: scene.settings.tone, videoType: scene.ugcType, aspectRatio: scene.settings.aspectRatio })}. ` +
      `Continuity: ${canonicalJson(storyboard.continuity)}. Exact instructions: ${canonicalJson(promptInstructions)}. ` +
      "Preserve all speech text, delivery and timing. Silent intervals require no speech. Do not retime, crop or invent instructions." };
  });
  return { schemaVersion: storyboard.schemaVersion, compilerVersion: storyboard.schemaVersion, promptVersion: storyboard.schemaVersion, fingerprintVersion: 1 as const,
    ...(storyboard.schemaVersion === 2 ? { executionVersion: "ugc-execution-v1" as const } : {}),
    packageVersion, inputFingerprint: packageInputFingerprint(input),
    project: { id: input.projectId, ownerId: input.ownerId, jobId: input.jobId, title: scene.projectTitle,
      creativeDirection: scene.sceneDescription, creationType: "ugc" as const, videoType: scene.ugcType,
      visualStyle: scene.settings.visualStyle, tone: scene.settings.tone, narration: scene.narration },
    approvedReferences: { character: reference("character", scene.character.name), product: reference("product", scene.product.name),
      location: { ...reference("location", String(input.source.locationPlan.name ?? "Approved location")),
        revision: input.approvals.location.revision, candidateId: input.approvals.location.candidateId } },
    storyboard: { id: input.storyboard.id, version: input.storyboard.version, revision: input.storyboard.revision,
      approvedAt: input.storyboard.approvedAt, schemaVersion: storyboard.schemaVersion, documentHash: packageDigest("sceenyk-storyboard", storyboard) },
    timeline: { totalDurationMs: storyboard.durationMs, unit: "milliseconds" as const },
    output: { kind: "video" as const, aspectRatio: storyboard.aspectRatio, durationMs: storyboard.durationMs, resolution: null, frameRate: null, format: null, seed: null },
    voice: storyboard.voice, continuity: storyboard.continuity,
    requirements: { referenceImages: true as const, referenceImageCount: 3 as const, characterReference: true as const, productReference: true as const,
      locationReference: true as const, dialogue: scenes.some(s => s.speech.some(line => line.speaker === "character" && line.text.length > 0)),
      narration: scenes.some(s => s.speech.some(line => line.speaker === "narration" && line.text.length > 0)),
      consistentVoice: scenes.some(s => s.speech.some(line => line.text.length > 0)), durationMs: storyboard.durationMs, sceneCount: scenes.length,
      sceneDurationsMs: scenes.map(s => s.durationMs), aspectRatio: storyboard.aspectRatio, resolution: null, outputKind: "video" as const, outputFormat: null,
      audioInstructions: scenes.map(s => ({ sceneNumber: s.number, ...s.audio })) }, scenes };
}
export function buildVideoGenerationPackage(value: unknown, packageVersion: number): VideoGenerationPackage {
  const payload = content(validatePackageInput(value), packageVersion);
  const { packageVersion: envelopeVersion, ...hashContent } = payload;
  if (!Number.isSafeInteger(envelopeVersion) || envelopeVersion < 1) throw new PackageValidationError();
  const parsed = videoGenerationPackageSchema.safeParse({ ...payload, packageHash: packageDigest("sceenyk-video-package", hashContent) });
  if (!parsed.success) throw new PackageValidationError();
  return parsed.data;
}
export function validateVideoGenerationPackage(value: unknown, input: unknown, packageVersion: number) {
  const parsed = videoGenerationPackageSchema.safeParse(value);
  if (!parsed.success || !isDeepStrictEqual(parsed.data, buildVideoGenerationPackage(input, packageVersion))) throw new PackageValidationError();
  return parsed.data;
}
