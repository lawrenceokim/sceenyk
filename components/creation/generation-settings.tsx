import { useId } from "react";
import { ChevronDown } from "lucide-react";
import {
  durations,
  visualStyles,
  tones,
  type CreationSettings,
} from "./creation-options";

export function SettingSelect<T extends string>({
  id,
  label,
  value,
  choices,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  choices: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const instanceId = useId();
  return (
    <div className="studio-setting-select min-w-0">
      <label
        htmlFor={`${instanceId}-${id}`}
        className="text-body-sm font-medium"
      >
        {label}
      </label>
      <div className="relative mt-2">
        <select
          id={`${instanceId}-${id}`}
          name={id}
          value={value}
          onChange={(event) => {
            const choice = choices.find(
              (option) => option.value === event.target.value,
            );
            if (choice) onChange(choice.value);
          }}
          className="sceenyk-field appearance-none pr-10 text-body-sm"
        >
          {choices.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

export function GenerationSettings({
  settings,
  onChange,
}: {
  settings: CreationSettings;
  onChange: (settings: CreationSettings) => void;
}) {
  const headingId = useId();
  return (
    <section className="studio-property" aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="text-body-sm font-semibold"
      >
        Style & pacing
      </h2>
      <div className="studio-setting-list mt-3 grid gap-4">
        <SettingSelect
          id="duration"
          label="Duration"
          value={settings.duration}
          choices={durations}
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
      </div>
      <p className="mt-5 text-caption text-muted-foreground">
        Settings are saved with your creative brief.
      </p>
    </section>
  );
}
