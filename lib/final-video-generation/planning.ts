import { packageDigest } from "@/lib/video-generation-package/builder";
import type { VideoGenerationPackage } from "@/lib/video-generation-package/contract";
import type { CharacterVoiceProfile, FinalConfiguration, Scene } from "./contract";
import { checkComposition, compositionRequirements } from "./composition";

export const speech = (scene: Scene) => scene.speech.filter(line => line.text.trim().length > 0);
export const characterSpeech = (scene: Scene) => speech(scene).filter(line => line.speaker === "character");
export function characterProfile(doc: VideoGenerationPackage, config: FinalConfiguration): CharacterVoiceProfile | null {
  if (!doc.scenes.some(scene => speech(scene).length)) return null;
  const content = { characterBinding: doc.approvedReferences.character.id,
    characterVersion: doc.approvedReferences.character.approvalVersion, description: doc.voice.description,
    language: config.language, accent: null, tone: doc.project.tone, pace: doc.voice.pace, energy: null,
    deliveryStyle: [...new Set(doc.scenes.flatMap(scene => speech(scene).map(line => typeof line.delivery === "string" ? line.delivery : line.delivery.style)))],
    source: "designed" as const };
  return { ...content, packageHash: doc.packageHash, schemaVersion: 1,
    id: packageDigest("sceenyk-voice-profile", { ...content, owner: doc.project.ownerId, project: doc.project.id, adapter: config.providers.voice }), version: 1 };
}
export function dimensions(ratio: string) {
  return ratio === "16:9" ? { width: 1280, height: 720 } : ratio === "9:16" ? { width: 720, height: 1280 } : { width: 720, height: 720 };
}
export function compositionIssues(doc: VideoGenerationPackage): string[] {
  return checkComposition(compositionRequirements(doc)).issues.map(issue => `${issue.code}:${issue.message}`);
}
