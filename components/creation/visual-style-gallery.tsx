import { visualStyles, type CreationSettings } from "./creation-options";
import { PropertyImageGallery } from "./property-image-gallery";

type VisualStyle = CreationSettings["visualStyle"];

// Presentation samples only. Generation continues to receive the saved style name.
const samples: Record<VisualStyle, string> = {
  Original: "/images/visual-styles/original.webp",
  Cartoon: "/images/visual-styles/cartoon.webp",
  Cinematic: "/images/visual-styles/cinematic.webp",
  Anime: "/images/visual-styles/anime.webp",
  Realistic: "/images/visual-styles/realistic.webp",
};
const options = visualStyles.map(value => ({ value, label: value, image: samples[value] }));

export function VisualStyleGallery({
  value = "Original",
  onChange,
}: {
  value?: VisualStyle;
  onChange: (value: VisualStyle) => void;
}) {
  return <PropertyImageGallery label="Visual style" value={value} options={options} onChange={onChange} />;
}
