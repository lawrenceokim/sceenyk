import { useId } from "react";
import { Check } from "lucide-react";
import { proDurations, type CreationSettings } from "@/lib/projects/options";

export function DurationGallery({ value, onChange }: {
  value: CreationSettings["duration"];
  onChange: (value: CreationSettings["duration"]) => void;
}) {
  const groupId = useId();
  const retained = !proDurations.some(d => d.value === value);
  const choices = retained ? [{ value, label: `${value} seconds (saved)` }, ...proDurations] : proDurations;
  return <fieldset className="min-w-0">
    <legend className="sr-only">Duration</legend>
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,64px),1fr))] gap-2 p-1">
      {choices.map(choice => <label key={choice.value} className="relative min-w-0 cursor-pointer">
        <input type="radio" name={groupId} value={choice.value} checked={value === choice.value}
          aria-label={choice.label} onChange={event => { if (event.target.checked) onChange(choice.value); }} className="peer sr-only" />
        <span className="relative flex min-h-24 flex-col items-center justify-center gap-1 rounded-[var(--ui-radius-control)] border-2 border-border bg-card px-1 py-2 text-muted-foreground transition-colors duration-150 peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background motion-reduce:transition-none">
          <svg viewBox="0 0 48 48" className="size-11 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="24" cy="24" r="18" className="fill-background" />
            <path d="M24 9v3m15 12h-3M24 39v-3M9 24h3" opacity=".5" />
            <path d="M24 24V14" opacity=".45" />
            <path d="M24 26V11" strokeWidth="2.5" transform={`rotate(${Number(choice.value) * 6} 24 24)`} />
            <circle cx="24" cy="24" r="2" fill="currentColor" stroke="none" />
          </svg>
          <span className="text-xs font-medium">{choice.value}s</span>
          {retained && choice.value === value && <span className="text-[10px]">Saved</span>}
          {value === choice.value && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
            <Check className="size-3" strokeWidth={3} />
          </span>}
        </span>
      </label>)}
    </div>
  </fieldset>;
}
