import type { CSSProperties } from "react";

// Colors are assigned once by migration 029 / the listing column default.
// An older database uses a neutral placeholder until that migration is applied.
export function templateAppearance(item: { fallbackColor?: string | null }): CSSProperties {
  return {
    "--template-color": item.fallbackColor ?? "var(--muted)",
  } as CSSProperties;
}
