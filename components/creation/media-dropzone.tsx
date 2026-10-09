import { useId, useRef, useState } from "react";
import { AudioLines, FileVideo, ImageIcon, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatFileSize, type LocalMedia } from "./creation-options";

const mediaIcons = { image: ImageIcon, video: FileVideo, audio: AudioLines };

export function MediaDropzone({
  files,
  selectedId,
  error,
  onAdd,
  onSelect,
  onRemove,
}: {
  files: LocalMedia[];
  selectedId?: string;
  error: string;
  onAdd: (files: File[]) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
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
          Optional · stays on your device
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
          Video, images, or audio · temporary local preview, not saved
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
        Nothing is uploaded or saved. Preview support depends on your browser.
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
            return (
              <li
                key={media.id}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-lg border border-border p-2",
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
                  aria-label={`Remove ${media.file.name}`}
                  onClick={() => {
                    onRemove(media.id);
                    browse.current?.focus();
                  }}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
