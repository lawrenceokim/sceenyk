import Image from "next/image";
import { Check } from "lucide-react";
import { useId } from "react";

export function PropertyImageGallery<T extends string>({ label, value, options, onChange, descriptionId, onDisabledOption }: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; image: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  descriptionId?: string;
  onDisabledOption?: (value: T) => void;
}) {
  const groupId = useId();
  return <fieldset className="min-w-0" aria-describedby={descriptionId}>
    <legend className="sr-only">{label}</legend>
    <div className="mt-2 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,88px),1fr))] gap-2 p-1">
      {options.map((option, index) => <div key={option.value} className="relative min-w-0"><label className="relative block min-w-0 cursor-pointer">
        <input type="radio" name={groupId} value={option.value} checked={value === option.value} disabled={option.disabled}
          aria-labelledby={groupId + "-" + index}
          onChange={event => { if (event.target.checked) onChange(option.value); }} className="peer sr-only" />
        <span className="relative block aspect-[4/3] min-h-16 overflow-hidden rounded-[var(--ui-radius-control)] border-2 border-border bg-muted transition-colors duration-150 peer-disabled:opacity-50 peer-checked:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background motion-reduce:transition-none">
          <Image src={option.image} alt="" width={384} height={288} sizes="(max-width: 767px) 40vw, 160px"
            className="h-full w-full object-cover" />
          <span id={groupId + "-" + index} className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/65 to-transparent px-2 pb-1.5 pt-5 text-center text-[length:var(--ui-text-control)] font-medium text-white">
            {option.label}
          </span>
          {value === option.value && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
            <Check className="size-3" strokeWidth={3} />
          </span>}
        </span>
      </label>{option.disabled && onDisabledOption && <button type="button" aria-disabled="true" aria-label={`${option.label} unavailable`}
        className="absolute inset-0 cursor-not-allowed rounded-[var(--ui-radius-control)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => onDisabledOption(option.value)} />}</div>)}
    </div>
  </fieldset>;
}
