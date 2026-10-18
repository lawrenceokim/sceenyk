import { useId } from "react";
import { Check } from "lucide-react";
import { creationCategories, type CategoryId } from "./creation-options";

export function CategorySelector({
  selected,
  onChange,
}: {
  selected: CategoryId;
  onChange: (id: CategoryId) => void;
}) {
  const groupName = useId();
  return (
    <fieldset className="studio-property">
      <legend className="mb-3 text-body-sm font-semibold">
        Creation type
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {creationCategories.map(({ id, title, description, icon: Icon }) => (
          <label key={id} className="relative min-w-0 cursor-pointer">
            <input
              type="radio"
              name={groupName}
              value={id}
              checked={selected === id}
              onChange={() => onChange(id)}
              className="peer sr-only"
            />
            <span className="flex h-full min-h-20 flex-col rounded-lg border border-border bg-card p-2.5 transition-colors hover:border-ring peer-checked:border-ring peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ring motion-reduce:transition-none">
              <span className="mb-2 flex items-center justify-between">
                <Icon className="size-5 text-link" aria-hidden="true" />
                {selected === id && (
                  <Check className="size-4 text-link" aria-hidden="true" />
                )}
              </span>
              <span className="text-body-sm font-semibold">{title}</span>
              <span className="sr-only">
                {description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
