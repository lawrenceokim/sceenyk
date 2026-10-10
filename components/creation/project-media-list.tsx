import { useId } from "react";
import { Button } from "@/components/ui/button";
import type { ProjectAsset } from "@/lib/media/types";
import { formatFileSize } from "./creation-options";
import { cn } from "@/lib/utils";

export function ProjectMediaList({
  assets,
  selectedId,
  error,
  busy,
  onSelect,
  onRecover,
}: {
  assets: ProjectAsset[];
  selectedId?: string;
  error: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onRecover: (asset: ProjectAsset) => void;
}) {
  const id = useId();
  if (!assets.length && !error) return null;
  return (
    <div className="mt-5 border-t border-border pt-4" aria-labelledby={id}>
      <h3 id={id} className="text-body-sm font-semibold">
        Saved project media
      </h3>
      {error && (
        <p
          role="status"
          className="mt-2 break-words text-body-sm text-destructive"
        >
          {error}
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {assets.map((asset) => (
          <li
            key={asset.id}
            className={cn(
              "min-w-0 rounded-lg border border-border p-3",
              selectedId === asset.id && "border-ring bg-accent/50",
            )}
          >
            <p className="break-all text-body-sm font-medium">
              {asset.filename}
            </p>
            <p className="mt-1 text-caption capitalize text-muted-foreground">
              {asset.kind} · {formatFileSize(asset.sizeBytes)} ·{" "}
              {asset.status === "uploaded"
                ? "Uploaded · Private"
                : asset.status === "rejected"
                  ? "Failed validation"
                  : "Upload not finalized"}
            </p>
            {asset.status === "uploaded" ? (
              <Button
                type="button"
                variant="ghost"
                aria-label={`Preview ${asset.filename}`}
                aria-pressed={selectedId === asset.id}
                onClick={() => onSelect(asset.id)}
                className="mt-2"
              >
                Preview
              </Button>
            ) : asset.status === "pending" ? (
              <>
                <p className="mt-2 text-caption text-muted-foreground">
                  Check a completed transfer. If the file never reached storage,
                  select it again above and choose Upload to project.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onRecover(asset)}
                  className="mt-2"
                >
                  Check upload
                </Button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-caption text-muted-foreground">
        Uploaded media returns when you reopen this project. Permanent deletion
        is coming in a later unit.
      </p>
    </div>
  );
}
