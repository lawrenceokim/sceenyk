import {
  Film,
  Gamepad2,
  Lightbulb,
  Package,
  Clapperboard,
  WandSparkles,
} from "lucide-react";
import type { CategoryId } from "@/lib/projects/options";
export {
  aspectRatios,
  durations,
  visualStyles,
  tones,
  type CategoryId,
  type CreationSettings,
} from "@/lib/projects/options";

export const creationCategories = [
  {
    id: "transformation",
    title: "Video Transformation",
    description: "Give your footage a new world or style.",
    icon: WandSparkles,
    example:
      "Turn this clip into a funny animated story with dramatic narration.",
  },
  {
    id: "product-ad",
    title: "Product Ad",
    description: "Put your product in the spotlight.",
    icon: Package,
    example:
      "Create a bold product reveal with soft studio light and a confident voiceover.",
  },
  {
    id: "cinematic",
    title: "Cinematic",
    description: "Imagine an extraordinary scene.",
    icon: Film,
    example:
      "An explorer crosses a violet desert beneath a glowing planet. Slow, cinematic camera movement.",
  },
  {
    id: "storytelling",
    title: "Storytelling",
    description: "Bring a story to life, scene by scene.",
    icon: Lightbulb,
    example:
      "Tell the story of a tiny robot finding its way home, with warm narration.",
  },
  {
    id: "gaming",
    title: "Gaming",
    description: "Build a world beyond the ordinary.",
    icon: Gamepad2,
    example:
      "A neon-lit city comes alive as a game character enters a new world. Make it energetic.",
  },
  {
    id: "social",
    title: "Social Content",
    description: "Create a moment worth sharing.",
    icon: Clapperboard,
    example:
      "A playful short about a coffee-fueled morning, with quick cuts and witty captions.",
  },
] as const satisfies readonly {
  id: CategoryId;
  title: string;
  description: string;
  icon: typeof Film;
  example: string;
}[];

export type CreationCategory = (typeof creationCategories)[number];

export interface LocalMedia {
  id: string;
  file: File;
  kind: "image" | "video" | "audio";
}

// Advisory local preview detection; permanent upload uses lib/media/validation.
export function getMediaKind(file: File): LocalMedia["kind"] | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type && file.type !== "application/octet-stream") return null;
  if (/\.(png|jpe?g|webp|gif|avif|svg|heic|heif|bmp)$/i.test(file.name))
    return "image";
  if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)) return "video";
  if (/\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(file.name)) return "audio";
  return null;
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}
