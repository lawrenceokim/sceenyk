"use client";

import { useId, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Sparkles } from "lucide-react";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AccountAction } from "@/components/account-action";
import { saveProjectAction } from "@/app/actions/projects";
import type { ProjectDraft, SavedProject } from "@/lib/projects/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CategorySelector } from "./category-selector";
import { CreationPreview } from "./creation-preview";
import { GenerationSettings } from "./generation-settings";
import { MediaDropzone } from "./media-dropzone";
import { PromptComposer } from "./prompt-composer";
import { ProjectSaveControls, type SaveState } from "./project-save-controls";
import { useProjectMedia } from "./use-project-media";
import type { ProjectAsset } from "@/lib/media/types";
import {
  creationCategories,
  getMediaKind,
  type CategoryId,
  type CreationSettings,
  type LocalMedia,
} from "./creation-options";

function GenerateButton({ disabled }: { disabled: boolean }) {
  const helpId = useId();
  return (
    <div className="sceenyk-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <p className="text-body-sm font-medium">Ready for the next scene?</p>
        <p id={helpId} className="mt-1 text-caption text-muted-foreground">
          Preview only. Generation isn’t connected yet.
        </p>
      </div>
      <Dialog>
        <DialogTrigger
          render={
            <Button
              type="button"
              size="lg"
              disabled={disabled}
              aria-describedby={helpId}
              className="w-full sm:w-auto"
            />
          }
        >
          <Sparkles className="size-5" aria-hidden="true" />
          Generate
        </DialogTrigger>
        <DialogContent>
          <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Sparkles className="size-6" aria-hidden="true" />
          </span>
          <DialogTitle className="text-heading-3 font-semibold">
            Generation is coming soon
          </DialogTitle>
          <DialogDescription className="text-body leading-relaxed">
            You can save your creative brief as a draft. Generation isn’t
            connected yet, so this action won’t create content or use credits.
          </DialogDescription>
          <DialogClose render={<Button variant="outline" className="mt-2" />}>
            Keep creating your brief
          </DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type WorkspaceProps = {
  initialProject?: SavedProject;
  viewerUserId?: string;
  initialAssets?: ProjectAsset[];
  initialMediaError?: string;
};

function AccountWorkspace(props: WorkspaceProps) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (props.initialProject && (!isLoaded || userId !== props.viewerUserId)) {
    return (
      <div className="sceenyk-card p-6" role="status">
        <p className="text-body-sm text-muted-foreground">
          {!isLoaded
            ? "Opening your draft…"
            : "Sign in to open your saved project."}
        </p>
        {isLoaded && (
          <AccountAction intent="sign-in" className="mt-4">
            Sign in
          </AccountAction>
        )}
      </div>
    );
  }
  return (
    <WorkspaceEditor
      key={`${userId ?? "visitor"}:${props.initialProject?.id ?? "new"}`}
      initialProject={props.initialProject}
      initialAssets={props.initialAssets}
      initialMediaError={props.initialMediaError}
      signedIn={!!isSignedIn}
      authReady={isLoaded}
    />
  );
}

export function CreationWorkspace(props: WorkspaceProps) {
  const available = useAuthAvailable();
  return available ? (
    <AccountWorkspace {...props} />
  ) : (
    <WorkspaceEditor signedIn={false} authReady />
  );
}

function WorkspaceEditor({
  initialProject,
  initialAssets = [],
  initialMediaError = "",
  signedIn,
  authReady,
}: {
  initialProject?: SavedProject;
  initialAssets?: ProjectAsset[];
  initialMediaError?: string;
  signedIn: boolean;
  authReady: boolean;
}) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>(
    initialProject?.category ?? "cinematic",
  );
  const [prompt, setPrompt] = useState(initialProject?.prompt ?? "");
  const [title, setTitle] = useState(
    initialProject?.title ?? "Untitled Project",
  );
  const [projectId, setProjectId] = useState(initialProject?.id ?? null);
  const attemptId = useRef(initialProject?.id ?? null);
  const saveInFlight = useRef<Promise<string | null> | null>(null);
  const persistedId = useRef(initialProject?.id ?? null);
  const [saveState, setSaveState] = useState<SaveState>(
    initialProject ? { status: "saved" } : { status: "idle" },
  );
  const [savedBrief, setSavedBrief] = useState<ProjectDraft | null>(
    initialProject ?? null,
  );
  const [selectedFiles, setSelectedFiles] = useState<LocalMedia[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [settings, setSettings] = useState<CreationSettings>(
    initialProject?.settings ?? {
      aspectRatio: "16:9",
      duration: "10",
      visualStyle: "Original",
      tone: "Storytelling",
    },
  );
  const category =
    creationCategories.find((item) => item.id === selectedCategory) ??
    creationCategories[2];
  const activeMedia =
    selectedFiles.find((media) => media.id === selectedFileId) ??
    (selectedFileId ? undefined : selectedFiles[0]);
  const brief: ProjectDraft = {
    title,
    category: selectedCategory,
    prompt,
    settings,
  };
  const dirty =
    savedBrief !== null &&
    (title !== savedBrief.title ||
      prompt !== savedBrief.prompt ||
      selectedCategory !== savedBrief.category ||
      settings.aspectRatio !== savedBrief.settings.aspectRatio ||
      settings.duration !== savedBrief.settings.duration ||
      settings.visualStyle !== savedBrief.settings.visualStyle ||
      settings.tone !== savedBrief.settings.tone);

  function saveDraft(): Promise<string | null> {
    if (saveInFlight.current) return saveInFlight.current;
    if (!signedIn) return Promise.resolve(null);
    setSaveState({ status: "saving" });
    // Keep this ID even if the response is lost after a committed first save.
    const id = attemptId.current ?? crypto.randomUUID();
    attemptId.current = id;
    const saving = (async () => {
      try {
        const result = await saveProjectAction({
          ...brief,
          id,
          mode: persistedId.current ? "update" : "create",
        });
        if (!result.ok) {
          setSaveState({ status: "error", message: result.message });
          return null;
        }
        setProjectId(result.project.id);
        persistedId.current = result.project.id;
        // Edits made while saving remain unsaved rather than being overwritten.
        setSavedBrief(brief);
        setSaveState({ status: "saved" });
        return result.project.id;
      } catch {
        setSaveState({
          status: "error",
          message:
            "Your draft couldn’t be saved. Check your connection and try again.",
        });
        return null;
      } finally {
        saveInFlight.current = null;
      }
    })();
    saveInFlight.current = saving;
    return saving;
  }

  const mediaUpload = useProjectMedia({
    initialAssets,
    initialError: initialMediaError,
    projectId,
    ensureProject: () =>
      persistedId.current ? Promise.resolve(persistedId.current) : saveDraft(),
    onUploaded: (localId, assetId) => {
      setSelectedFiles((files) =>
        files.filter((media) => media.id !== localId),
      );
      setSelectedFileId(assetId);
    },
  });
  const activeAsset =
    mediaUpload.assets.find(
      (asset) => asset.id === selectedFileId && asset.status === "uploaded",
    ) ??
    (!selectedFileId && !activeMedia
      ? mediaUpload.assets.find((asset) => asset.status === "uploaded")
      : undefined);

  function addFiles(files: File[]) {
    const accepted: LocalMedia[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const kind = getMediaKind(file);
      if (!kind || file.size === 0) {
        rejected.push(file.name);
        continue;
      }
      accepted.push({ id: crypto.randomUUID(), file, kind });
    }
    setSelectedFiles((current) => {
      const updated = [...current];
      for (const media of accepted) {
        if (
          !updated.some(
            ({ file }) =>
              file.name === media.file.name &&
              file.size === media.file.size &&
              file.lastModified === media.file.lastModified &&
              file.type === media.file.type,
          )
        )
          updated.push(media);
      }
      return updated;
    });
    setMediaError(
      rejected.length
        ? `Couldn’t add ${rejected.join(", ")}. Choose a non-empty image, video, or audio file.`
        : "",
    );
  }

  function removeFile(id: string) {
    if (mediaUpload.busy) return;
    setSelectedFiles((files) => files.filter((media) => media.id !== id));
    if (selectedFileId === id) setSelectedFileId(null);
    setMediaError("");
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-8">
      <div className="min-w-0 space-y-6">
        <ProjectSaveControls
          title={title}
          onTitleChange={setTitle}
          onSave={saveDraft}
          state={saveState}
          dirty={dirty}
          projectId={projectId}
          signedIn={signedIn}
          authReady={authReady}
          hasLocalMedia={selectedFiles.length > 0}
        />
        <CategorySelector
          selected={selectedCategory}
          onChange={setSelectedCategory}
        />
        <PromptComposer
          prompt={prompt}
          category={category}
          onChange={setPrompt}
        />
        <MediaDropzone
          files={selectedFiles}
          selectedId={activeMedia?.id ?? activeAsset?.id}
          error={mediaError}
          onAdd={addFiles}
          onSelect={setSelectedFileId}
          onRemove={removeFile}
          onUpload={mediaUpload.upload}
          uploadStates={mediaUpload.uploadStates}
          busy={mediaUpload.busy}
          signedIn={signedIn}
          authReady={authReady}
          assets={mediaUpload.assets}
          assetError={mediaUpload.assetError}
          onRecover={mediaUpload.recover}
        />
        <GenerationSettings settings={settings} onChange={setSettings} />
        <GenerateButton disabled={!prompt.trim()} />
      </div>
      <CreationPreview
        category={category}
        settings={settings}
        prompt={prompt}
        media={activeMedia}
        asset={activeAsset}
      />
    </div>
  );
}
