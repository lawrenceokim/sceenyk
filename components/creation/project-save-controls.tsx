"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Check, FolderOpen, LoaderCircle, Save } from "lucide-react";
import { AccountAction } from "@/components/account-action";
import { Button } from "@/components/ui/button";
import { projectTitleLimit } from "@/lib/projects/options";

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

export function ProjectSaveControls({
  title,
  onTitleChange,
  onSave,
  state,
  dirty,
  projectId,
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
  projectId: string | null;
  signedIn: boolean;
  authReady: boolean;
  hasLocalMedia: boolean;
  children: (parts: { project: ReactNode; save: ReactNode }) => ReactNode;
}) {
  const saving = state.status === "saving";
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
      [.studio-sources_&&_>_div:first-child]:gap-[8px] [.studio-sources_&&_>_div:first-child_>_span]:pt-[2px]
      [.studio-sources_&&_>_div:first-child_>_span]:pr-[8px] [.studio-sources_&&_>_div:first-child_>_span]:pb-[2px]
      [.studio-sources_&&_>_div:first-child_>_span]:pl-[8px] [.studio-sources_&&_h2_svg]:w-[16px]
      [.studio-sources_&&_h2_svg]:h-[16px] [.studio-sources_&&_h2_svg]:text-[color:var(--muted-foreground)]
      [.studio-sources_&&_>_div:first-child_>_span.rounded-full]:[background:var(--muted)]
      [.studio-sources_&&_>_div:first-child_>_span.rounded-full]:text-[color:var(--muted-foreground)]
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
        <span className="rounded-full bg-accent px-3 py-1 text-caption font-medium text-accent-foreground">
          Draft
        </span>
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
      {hasLocalMedia && (
        <p className="mt-4 rounded-lg border border-warning/30 bg-warning-surface p-3 text-body-sm text-warning-foreground">
          Local files are not saved until uploaded.
        </p>
      )}
      <div className="mt-3">
        {projectId && (
          <Link
            href={`/projects/${projectId}`}
            prefetch={false}
            className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] nav-link justify-center text-body-sm
      [@layer_components]:[&:hover]:text-[color:var(--link)]
      [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:4px] [.marketplace-detail-info_>_&&]:min-h-[32px]
      [.marketplace-detail-info_>_&&]:gap-[8px] [.marketplace-detail-info_>_&&]:text-[length:13px]
      [.marketplace-detail-info_>_&&_img]:w-[28px] [.marketplace-detail-info_>_&&_img]:h-[28px]
      [.marketplace-detail-info_>_&&_.rounded-full]:w-[28px] [.marketplace-detail-info_>_&&_.rounded-full]:h-[28px]
      [.workspace-gallery-copy_&&]:min-h-[24px] [.workspace-gallery-copy_&&]:gap-[6px]
      [.workspace-gallery-copy_&&]:text-[length:inherit] [.workspace-gallery-copy_&&]:leading-[inherit]
      [.workspace-settings-inner_&&]:min-h-[28px] [.workspace-settings-inner_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&]:min-h-[44px]
    `}
          >
            Open saved draft
          </Link>
        )}
      </div>
      {signedIn && projectId && <div className="mt-3 text-center"><Link href={`/settings/templates/new?project=${projectId}`} prefetch={false} className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] nav-link justify-center text-body-sm
      text-link [@layer_components]:[&:hover]:text-[color:var(--link)]
      [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:4px] [.marketplace-detail-info_>_&&]:min-h-[32px]
      [.marketplace-detail-info_>_&&]:gap-[8px] [.marketplace-detail-info_>_&&]:text-[length:13px]
      [.marketplace-detail-info_>_&&_img]:w-[28px] [.marketplace-detail-info_>_&&_img]:h-[28px]
      [.marketplace-detail-info_>_&&_.rounded-full]:w-[28px] [.marketplace-detail-info_>_&&_.rounded-full]:h-[28px]
      [.workspace-gallery-copy_&&]:min-h-[24px] [.workspace-gallery-copy_&&]:gap-[6px]
      [.workspace-gallery-copy_&&]:text-[length:inherit] [.workspace-gallery-copy_&&]:leading-[inherit]
      [.workspace-settings-inner_&&]:min-h-[28px] [.workspace-settings-inner_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&]:min-h-[44px]
    `}>Publish to Marketplace</Link></div>}
      <div
        role="status"
        aria-live="polite"
        className="mt-3 min-h-5 text-body-sm text-muted-foreground"
      >
        {saving ? (
          "Saving your creative brief…"
        ) : state.status === "error" ? (
          <span className="text-destructive">{state.message}</span>
        ) : !signedIn ? (
          "Sign in to save."
        ) : dirty ? (
          "Unsaved changes"
        ) : state.status === "saved" ? (
          <span className="inline-flex items-center gap-2 text-success-foreground">
            <Check className="size-4" aria-hidden="true" />
            Draft saved
          </span>
        ) : (
          "Draft not saved."
        )}
      </div>
    </section>
  );
  const save = (<div className={"studio-save [.studio-toolbar_&&]:ml-[auto] [.studio-toolbar_&&]:shrink-0 container-max-359:[.studio-toolbar_&&_button:has(svg)]:w-[32px] container-max-359:[.studio-toolbar_&&_button:has(svg)]:pt-[0] container-max-359:[.studio-toolbar_&&_button:has(svg)]:pr-[0] container-max-359:[.studio-toolbar_&&_button:has(svg)]:pb-[0] container-max-359:[.studio-toolbar_&&_button:has(svg)]:pl-[0]"}>
        {signedIn ? (
          <Button
            type="button"
            variant="outline"
            disabled={saving || !title.trim()}
            aria-busy={saving}
            aria-label={saving ? "Saving project" : state.status === "saved" && !dirty ? "Project saved" : "Save project"}
            onClick={onSave}
            className="px-3"
          >
            {saving ? (
              <LoaderCircle
                className="size-4 motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            <span className={"studio-save-label container-max-359:[.studio-toolbar_&&]:hidden"}>{saving ? "Saving…" : state.status === "saved" && !dirty ? "Saved" : "Save"}</span>
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
</div>);
  return children({ project, save });
}
