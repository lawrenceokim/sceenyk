import { ChevronDown } from "lucide-react";
import {
  aspectRatios,
  durations,
  visualStyles,
  tones,
  type CreationSettings,
} from "./creation-options";

function SettingSelect<T extends string>({
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
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-body-sm font-medium">
        {label}
      </label>
      <div className="relative mt-2">
        <select
          id={id}
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
  return (
    <section
      className="sceenyk-card p-5 sm:p-6"
      aria-labelledby="settings-heading"
    >
      <h2
        id="settings-heading"
        className="flex items-center gap-3 text-lg font-semibold tracking-tight"
      >
        <span className="font-mono text-caption text-link">04</span>Set the
        direction
      </h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <SettingSelect
          id="aspect-ratio"
          label="Aspect ratio"
          value={settings.aspectRatio}
          choices={aspectRatios}
          onChange={(aspectRatio) => onChange({ ...settings, aspectRatio })}
        />
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
        Explore these settings locally. Available generation options will be
        confirmed at launch.
      </p>
    </section>
  );
}
