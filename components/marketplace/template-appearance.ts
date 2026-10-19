import type { CSSProperties } from "react";

function artworkSeed(id: string) {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
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
