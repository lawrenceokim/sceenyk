import { useId } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CreationCategory } from "./creation-options";
import { projectPromptLimit } from "@/lib/projects/options";

export function PromptComposer({
  prompt,
  category,
  onChange,
}: {
  prompt: string;
  category: CreationCategory;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <section
      className={`
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
    `}
      aria-labelledby={`${id}-heading`}
    >
      <h2
        id={`${id}-heading`}
        className="text-body-sm font-semibold"
      >
        Describe
        your scene
      </h2>
      <label
        htmlFor={`${id}-prompt`}
        className="mt-3 block text-body-sm font-medium"
      >
        Your creative direction
      </label>
      <textarea
        id={`${id}-prompt`}
        name="prompt"
        value={prompt}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        maxLength={projectPromptLimit}
        placeholder="Describe what you want Sceenyk to create..."
        aria-describedby={`${id}-help ${id}-count`}
        className={`
      [@layer_components]:w-[100%] [@layer_components]:min-h-[var(--control-height)]
      [@layer_components]:[border:1px_solid_var(--input)] [@layer_components]:rounded-[var(--radius-md)]
      [@layer_components]:pt-[var(--space-3)] [@layer_components]:pr-[var(--space-4)] [@layer_components]:pb-[var(--space-3)]
      [@layer_components]:pl-[var(--space-4)] [@layer_components]:[background:var(--field)]
      [@layer_components]:text-[color:var(--foreground)]
      [@layer_components]:[transition:border-color_var(--duration-fast),_box-shadow_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] sceenyk-field mt-2 min-h-32 resize-y
      text-body [@layer_components]:[&::placeholder]:text-[color:var(--muted-foreground)]
      [@layer_components]:[&::placeholder]:opacity-[1] [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:2px]
      [@layer_components]:[&:focus-visible]:[border-color:var(--ring)]
      [@layer_components]:[&:focus-visible]:[box-shadow:var(--focus-shadow)]
      [@layer_components]:[&[aria-invalid='true']]:[border-color:var(--destructive)]
      [@layer_components]:[&[aria-invalid='true']:focus-visible]:[outline-color:var(--destructive)]
      [@layer_components]:[&[aria-invalid='true']:focus-visible]:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--destructive)_24%,_transparent)]
      [@layer_components]:[&:disabled]:opacity-[0.5] [@layer_components]:[&:disabled]:cursor-not-allowed
      [.workspace-marketplace-search_&&]:min-h-[32px] [.workspace-marketplace-search_&&]:h-[32px]
      [.workspace-marketplace-search_&&]:pt-[4px] [.workspace-marketplace-search_&&]:pb-[4px]
      [.workspace-marketplace-search_&&]:text-[length:12px] [.workspace-marketplace-search_&&]:rounded-[16px]
      [.workspace-doc-picker_&&]:w-[100%] [.workspace-doc-picker_&&]:h-[36px] [.workspace-doc-picker_&&]:min-h-[36px]
      [.workspace-doc-picker_&&]:pt-[6px] [.workspace-doc-picker_&&]:pb-[6px]
      [.workspace-doc-picker_&&]:rounded-[var(--ui-radius-control)] [.workspace-doc-picker_&&]:text-[length:13px]
      [@media_(pointer:_coarse)]:[.workspace-doc-picker_&&]:h-[44px]
      [@media_(pointer:_coarse)]:[.workspace-doc-picker_&&]:min-h-[44px] [.workspace-project-rename_&&]:h-[36px]
      [.workspace-project-rename_&&]:min-h-[36px] [.workspace-project-rename_&&]:pt-[6px]
      [.workspace-project-rename_&&]:pr-[8px] [.workspace-project-rename_&&]:pb-[6px] [.workspace-project-rename_&&]:pl-[8px]
      [.workspace-project-rename_&&]:rounded-[7px] [.workspace-project-rename_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-project-rename_&&]:min-h-[44px] [.workspace-settings-inner_textarea&&]:h-[auto]
      [.workspace-settings-inner_textarea&&]:min-h-[96px] [.workspace-settings-inner_textarea&&]:pt-[8px]
      [.workspace-settings-inner_textarea&&]:pr-[8px] [.workspace-settings-inner_textarea&&]:pb-[8px]
      [.workspace-settings-inner_textarea&&]:pl-[8px] [.workspace-settings-inner_textarea&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-picker_&&]:min-h-[44px]
      [.studio-property_&&]:min-h-[var(--workspace-control-height)] [.studio-property_&&]:rounded-[var(--ui-radius-control)]
      [.studio-property_&&]:pt-[6px] [.studio-property_&&]:pr-[8px] [.studio-property_&&]:pb-[6px]
      [.studio-property_&&]:pl-[8px] [.studio-property_&&]:text-[length:var(--ui-text-control)]
      [.studio-property_&&]:leading-[18px] [.studio-property_textarea&&]:min-h-[112px]
      [.studio-property_textarea&&]:pt-[var(--ui-space-3)] [.studio-property_textarea&&]:pr-[var(--ui-space-3)]
      [.studio-property_textarea&&]:pb-[var(--ui-space-3)] [.studio-property_textarea&&]:pl-[var(--ui-space-3)]
      [.studio-property_textarea&&]:text-[length:13px] [.studio-property_textarea&&]:leading-[20px]
      [.studio-setting-select_select&&]:pr-[28px]
    `}
      />
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-caption text-muted-foreground">
        <p id={`${id}-help`}>
          Think subject, mood, movement, and the story you want to tell.
        </p>
        <span id={`${id}-count`}>
          {prompt.length.toLocaleString()} /{" "}
          {projectPromptLimit.toLocaleString()} characters
        </span>
      </div>
      <div className="mt-3">
        <p className="mb-2 text-caption font-medium text-muted-foreground">
          NEED A FIRST SPARK?
        </p>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onChange(category.example)}
          className="h-auto min-h-11 w-full justify-start gap-3 whitespace-normal px-3 py-3 text-left font-normal"
        >
          <Sparkles className="size-4 shrink-0 text-link" aria-hidden="true" />
          <span>{category.example}</span>
        </Button>
      </div>
    </section>
  );
}
