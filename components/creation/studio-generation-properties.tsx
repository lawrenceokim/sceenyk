import { tones, ugcTypes, type CreationSettings, type UgcType } from "@/lib/projects/options";
import type { StudioMode } from "@/lib/studio-mode/contract";
import { DurationGallery } from "./duration-gallery";
import { GenerationSettings } from "./generation-settings";
import { PropertyImageGallery } from "./property-image-gallery";
import { StudioInspectorSection } from "./studio-inspector-section";
import { VisualStyleGallery } from "./visual-style-gallery";

// Public cinematic samples are display-only. Only the existing option value is saved.
const toneOptions = tones.map(value => ({ value, label: value, image: `/images/pro-properties/tone-${value.toLowerCase()}.webp` }));
const typeOptions = ugcTypes.map(option => ({ ...option, image: `/images/pro-properties/type-${option.value}.webp` }));

export function StudioGenerationProperties({ studioMode, settings, onChange, ugcType, onUgcTypeChange }: {
  studioMode: StudioMode;
  settings: CreationSettings;
  onChange: (settings: CreationSettings) => void;
  ugcType?: UgcType;
  onUgcTypeChange?: (value: UgcType) => void;
}) {
  if (studioMode !== "pro") return <StudioInspectorSection key="basic-style" title="Style & pacing">
    <GenerationSettings settings={settings} onChange={onChange} ugcType={ugcType} onUgcTypeChange={onUgcTypeChange} />
  </StudioInspectorSection>;
  return <>
    <StudioInspectorSection key="duration" title="Duration">
      <DurationGallery value={settings.duration} onChange={duration => onChange({ ...settings, duration })} />
    </StudioInspectorSection>
    <StudioInspectorSection key="visual-style" title="Visual Style">
      <VisualStyleGallery value={settings.visualStyle} onChange={visualStyle => onChange({ ...settings, visualStyle })} />
    </StudioInspectorSection>
    <StudioInspectorSection key="tone" title="Tone">
      <PropertyImageGallery label="Tone" value={settings.tone} options={toneOptions} onChange={tone => onChange({ ...settings, tone })} />
    </StudioInspectorSection>
    {ugcType && onUgcTypeChange && <StudioInspectorSection key="type" title="Type">
      <PropertyImageGallery label="Type" value={ugcType} options={typeOptions} onChange={onUgcTypeChange} />
    </StudioInspectorSection>}
  </>;
}
