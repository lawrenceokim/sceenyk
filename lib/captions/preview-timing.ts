import type { CaptionTrack } from "./contract";
import type { CompositionPlan } from "@/lib/composition/contract";

type Scene = CompositionPlan["scenes"][number];

// Visual media may start at a trim offset, while cues always use composition time.
export function compositionTimeForScene(scene: Scene, mediaTimeMs: number) {
  if (!scene.visual) return scene.start_ms;
  return Math.max(scene.start_ms, Math.min(scene.end_ms,
    scene.start_ms + Math.round(mediaTimeMs) - scene.visual.input_start_ms));
}

export function activeCaptionCue(track: CaptionTrack, scene: Scene, mediaTimeMs: number) {
  const time = compositionTimeForScene(scene, mediaTimeMs);
  return track.cues.find(cue => cue.scene_id === scene.scene_execution_id &&
    cue.start_ms <= time && time < cue.end_ms) ?? null;
}
