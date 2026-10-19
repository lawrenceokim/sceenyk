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
    <fieldset className={`
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
    `}>
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
