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
      className="studio-property"
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
        className="sceenyk-field mt-2 text-body"
        value={title}
        maxLength={projectTitleLimit}
        onChange={(event) => onTitleChange(event.target.value)}
        aria-describedby={`${id}-help`}
        autoComplete="off"
      />
      <p id={`${id}-help`} className="mt-2 text-caption text-muted-foreground">
        Save your title, prompt and creative settings to return to them later.
      </p>
      {hasLocalMedia && (
        <p className="mt-4 rounded-lg border border-warning/30 bg-warning-surface p-3 text-body-sm text-warning-foreground">
          Selected local media isn’t saved with your draft. Use Upload to project
          to keep it when you reopen.
        </p>
      )}
      <div className="mt-3">
        {projectId && (
          <Link
            href={`/projects/${projectId}`}
            prefetch={false}
            className="nav-link justify-center text-body-sm"
          >
            Open saved draft
          </Link>
        )}
      </div>
      {signedIn && projectId && <div className="mt-3 text-center"><Link href={`/dashboard/marketplace/new?project=${projectId}`} prefetch={false} className="nav-link justify-center text-body-sm text-link">Publish to Marketplace</Link><p className="mt-1 text-caption text-muted-foreground">Uses your last saved settings. You’ll write separate public instructions.</p></div>}
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
          "Sign in to keep your projects private."
        ) : dirty ? (
          "Unsaved changes"
        ) : state.status === "saved" ? (
          <span className="inline-flex items-center gap-2 text-success-foreground">
            <Check className="size-4" aria-hidden="true" />
            Draft saved
          </span>
        ) : (
          "Your draft hasn’t been saved yet."
        )}
      </div>
    </section>
  );
  const save = (<div className="studio-save">
        {signedIn ? (
          <Button
            type="button"
            variant="outline"
            disabled={saving || !title.trim()}
            aria-busy={saving}
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
            {saving ? "Saving…" : state.status === "saved" && !dirty ? "Saved" : "Save"}
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
