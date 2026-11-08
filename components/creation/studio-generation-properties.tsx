import { tones, ugcTypes, type CreationSettings, type UgcType } from "@/lib/projects/options";
import type { StudioMode } from "@/lib/studio-mode/contract";
import { DurationGallery } from "./duration-gallery";
import { GenerationSettings } from "./generation-settings";
import { PropertyImageGallery } from "./property-image-gallery";
import { StudioInspectorSection } from "./studio-inspector-section";
import { VisualStyleGallery } from "./visual-style-gallery";
import type { ReactNode } from "react";

// Public cinematic samples are display-only. Only the existing option value is saved.
const toneOptions = tones.map(value => ({ value, label: value, image: `/images/pro-properties/tone-${value.toLowerCase()}.webp` }));
const typeOptions = ugcTypes.map(option => ({ ...option, image: `/images/pro-properties/type-${option.value}.webp` }));

export function StudioGenerationProperties({ studioMode, settings, onChange, ugcType, onUgcTypeChange, readOnly = false }: {
  studioMode: StudioMode;
  settings: CreationSettings;
  onChange: (settings: CreationSettings) => void;
  ugcType?: UgcType;
  onUgcTypeChange?: (value: UgcType) => void;
  readOnly?: boolean;
}) {
  const view = (children: ReactNode) => readOnly ? <fieldset disabled className="min-w-0">{children}</fieldset> : children;
  const changeSettings = (next: CreationSettings) => { if (!readOnly) onChange(next); };
  const changeType = (next: UgcType) => { if (!readOnly) onUgcTypeChange?.(next); };
  if (studioMode !== "pro") return <StudioInspectorSection key="basic-style" title="Style & pacing">
    {view(<GenerationSettings settings={settings} onChange={changeSettings} ugcType={ugcType} onUgcTypeChange={onUgcTypeChange ? changeType : undefined} />)}
  </StudioInspectorSection>;
  return <>
    <StudioInspectorSection key="duration" title="Duration">
      {view(<DurationGallery value={settings.duration} onChange={duration => changeSettings({ ...settings, duration })} />)}
    </StudioInspectorSection>
    <StudioInspectorSection key="visual-style" title="Visual Style">
      {view(<VisualStyleGallery value={settings.visualStyle} onChange={visualStyle => changeSettings({ ...settings, visualStyle })} />)}
    </StudioInspectorSection>
    <StudioInspectorSection key="tone" title="Tone">
      {view(<PropertyImageGallery label="Tone" value={settings.tone} options={toneOptions} onChange={tone => changeSettings({ ...settings, tone })} />)}
    </StudioInspectorSection>
    {ugcType && onUgcTypeChange && <StudioInspectorSection key="type" title="Type">
      {view(<PropertyImageGallery label="Type" value={ugcType} options={typeOptions} onChange={changeType} />)}
    </StudioInspectorSection>}
  </>;
}
