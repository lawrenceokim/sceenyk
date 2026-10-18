import type { CSSProperties } from "react";
import type { TemplateSnapshot } from "@/lib/marketplace/contract";

// Listings expose configuration, never private creator artwork. Keep the cover
// and detail wash in the same Sceenyk palette until public artwork is supported.
const purpleMix = { Original: 55, Cartoon: 75, Cinematic: 35, Anime: 85, Realistic: 15 } as const;

export function templateAppearance(template: TemplateSnapshot): CSSProperties {
  return {
    "--template-color": `color-mix(in srgb, var(--brand-purple) ${purpleMix[template.settings.visualStyle]}%, var(--brand-blue))`,
  } as CSSProperties;
}
