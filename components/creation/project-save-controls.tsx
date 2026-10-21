"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, CircleAlert, FolderOpen, LoaderCircle, Save } from "lucide-react";
import { AccountAction } from "@/components/account-action";
import { Button } from "@/components/ui/button";
import { projectTitleLimit } from "@/lib/projects/options";

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; savedAt?: number }
  | { status: "error"; message: string };

export function ProjectSaveControls({
  title,
  onTitleChange,
  onSave,
  state,
  dirty,
  mediaBusy,
  mediaError,
  signedIn,
  authReady,
  hasLocalMedia,
  children,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  onSave: () => void;
  state: SaveState;
  dirty: boolean;
  mediaBusy: boolean;
  mediaError?: string;
  signedIn: boolean;
  authReady: boolean;
  hasLocalMedia: boolean;
  children: (parts: { project: ReactNode; save: ReactNode }) => ReactNode;
}) {
  const saving = state.status === "saving" || mediaBusy;
  const error = state.status === "error" ? state.message : mediaError;
  const clean = state.status === "saved" && !dirty && !error;
  const savedAt = state.status === "saved" ? state.savedAt : undefined;
  const [settledSave, setSettledSave] = useState(savedAt);
  // This timer only controls the success tint; persistence stays with the editor.
  useEffect(() => {
    if (savedAt === undefined) return;
    const timeout = window.setTimeout(() => setSettledSave(savedAt), Math.max(0, savedAt + 1000 - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [savedAt]);
  const success = clean && !saving && savedAt !== undefined && settledSave !== savedAt;
  const label = saving ? "Saving..." : clean ? "Saved" : "Save";
  const description = error || (hasLocalMedia ? "Local files are not saved until uploaded." : "");
  const id = useId();
  const project = (
    <section
      aria-labelledby={`${id}-heading`}
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
      [.studio-sources_&&_>_div:first-child]:gap-[8px]
      [.studio-sources_&&_h2_svg]:w-[16px]
      [.studio-sources_&&_h2_svg]:h-[16px] [.studio-sources_&&_h2_svg]:text-[color:var(--muted-foreground)]
    `}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id={`${id}-heading`}
          className="flex items-center gap-2 text-body-sm font-semibold"
        >
          <FolderOpen className="size-5 text-link" aria-hidden="true" />
          Your project
        </h2>
      </div>
      <label
        htmlFor={`${id}-title`}
        className="mt-3 block text-body-sm font-medium"
      >
        Project title
      </label>
      <input
        id={`${id}-title`}
        name="title"
        className={`
      [@layer_components]:w-[100%] [@layer_components]:min-h-[var(--control-height)]
      [@layer_components]:[border:1px_solid_var(--input)] [@layer_components]:rounded-[var(--radius-md)]
      [@layer_components]:pt-[var(--space-3)] [@layer_components]:pr-[var(--space-4)] [@layer_components]:pb-[var(--space-3)]
      [@layer_components]:pl-[var(--space-4)] [@layer_components]:[background:var(--field)]
      [@layer_components]:text-[color:var(--foreground)]
      [@layer_components]:[transition:border-color_var(--duration-fast),_box-shadow_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] sceenyk-field mt-2 text-body
      [@layer_components]:[&::placeholder]:text-[color:var(--muted-foreground)]
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
        value={title}
        maxLength={projectTitleLimit}
        onChange={(event) => onTitleChange(event.target.value)}
        autoComplete="off"
      />
    </section>
  );
  const save = (<div className={"studio-save [.studio-toolbar_&&]:ml-[auto] [.studio-toolbar_&&]:shrink-0 container-max-359:[.studio-toolbar_&&_button:has(svg)]:w-[32px] container-max-359:[.studio-toolbar_&&_button:has(svg)]:pt-[0] container-max-359:[.studio-toolbar_&&_button:has(svg)]:pr-[0] container-max-359:[.studio-toolbar_&&_button:has(svg)]:pb-[0] container-max-359:[.studio-toolbar_&&_button:has(svg)]:pl-[0]"}>
        {signedIn ? (
          <Button
            type="button"
            variant="outline"
            disabled={saving || !title.trim()}
            aria-busy={saving}
            aria-label={saving ? "Saving project" : clean ? "Project saved" : "Save project"}
            aria-describedby={description ? `${id}-save-description` : undefined}
            title={description || undefined}
            data-save-success={success}
            onClick={onSave}
            className="w-[104px] px-3 [.studio-toolbar_&&]:data-[save-success=true]:border-success/30 [.studio-toolbar_&&]:data-[save-success=true]:bg-success-surface [.studio-toolbar_&&]:data-[save-success=true]:text-success-foreground"
          >
            <span aria-hidden="true" className="grid size-4 shrink-0 *:col-start-1 *:row-start-1 *:size-4 *:transition-opacity *:duration-[var(--motion-micro)] *:ease-[var(--motion-ease)] motion-reduce:*:transition-none">
              <LoaderCircle className={`motion-safe:animate-spin ${saving ? "opacity-100" : "opacity-0"}`} />
              <Check className={!saving && clean ? "opacity-100" : "opacity-0"} />
              <CircleAlert className={!saving && error ? "text-destructive opacity-100" : "opacity-0"} />
              <Save className={!saving && !clean && !error ? "opacity-100" : "opacity-0"} />
            </span>
            <span aria-hidden="true" className="studio-save-label grid container-max-359:[.studio-toolbar_&&]:hidden *:col-start-1 *:row-start-1 *:transition-opacity *:duration-[var(--motion-micro)] *:ease-[var(--motion-ease)] motion-reduce:*:transition-none">
              <span className={!saving && !clean ? "opacity-100" : "opacity-0"}>Save</span>
              <span className={saving ? "opacity-100" : "opacity-0"}>Saving...</span>
              <span className={!saving && clean ? "opacity-100" : "opacity-0"}>Saved</span>
            </span>
          </Button>
        ) : (
          <AccountAction
            intent="sign-in"
            variant="outline"
            disabled={!authReady}
            className="px-3"
          >
            Sign in
          </AccountAction>
        )}
        <span role="status" aria-live="polite" className="sr-only">{signedIn ? label : "Sign in to save."}</span>
        {description && <span id={`${id}-save-description`} role={error ? "alert" : undefined} className="sr-only">{description}</span>}
</div>);
  return children({ project, save });
}
