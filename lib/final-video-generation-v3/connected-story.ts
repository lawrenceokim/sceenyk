import { z } from "zod";
import { isProDuration } from "@/lib/projects/pro-duration";
import { plannedClipBoundarySchema, type DirectorStoryboard } from "./contract";

export const CONNECTED_STORY_DIRECTOR_VERSION = "connected-story-director-v1";
export const clipBoundariesSchema = z.array(plannedClipBoundarySchema).min(1).max(4);
export type ClipBoundary = z.infer<typeof plannedClipBoundarySchema>;

// Logical IDs are stable within the immutable Storyboard revision. Later attempts
// will additionally bind artifact ID/version/hash; display names are never keys.
export function planStoryClips(durationMs: number): ClipBoundary[] {
  if (!Number.isInteger(durationMs) || !isProDuration(String(durationMs / 1000))) throw new Error("V3_PRO_DURATION_INVALID");
  return Array.from({ length: Math.ceil(durationMs / 30_000) }, (_, index) => {
    const startMs = index * 30_000, endMs = Math.min(durationMs, startMs + 30_000);
    return { id: `clip-${index + 1}`, number: index + 1, startMs, endMs, durationMs: endMs - startMs };
  });
}

export function validateConnectedStory(storyboard: DirectorStoryboard, frozenBoundaries?: unknown) {
  if (storyboard.version !== "director-storyboard-connected-v1") {
    if (storyboard.durationMs > 30_000 || frozenBoundaries !== undefined) throw new Error("V3_CONNECTED_STORY_REQUIRED");
    return;
  }
  if (storyboard.durationMs <= 30_000) throw new Error("V3_CONNECTED_STORY_TIMING_INVALID");
  const expected = planStoryClips(storyboard.durationMs);
  if (frozenBoundaries !== undefined && JSON.stringify(clipBoundariesSchema.parse(frozenBoundaries)) !== JSON.stringify(expected))
    throw new Error("V3_CLIP_PLAN_CHANGED");
  if (storyboard.clips.length !== expected.length) throw new Error("V3_CLIP_PLAN_INVALID");
  for (const [index, clip] of storyboard.clips.entries()) {
    const boundary = expected[index];
    if (Object.keys(boundary).some(key => clip[key as keyof ClipBoundary] !== boundary[key as keyof ClipBoundary])) throw new Error("V3_CLIP_PLAN_INVALID");
    const shots = storyboard.scenes.filter(s => s.clipId === clip.id);
    if (!shots.length || shots[0].startMs !== clip.startMs || shots.at(-1)!.endMs !== clip.endMs) throw new Error("V3_CLIP_SHOT_TIMING_INVALID");
    let endMs = clip.startMs;
    for (const shot of shots) {
      if (shot.startMs !== endMs || shot.endMs <= shot.startMs || shot.endMs > clip.endMs ||
        shot.localStartMs !== shot.startMs - clip.startMs || shot.localEndMs !== shot.endMs - clip.startMs)
        throw new Error("V3_CLIP_SHOT_TIMING_INVALID");
      endMs = shot.endMs;
    }
    // A handoff describes the same state on both sides; no reset/re-introduction.
    if (index > 0 && clip.continuityIn !== storyboard.clips[index - 1].continuityOut) throw new Error("V3_CLIP_CONTINUITY_INVALID");
  }
  if (storyboard.scenes.some(s => !expected.some(c => c.id === s.clipId))) throw new Error("V3_CLIP_SHOT_BINDING_INVALID");
}

export const connectedStoryInstructions = `First plan ONE complete professional story with a beginning, development and ending covering the entire selected duration, then divide that story into the supplied ordered clip boundaries. These clips are planning units for future generation, not separate unrelated Storyboards. Do not restart an introduction, repeat actions or dialogue, or add another conclusion at a clip boundary. Choose the number and timing of individual shots freely WITHIN each clip; no shot, action or speech may straddle a clip boundary. Keep absolute project timing on shots/actions/speech and also return each shot's clipId, localStartMs and localEndMs relative to its clip start. Copy every supplied boundary exactly into clips (id, number, startMs, endMs, durationMs), then add a concise purpose and continuityIn/continuityOut/audioContinuity for each clip. In each handoff describe every character's identity, screen position, orientation, eyeline, grip and ongoing physical action; product placement/handling; location, lighting and camera position/direction; and ongoing dialogue, sound and background audio. A clip's continuityIn MUST exactly equal the previous clip's continuityOut. Design a natural continuation with no physical reset, teleport, repeated speech, track restart, accidental fade or forced pause at the boundary. Hold one consistent voice and coherent ambience/music across the full story, respecting silence and every saved preference. Describe purposeful audio changes only when motivated by the story. Keep all approved character identities distinct and use stable cast/speaker IDs when supplied. Return version director-storyboard-connected-v1. This is ONE response and ONE complete-story approval; no clip approval or video execution is requested.`;
