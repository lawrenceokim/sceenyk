"use client";

import { BeforeAccountAuth } from "@/components/auth/before-account-auth";
import { clearGuestDraft, readGuestDraft, rememberGuestDraft } from "./guest-draft";
import { useEffect, useRef, useState } from "react";
import { creationPreferencesAction } from "@/app/actions/settings";
import { defaultCreationPreferences, type CreationPreferences } from "@/lib/settings/contract";
import { useAuth } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AccountAction } from "@/components/account-action";
import { saveProjectAction } from "@/app/actions/projects";
import type { ProjectDraft, SavedProject } from "@/lib/projects/types";
import type { GenerationJob } from "@/lib/generation/types";
import { ProjectGeneration } from "./project-generation";
import { CategorySelector } from "./category-selector";
import { CreationPreview } from "./creation-preview";
import { StudioLayout } from "./studio-layout";
import { StudioInspectorSection } from "./studio-inspector-section";
import { StudioAspectControl } from "./studio-aspect-control";
import { GenerationSettings } from "./generation-settings";
import { MediaDropzone } from "./media-dropzone";
import { PromptComposer } from "./prompt-composer";
import { ProjectSaveControls, type SaveState } from "./project-save-controls";
import { useProjectMedia } from "./use-project-media";
import type { ProjectAsset } from "@/lib/media/types";
import type { ProjectOrigin } from "@/lib/marketplace/contract";
import Link from "next/link";
import {
  creationCategories,
  getMediaKind,
  type CategoryId,
  type CreationSettings,
  type LocalMedia,
} from "./creation-options";

type WorkspaceProps = {
  initialProject?: SavedProject;
  viewerUserId?: string;
  initialAssets?: ProjectAsset[];
  initialMediaError?: string;
  initialGeneration?: GenerationJob | null;
  initialGenerationError?: string;
  initialOrigin?: ProjectOrigin | null;
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
  if (!props.initialProject && !isLoaded) return <p role="status">Opening your creation workspace…</p>;
  if (!props.initialProject && isSignedIn && userId) return <NewAccountWorkspace key={userId} userId={userId} />;
  return (
    <WorkspaceEditor
      key={`${userId ?? "visitor"}:${props.initialProject?.id ?? "new"}`}
      initialProject={props.initialProject}
      initialAssets={props.initialAssets}
      initialMediaError={props.initialMediaError}
      initialGeneration={props.initialGeneration}
      initialGenerationError={props.initialGenerationError}
      initialOrigin={props.initialOrigin}
      signedIn={!!isSignedIn}
      authReady={isLoaded}
    />
  );
}

function NewAccountWorkspace({ userId }: { userId: string }) {
  const [guestDraft] = useState(readGuestDraft);
  useEffect(() => { clearGuestDraft(); }, []);
  const [result, setResult] = useState<{ preferences: CreationPreferences; unavailable: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    void creationPreferencesAction().then(response => {
      if (!active) return;
      if (response.ok && response.data.clerkUserId === userId) setResult({ preferences: response.data.preferences, unavailable: false });
      else setResult({ preferences: defaultCreationPreferences, unavailable: true });
    }).catch(() => { if (active) setResult({ preferences: defaultCreationPreferences, unavailable: true }); });
    return () => { active = false; };
  }, [userId]);
  if (!result) return <p role="status">Loading your creation defaults…</p>;
  return <>{result.unavailable && <p role="status" className="mb-4 text-body-sm text-muted-foreground">Your saved creation defaults are unavailable. This new draft uses standard defaults; you can adjust them below.</p>}<WorkspaceEditor signedIn authReady initialPreferences={result.preferences} restoredDraft={guestDraft ?? undefined} /></>;
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
  initialGeneration = null,
  initialGenerationError = "",
  initialOrigin = null,
  initialPreferences = defaultCreationPreferences,
  signedIn,
  authReady,
  restoredDraft,
}: {
  restoredDraft?: NonNullable<ReturnType<typeof readGuestDraft>>;
  initialProject?: SavedProject;
  initialAssets?: ProjectAsset[];
  initialMediaError?: string;
  initialGeneration?: GenerationJob | null;
  initialGenerationError?: string;
  initialOrigin?: ProjectOrigin | null;
  initialPreferences?: CreationPreferences;
  signedIn: boolean;
  authReady: boolean;
}) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>(
    initialProject?.category ?? restoredDraft?.brief.category ?? initialPreferences.category,
  );
  const [prompt, setPrompt] = useState(initialProject?.prompt ?? restoredDraft?.brief.prompt ?? "");
  const [title, setTitle] = useState(
    initialProject?.title ?? restoredDraft?.brief.title ?? "Untitled Project",
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
  const [selectedFiles, setSelectedFiles] = useState<LocalMedia[]>(restoredDraft?.files ?? []);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [settings, setSettings] = useState<CreationSettings>(
    initialProject?.settings ?? restoredDraft?.brief.settings ?? {
      aspectRatio: initialPreferences.aspectRatio,
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
    <BeforeAccountAuth.Provider value={() => {
      if (!signedIn && !initialProject) rememberGuestDraft(brief, selectedFiles);
    }}>
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
        >
        {({ project, save }) => (
          <ProjectGeneration
          projectId={projectId}
          initialJob={initialGeneration}
          initialError={initialGenerationError}
          inputs={{
            prompt,
            category: selectedCategory,
            settings,
            assetIds: mediaUpload.assets
              .filter((asset) => asset.status === "uploaded")
              .map((asset) => asset.id),
          }}
          hasLocalFiles={selectedFiles.length > 0}
          mediaBusy={mediaUpload.busy}
          mediaError={!!mediaUpload.assetError}
          signedIn={signedIn}
          authReady={authReady}
        >
            {({ controls, output, status, label }) => (
              <StudioLayout
                sources={
                  <>
                    {restoredDraft?.missingFiles && (
                      <p role="status" className="text-caption text-warning-foreground">
                        Your brief was restored. Select your local files again after signing in;
                        files are not stored in the browser draft.
                      </p>
                    )}
                    {initialOrigin && (
                      <section className="studio-property space-y-2" aria-label="Adopted template">
                        <p className="font-semibold">Adopted from {initialOrigin.title}</p>
                        <p className="text-caption text-muted-foreground">Your independent project. Add your own media.</p>
                        <Link className="nav-link text-link" href={`/marketplace/${initialOrigin.listingId}`}>View template</Link>
                      </section>
                    )}
                    {project}
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
                  </>
                }
                toolbar={
                  <>
                    <StudioAspectControl value={settings.aspectRatio}
                      onChange={aspectRatio => setSettings({ ...settings, aspectRatio })} />
                    <span className="studio-toolbar-status" role="status">{label}</span>
                    {save}
                  </>
                }
                stage={
                  <>
                    {output}
                    {(!output || activeMedia || activeAsset) && (
                      <CreationPreview category={category} settings={settings} prompt={prompt}
                        media={activeMedia} asset={activeAsset} />
                    )}
                    {status}
                  </>
                }
                properties={
                  <>
                    <StudioInspectorSection title="Creation type"><CategorySelector
          selected={selectedCategory}
          onChange={setSelectedCategory}
        /></StudioInspectorSection>
                    <StudioInspectorSection title="Describe your scene"><PromptComposer
          prompt={prompt}
          category={category}
          onChange={setPrompt}
        /></StudioInspectorSection>
                    <StudioInspectorSection title="Style & pacing"><GenerationSettings settings={settings} onChange={setSettings} /></StudioInspectorSection>
                    <StudioInspectorSection title="Narration"><section className="studio-property">
                      <p className="mt-2 text-caption text-muted-foreground">Include any narration direction in your prompt.</p>
                    </section></StudioInspectorSection>
                    {controls}
                  </>
                }
              />
            )}
          </ProjectGeneration>
        )}
      </ProjectSaveControls>
    </BeforeAccountAuth.Provider>
  );
}
