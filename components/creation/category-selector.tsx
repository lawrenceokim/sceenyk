import { Check } from "lucide-react";
import { creationCategories, type CategoryId } from "./creation-options";

export function CategorySelector({
  selected,
  onChange,
}: {
  selected: CategoryId;
  onChange: (id: CategoryId) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-4 flex items-center gap-3 text-lg font-semibold tracking-tight">
        <span className="font-mono text-caption text-link">01</span>Choose your
        canvas
      </legend>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {creationCategories.map(({ id, title, description, icon: Icon }) => (
          <label key={id} className="relative min-w-0 cursor-pointer">
            <input
              type="radio"
              name="creation-category"
              value={id}
              checked={selected === id}
              onChange={() => onChange(id)}
              className="peer sr-only"
            />
            <span className="flex h-full min-h-36 flex-col rounded-xl border border-border bg-card p-4 shadow-card transition-colors hover:border-ring peer-checked:border-ring peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ring motion-reduce:transition-none">
              <span className="mb-3 flex items-center justify-between">
                <Icon className="size-5 text-link" aria-hidden="true" />
                {selected === id && (
                  <Check className="size-4 text-link" aria-hidden="true" />
                )}
              </span>
              <span className="text-body-sm font-semibold">{title}</span>
              <span className="mt-1.5 text-caption leading-relaxed text-muted-foreground">
                {description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
