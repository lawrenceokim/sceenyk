import type { ProjectDraft } from "@/lib/projects/types";
import type { CreativeLockSummary } from "./creative-lock-contract";

// Presentation of the verified saved brief. This grants no server authority.
export function lockedProjectDraft(lock?: CreativeLockSummary | null): ProjectDraft | null {
  const b = lock?.brief; if (!b) return null;
  return { title: b.title, prompt: b.prompt, category: b.category, creationType: b.creation_type, ugcType: b.ugc_type,
    settings: { aspectRatio: b.aspect_ratio, duration: b.duration, visualStyle: b.visual_style, tone: b.tone, resolution: b.video_resolution } } as ProjectDraft;
}
