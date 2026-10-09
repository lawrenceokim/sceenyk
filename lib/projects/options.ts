// Creative-brief choices, not provider capabilities or generation eligibility.
export const categoryIds = [
  "transformation",
  "product-ad",
  "cinematic",
  "storytelling",
  "gaming",
  "social",
] as const;
export type CategoryId = (typeof categoryIds)[number];

export const aspectRatios = [
  { value: "9:16", label: "9:16 · Portrait" },
  { value: "16:9", label: "16:9 · Landscape" },
  { value: "1:1", label: "1:1 · Square" },
] as const;
export const durations = [
  { value: "10", label: "10 seconds" },
  { value: "15", label: "15 seconds" },
  { value: "30", label: "30 seconds" },
] as const;
export const visualStyles = [
  "Original",
  "Cartoon",
  "Cinematic",
  "Anime",
  "Realistic",
] as const;
export const tones = [
  "Funny",
  "Dramatic",
  "Professional",
  "Energetic",
  "Storytelling",
] as const;

export interface CreationSettings {
  aspectRatio: (typeof aspectRatios)[number]["value"];
  duration: (typeof durations)[number]["value"];
  visualStyle: (typeof visualStyles)[number];
  tone: (typeof tones)[number];
}
export const projectTitleLimit = 120;
export const projectPromptLimit = 10_000;
export const projectPageSize = 8;
