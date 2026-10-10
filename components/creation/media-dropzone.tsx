import { useId, useRef, useState } from "react";
import { AudioLines, FileVideo, ImageIcon, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatFileSize, type LocalMedia } from "./creation-options";
import type { UploadState } from "@/lib/media/upload-client";
import type { ProjectAsset } from "@/lib/media/types";
import { ProjectMediaList } from "./project-media-list";
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
      className="sceenyk-card p-5 sm:p-6"
      aria-labelledby={`${id}-heading`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={`${id}-heading`}
          className="flex items-center gap-3 text-lg font-semibold tracking-tight"
        >
          <span className="font-mono text-caption text-link">03</span>Bring your
          media
        </h2>
        <span className="text-caption text-muted-foreground">
          Optional · private project media
        </span>
      </div>
      <div
        role="region"
        aria-label="Local media dropzone"
        className="sceenyk-upload mt-5 text-center"
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
        <p className="text-body-sm font-medium">
          {dragging
            ? "Drop to add local media"
            : "Drop a little inspiration here"}
        </p>
        <p className="text-caption text-muted-foreground">
          Video, images, or audio · preview locally, then upload
        </p>
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
        Upload to keep media in your private project. A new draft is saved
        first. Preview support depends on your browser. SVG files are local
        previews only.
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
                  <Icon
                    className="size-5 shrink-0 text-link"
                    aria-hidden="true"
                  />
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
