import { useId, useRef, useState } from "react";
import { AudioLines, FileVideo, ImageIcon, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatFileSize, type LocalMedia } from "./creation-options";
import type { UploadState } from "@/lib/media/upload-client";
import type { ProjectAsset } from "@/lib/media/types";
import { ProjectMediaList } from "./project-media-list";
import { LocalMediaThumbnail } from "./local-media-preview";
import { AccountAction } from "@/components/account-action";

const mediaIcons = { image: ImageIcon, video: FileVideo, audio: AudioLines };

export function MediaDropzone({
  files,
  selectedId,
  error,
  onAdd,
  onSelect,
  onRemove,
  onUpload,
  uploadStates,
  busy,
  signedIn,
  authReady,
  assets,
  assetError,
  onRecover,
}: {
  files: LocalMedia[];
  selectedId?: string;
  error: string;
  onAdd: (files: File[]) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onUpload: (media: LocalMedia) => void;
  uploadStates: Record<string, UploadState>;
  busy: boolean;
  signedIn: boolean;
  authReady: boolean;
  assets: ProjectAsset[];
  assetError: string;
  onRecover: (asset: ProjectAsset) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const browse = useRef<HTMLButtonElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={`${id}-heading`}
          className="text-body-sm font-semibold"
        >
          Project media
        </h2>
      </div>
      <div
        role="region"
        aria-label="Local media dropzone"
        className={`
      [@layer_components]:grid [@layer_components]:[place-items:center] [@layer_components]:min-w-[0]
      [@layer_components]:gap-[var(--space-2)] [@layer_components]:pt-[var(--space-6)]
      [@layer_components]:pr-[var(--space-6)] [@layer_components]:pb-[var(--space-6)] [@layer_components]:pl-[var(--space-6)]
      [@layer_components]:[border:1px_dashed_var(--primary)] [@layer_components]:rounded-[var(--radius-lg)]
      [@layer_components]:[background:var(--field)] [@layer_components]:text-[color:var(--foreground)]
      [@layer_components]:[transition:border-color_var(--duration-fast),_background-color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] sceenyk-upload mt-3 text-center
      [@layer_components]:[&_>_*]:min-w-[0] [@layer_components]:[&_>_*]:max-w-[100%]
      [@layer_components]:[&:focus-within]:[border-color:var(--ring)]
      [@layer_components]:[&:focus-within]:[box-shadow:var(--focus-shadow)]
      [@layer_components]:[&[data-dragging='true']]:[background:var(--accent)]
      [@layer_components]:[&[data-dragging='true']]:[border-color:var(--ring)]
      [@layer_components]:[&[aria-disabled='true']]:opacity-[0.5]
      [@layer_components]:[&[aria-disabled='true']]:cursor-not-allowed
      [@layer_components]:[@media_(hover:_hover)]:[&:hover:not([aria-disabled='true'])]:[background:var(--accent)]
      [.studio-sources_&&]:min-h-[0] [.studio-sources_&&]:pt-[12px] [.studio-sources_&&]:pr-[8px]
      [.studio-sources_&&]:pb-[12px] [.studio-sources_&&]:pl-[8px] [.studio-sources_&&]:[border-color:var(--input)]
      [.studio-sources_&&_>_span]:hidden
    `}
        data-dragging={dragging}
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          onAdd(Array.from(event.dataTransfer.files));
        }}
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Upload className="size-5" aria-hidden="true" />
        </span>
        {dragging && <p className="text-body-sm font-medium">Drop files</p>}
        <input
          ref={input}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          aria-label="Choose local media files"
          aria-describedby={`${id}-help`}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            onAdd(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <Button
          ref={browse}
          type="button"
          variant="outline"
          onClick={() => input.current?.click()}
          className="mt-1"
        >
          Browse files
        </Button>
      </div>
      <p id={`${id}-help`} className="mt-3 text-caption text-muted-foreground">
        Images, video & audio · SVG preview only.
      </p>
      <p
        role="status"
        className={cn(
          "mt-3 text-body-sm",
          error ? "text-destructive" : "sr-only",
        )}
      >
        {error ||
          (files.length
            ? `${files.length} local media ${files.length === 1 ? "file" : "files"} selected.`
            : "No local media selected.")}
      </p>
      {files.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Selected local media">
          {files.map((media) => {
            const Icon = mediaIcons[media.kind];
            const state = uploadStates[media.id];
            return (
              <li
                key={media.id}
                className={cn(
                  "flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border p-2",
                  selectedId === media.id && "border-ring bg-accent/50",
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Preview ${media.file.name}`}
                  aria-pressed={selectedId === media.id}
                  onClick={() => onSelect(media.id)}
                  className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-3 whitespace-normal px-2 py-1.5"
                >
                  {media.kind === "image" ? <LocalMediaThumbnail media={media} /> : <Icon
                    className="size-5 shrink-0 text-link"
                    aria-hidden="true"
                  />}
                  <span className="min-w-0 text-left">
                    <span className="block break-all text-body-sm font-medium">
                      {media.file.name}
                    </span>
                    <span className="mt-1 block text-caption capitalize text-muted-foreground">
                      {media.kind} · {formatFileSize(media.file.size)}
                    </span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={`Remove ${media.file.name}`}
                  onClick={() => {
                    onRemove(media.id);
                    browse.current?.focus();
                  }}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
                <div className="w-full px-2 pb-1">
                  {signedIn ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onUpload(media)}
                    >
                      {state?.status === "failed"
                        ? "Retry upload"
                        : "Upload to project"}
                    </Button>
                  ) : (
                    <AccountAction
                      intent="sign-in"
                      variant="outline"
                      disabled={!authReady}
                    >
                      Sign in to upload
                    </AccountAction>
                  )}
                  <p
                    role="status"
                    className={cn(
                      "mt-2 break-words text-caption",
                      state?.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {state?.status === "preparing"
                      ? "Preparing your project and upload…"
                      : state?.status === "uploading"
                        ? `Uploading${state.progress !== undefined ? ` · ${state.progress}%` : "…"}`
                        : state?.status === "verifying"
                          ? "Verifying stored media…"
                          : state?.status === "failed"
                            ? state.message
                            : "Selected · local preview only"}
                  </p>
                  {state?.status === "uploading" &&
                    state.progress !== undefined && (
                      <progress
                        value={state.progress}
                        max={100}
                        aria-label={`Upload progress for ${media.file.name}`}
                        className="mt-2 w-full accent-primary"
                      />
                    )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ProjectMediaList
        assets={assets}
        selectedId={selectedId}
        error={assetError}
        busy={busy}
        onSelect={onSelect}
        onRecover={onRecover}
      />
    </section>
  );
}
