import type { CSSProperties } from "react";

function artworkSeed(id: string) {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

// The existing 32 muted listing colors (migration 030). Projects have no saved
// color field: this is deterministic display metadata only, never a DB write.
const mutedPreviewPalette = [
  "#77618f", "#637ca0", "#8a6ba0", "#527f80", "#a06f83", "#9c825c", "#728b72", "#627c8a",
  "#796e9e", "#587b95", "#8d749d", "#6a8c82", "#a08191", "#9a8a73", "#858959", "#6d8b94",
  "#746b8a", "#7a83a0", "#8f819e", "#557e87", "#8d6f7b", "#9c7e64", "#7e966c", "#789194",
  "#7b719b", "#6b7eaa", "#92768e", "#608b86", "#9b746d", "#a08a7d", "#8b966f", "#6e8393",
] as const;

export function projectPreviewColor(projectId: string) {
  // Keep palette selection independent of the low bits used by templatePattern.
  return mutedPreviewPalette[(artworkSeed(projectId) >>> 2) % mutedPreviewPalette.length];
}

export function templatePattern(id: string) {
  return (["wash", "fold", "orbit", "ripple"] as const)[artworkSeed(id) % 4];
}

// Only geometry varies by ID. The base color always comes from the saved
// listing field; no random values or color assignments happen during rendering.
export function templateAppearance(item: { id?: string; fallbackColor?: string | null }): CSSProperties {
  const seed = artworkSeed(item.id ?? item.fallbackColor ?? "template");
  return {
    "--template-color": item.fallbackColor ?? "var(--muted)",
    "--preview-angle": `${115 + seed % 110}deg`,
    "--preview-x": `${24 + (seed >>> 5) % 48}%`,
    "--preview-y": `${20 + (seed >>> 12) % 56}%`,
  } as CSSProperties;
}
