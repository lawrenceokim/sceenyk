import { useId } from "react";
import { Select } from "@/components/ui/select";
import { legacyDuration, ugcTypes, type UgcType } from "@/lib/projects/options";
import {
  durations,
  visualStyles,
  tones,
  type CreationSettings,
} from "./creation-options";

export function SettingSelect<T extends string>({
  id, label, value, choices, onChange,
}: {
  id: string;
  label: string;
  value: T;
  choices: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const instanceId = useId();
  const controlId = instanceId + "-" + id;
  return <div className="studio-setting-select min-w-0 [.studio-setting-list_&&]:grid [.studio-setting-list_&&]:grid-cols-[68px_minmax(0,1fr)] [.studio-setting-list_&&]:items-center [.studio-setting-list_&&]:gap-2">
    <label htmlFor={controlId} className="text-xs font-medium">{label}</label>
    <Select id={controlId} name={id} value={value} options={choices} onValueChange={onChange} />
  </div>;
}

export function GenerationSettings({
  settings,
  onChange,
  ugcType,
  onUgcTypeChange,
}: {
  settings: CreationSettings;
  onChange: (settings: CreationSettings) => void;
  ugcType?: UgcType;
  onUgcTypeChange?: (value: UgcType) => void;
}) {
  const headingId = useId();
  return (
    <section className={`
      studio-property [&&]:min-w-[0] [&&]:text-[length:var(--ui-text-control)] [&&_h2]:text-[length:var(--ui-text-panel)]
      [&&_h2]:font-[600] [&&_legend]:text-[length:var(--ui-text-panel)] [&&_legend]:font-[600]
      [&&_.text-body-sm]:text-[length:12px] [&&_.text-body-sm]:leading-[18px]
      [&&_[data-slot='button']]:min-h-[var(--workspace-control-height)] [&&_[data-slot='button']]:h-[auto]
      [&&_[data-slot='button']]:pt-[6px] [&&_[data-slot='button']]:pr-[8px] [&&_[data-slot='button']]:pb-[6px]
      [&&_[data-slot='button']]:pl-[8px] [&&_[data-slot='button']]:text-[length:var(--ui-text-control)]
      [&&_[data-slot='button']]:rounded-[var(--ui-radius-control)] [&&_fieldset]:min-w-[0]
      [.studio-inspector-content_>_&&_>_h2]:absolute [.studio-inspector-content_>_&&_>_h2]:w-[1px]
      [.studio-inspector-content_>_&&_>_h2]:h-[1px] [.studio-inspector-content_>_&&_>_h2]:overflow-hidden
      [.studio-inspector-content_>_&&_>_h2]:[clip-path:inset(50%)] [.studio-inspector-content_>_&&_>_label]:mt-[0]
      [.studio-sources_&&_>_div:first-child]:gap-[8px] [.studio-sources_&&_>_div:first-child_>_span]:pt-[2px]
      [.studio-sources_&&_>_div:first-child_>_span]:pr-[8px] [.studio-sources_&&_>_div:first-child_>_span]:pb-[2px]
      [.studio-sources_&&_>_div:first-child_>_span]:pl-[8px] [.studio-sources_&&_h2_svg]:w-[16px]
      [.studio-sources_&&_h2_svg]:h-[16px] [.studio-sources_&&_h2_svg]:text-[color:var(--muted-foreground)]
      [.studio-sources_&&_>_div:first-child_>_span.rounded-full]:[background:var(--muted)]
      [.studio-sources_&&_>_div:first-child_>_span.rounded-full]:text-[color:var(--muted-foreground)]
    `} aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="text-body-sm font-semibold"
      >
        Style & pacing
      </h2>
      <div className={"studio-setting-list mt-3 grid gap-4 [&&]:mt-[0] [&&]:gap-[var(--ui-space-3)] [&&_+_p]:mt-[var(--ui-space-3)]"}>
        <SettingSelect
          id="duration"
          label="Duration"
          value={settings.duration}
          choices={settings.duration === legacyDuration.value ? [legacyDuration, ...durations] : durations}
          onChange={(duration) => onChange({ ...settings, duration })}
        />
        <SettingSelect
          id="visual-style"
          label="Visual style"
          value={settings.visualStyle}
          choices={visualStyles.map((value) => ({ value, label: value }))}
          onChange={(visualStyle) => onChange({ ...settings, visualStyle })}
        />
        <SettingSelect
          id="tone"
          label="Tone"
          value={settings.tone}
          choices={tones.map((value) => ({ value, label: value }))}
          onChange={(tone) => onChange({ ...settings, tone })}
        />
        {ugcType && onUgcTypeChange && <SettingSelect id="ugc-type" label="Type"
          value={ugcType} choices={ugcTypes} onChange={onUgcTypeChange} />}
      </div>
    </section>
  );
}
