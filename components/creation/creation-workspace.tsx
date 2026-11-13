"use client";
import { V3WorkflowPreview } from "./v3-workflow-preview";
import { useStudioMode, useStudioModeIncompatibilities } from "@/components/workspace/studio-mode-provider";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import { StudioSkeleton } from "./studio-skeleton";
import { StudioProjectGuard } from "./studio-project-guard";

import { BeforeAccountAuth } from "@/components/auth/before-account-auth";
import { clearGuestDraft, readGuestDraft, rememberGuestDraft } from "./guest-draft";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CreativeLockSummary } from "@/lib/final-video-generation-v3/creative-lock-contract";
import { lockedProjectDraft } from "@/lib/final-video-generation-v3/creative-lock-view";
import { creationPreferencesAction } from "@/app/actions/settings";
import { defaultCreationPreferences, type CreationPreferences } from "@/lib/settings/contract";
import { useAuth } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AccountAction } from "@/components/account-action";
import { saveProjectAction } from "@/lib/cache/actions/projects";
import type { ProjectDraft, SavedProject } from "@/lib/projects/types";
import type { GenerationJob } from "@/lib/generation/types";
import { ProjectGeneration } from "./project-generation";
import { UgcGenerationControls } from "./ugc-generation-controls";
import { useUgcProgress } from "./use-ugc-progress";
import { UgcWorkflowPreview } from "./ugc-workflow-preview";
import { CategorySelector } from "./category-selector";
import { StudioReferenceSources } from "./studio-reference-sources";
import { collectStudioSources, prepareStudioInputs, studioReferenceImages } from "./studio-inputs";
import { ugcV1LimitMessages, ugcV1SelectionError } from "@/lib/projects/ugc-v1";
import type { CreationType, UgcType } from "@/lib/projects/options";
import { mediaKindForMime } from "@/lib/media/validation";
import { CreationPreview } from "./creation-preview";
import { StudioLayout } from "./studio-layout";
import { StudioPanelPortal, StudioPanelTarget, type StudioPreviewMedia } from "./studio-workspace-panels";
import { StudioInspectorSection } from "./studio-inspector-section";
import { StudioAspectControl } from "./studio-aspect-control";
import { StudioResolution } from "./studio-resolution";
import { projectVideoResolution } from "@/lib/projects/video-resolution";
import { requiresProDuration } from "@/lib/projects/pro-duration";
import { StudioGenerationProperties } from "./studio-generation-properties";
import { MediaDropzone } from "./media-dropzone";
import { PromptComposer } from "./prompt-composer";
import { ProjectSaveControls, type SaveState } from "./project-save-controls";
import { useProjectMedia } from "./use-project-media";
import type { ProjectAsset, StudioMediaRole } from "@/lib/media/types";
import type { ProjectOrigin } from "@/lib/marketplace/contract";
import Link from "next/link";
import {
  creationCategories,
  getMediaKind,
  type CategoryId,
  type CreationSettings,
  type LocalMedia,
} from "./creation-options";
import { AppNotification } from "@/components/notifications/app-notification";


type WorkspaceProps = {
  initialV3?: RuntimeDto;
  initialApprovedVideo?: string;
  initialProject?: SavedProject;
  viewerUserId?: string;
  initialAssets?: ProjectAsset[];
  initialMediaError?: string;
  initialGeneration?: GenerationJob | null;
  initialGenerationError?: string;
  initialOrigin?: ProjectOrigin | null;
  onProjectSaved?: (id: string) => void;
};

function AccountWorkspace(props: WorkspaceProps) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded) return <StudioSkeleton />;
  if (props.initialProject && userId !== props.viewerUserId) {
    return (
      <div className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card p-6 [.marketplace-configuration_>_&&]:[border:0]
      [.marketplace-configuration_>_&&]:rounded-[0] [.marketplace-configuration_>_&&]:[background:transparent]
      [.marketplace-configuration_>_&&]:pt-[16px] [.marketplace-configuration_>_&&]:pr-[0]
      [.marketplace-configuration_>_&&]:pb-[0] [.marketplace-configuration_>_&&]:pl-[0]
      [[data-workspace-shell]_&&]:[box-shadow:none] [.workspace-settings-inner_label&&]:min-h-[0]
      [.workspace-settings-inner_label&&]:gap-[8px] [.workspace-settings-inner_label&&]:pt-[12px]
      [.workspace-settings-inner_label&&]:pr-[12px] [.workspace-settings-inner_label&&]:pb-[12px]
      [.workspace-settings-inner_label&&]:pl-[12px] [.workspace-settings-inner_label&&_svg]:w-[18px]
      [.workspace-settings-inner_label&&_svg]:h-[18px]
    `} role="status">
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
  if (!props.initialProject && isSignedIn && userId) return <NewAccountWorkspace key={userId} userId={userId} onProjectSaved={props.onProjectSaved} />;
  return (
    <WorkspaceEditor
      key={`${userId ?? "visitor"}:${props.initialProject?.id ?? "new"}`}
      initialProject={props.initialProject}
      initialV3={props.initialV3}
      initialApprovedVideo={props.initialApprovedVideo}
      initialAssets={props.initialAssets}
      initialMediaError={props.initialMediaError}
      initialGeneration={props.initialGeneration}
      initialGenerationError={props.initialGenerationError}
      initialOrigin={props.initialOrigin}
      onProjectSaved={props.onProjectSaved}
      signedIn={!!isSignedIn}
      authReady={isLoaded}
    />
  );
}

function NewAccountWorkspace({ userId, onProjectSaved }: { userId: string; onProjectSaved?: (id: string) => void }) {
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
  if (!result) return <StudioSkeleton />;
  return <WorkspaceEditor signedIn authReady initialPreferences={result.preferences} preferencesUnavailable={result.unavailable} restoredDraft={guestDraft ?? undefined} onProjectSaved={onProjectSaved} />;
}

export function CreationWorkspace(props: WorkspaceProps) {
  const available = useAuthAvailable();
  return <StudioProjectGuard initialProjectId={props.initialProject?.id}>
    {(bindProject, fresh) => available ? (
      <AccountWorkspace {...(fresh ? {} : props)} onProjectSaved={bindProject} />
    ) : (
      <WorkspaceEditor signedIn={false} authReady onProjectSaved={bindProject} />
    )}
  </StudioProjectGuard>;
}

function WorkspaceEditor({
  initialProject,
  initialV3,
  initialApprovedVideo,
  initialAssets = [],
  initialMediaError = "",
  initialGeneration = null,
  initialGenerationError = "",
  initialOrigin = null,
  initialPreferences = defaultCreationPreferences,
  preferencesUnavailable = false,
  signedIn,
  authReady,
  restoredDraft,
  onProjectSaved,
}: {
  initialV3?: RuntimeDto;
  initialApprovedVideo?: string;
  restoredDraft?: NonNullable<ReturnType<typeof readGuestDraft>>;
  initialProject?: SavedProject;
  initialAssets?: ProjectAsset[];
  initialMediaError?: string;
  initialGeneration?: GenerationJob | null;
  initialGenerationError?: string;
  initialOrigin?: ProjectOrigin | null;
  initialPreferences?: CreationPreferences;
  preferencesUnavailable?: boolean;
  signedIn: boolean;
  authReady: boolean;
  onProjectSaved?: (id: string) => void;
}) {
  const [creativeLock, setCreativeLock] = useState<CreativeLockSummary | null>(initialV3?.creativeLock ?? null);
  const lockedDraft = lockedProjectDraft(initialV3?.creativeLock);
  const creativeLocked = !!creativeLock;
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>(
    lockedDraft?.category ?? initialProject?.category ?? restoredDraft?.brief.category ?? initialPreferences.category,
  );
  const [prompt, setPrompt] = useState(lockedDraft?.prompt ?? initialProject?.prompt ?? restoredDraft?.brief.prompt ?? "");
  const [creationType, setCreationType] = useState<CreationType>(
    lockedDraft?.creationType ?? (initialProject ? initialProject.creationType ?? "freestyle" : restoredDraft?.brief.creationType ?? "ugc"),
  );
  const [ugcType, setUgcType] = useState<UgcType>(lockedDraft?.ugcType ?? initialProject?.ugcType ?? restoredDraft?.brief.ugcType ?? "advertisement");
  const [title, setTitle] = useState(
    lockedDraft?.title ?? initialProject?.title ?? restoredDraft?.brief.title ?? "Untitled Project",
  );
  const [projectId, setProjectId] = useState(initialProject?.id ?? null);
  const [workflow, setWorkflow] = useState(initialProject?.workflow);
  const v3 = workflow === "final-video-v3";
  const { mode: studioMode } = useStudioMode();
  const proCharacters = studioMode === "pro" && (v3 || !projectId);
  const ugcProgress = useUgcProgress(projectId, signedIn && authReady && !v3);
  // Reuse the existing approval read; completed planning is not approval.
  // Preserve saved legacy settings until their approval status is known.
  const approvalUnknown = !!projectId && !v3 && (!authReady || ugcProgress.loading || !!ugcProgress.error);
  const approvedSettings = creativeLocked || !!initialV3?.runs.some(run => run.state === "approved") ||
    ugcProgress.job?.finalVideo?.review?.state === "approved";
  const preserveSettings = approvedSettings || approvalUnknown;
  const showUgcProgress = creationType === "ugc" && (ugcProgress.loading || ugcProgress.error && !ugcProgress.job ||
    !!ugcProgress.job);
  const attemptId = useRef(initialProject?.id ?? null);
  const saveInFlight = useRef<Promise<string | null> | null>(null);
  const persistedId = useRef(initialProject?.id ?? null);
  const [saveState, setSaveState] = useState<SaveState>(
    initialProject ? { status: "saved" } : { status: "idle" },
  );
  const [savedBrief, setSavedBrief] = useState<ProjectDraft | null>(
    lockedDraft ?? initialProject ?? null,
  );
  const [selection, setSelection] = useState<{ files: LocalMedia[]; error: string }>({ files: restoredDraft?.files ?? [], error: "" });
  const [referenceNameEdits, setReferenceNameEdits] = useState<Record<string, { value: string; savedValue: string }>>({});
  const selectedFiles = selection.files;
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const mediaError = selection.error;
  const [selectedSettings, setSettings] = useState<CreationSettings>(() => {
    return lockedDraft?.settings ?? initialProject?.settings ?? restoredDraft?.brief.settings ?? {
      aspectRatio: initialPreferences.aspectRatio,
      duration: "5",
      visualStyle: "Original",
      tone: "Storytelling",
    };
  });
  const settings: CreationSettings = preserveSettings ? selectedSettings : { ...selectedSettings, duration: "5", resolution: "480p" };
  const category =
    creationCategories.find((item) => item.id === selectedCategory) ??
    creationCategories[2];
  const brief: ProjectDraft = {
    title,
    category: selectedCategory,
    prompt,
    settings,
    creationType,
    ugcType,
  };
  const briefDirty =
    savedBrief !== null &&
    (title !== savedBrief.title ||
      creationType !== (savedBrief.creationType ?? "freestyle") ||
      ugcType !== (savedBrief.ugcType ?? "advertisement") ||
      prompt !== savedBrief.prompt ||
      selectedCategory !== savedBrief.category ||
      settings.aspectRatio !== savedBrief.settings.aspectRatio ||
      settings.duration !== savedBrief.settings.duration ||
      settings.visualStyle !== savedBrief.settings.visualStyle ||
      settings.tone !== savedBrief.settings.tone ||
      projectVideoResolution(settings.resolution) !== projectVideoResolution(savedBrief.settings.resolution));

  function saveDraft(): Promise<string | null> {
    if (creativeLocked) return Promise.resolve(projectId);
    if (saveInFlight.current) return saveInFlight.current;
    if (!signedIn) return Promise.resolve(null);
    setSaveState({ status: "saving" });
    // Keep this ID even if the response is lost after a committed first save.
    const id = attemptId.current ?? crypto.randomUUID();
    attemptId.current = id;
    const namesForSave = pendingReferenceNames;
    const saving = (async () => {
      try {
        const result = await saveProjectAction({
          ...brief,
          id,
          mode: persistedId.current ? "update" : "create",
          referenceNames: namesForSave,
        });
        if (!result.ok) {
          setSaveState({ status: "error", message: result.message });
          return null;
        }
        setProjectId(result.project.id);
        onProjectSaved?.(result.project.id);
        setWorkflow(result.project.workflow);
        persistedId.current = result.project.id;
        // Edits made while saving remain unsaved rather than being overwritten.
        setSavedBrief(brief);
        setReferenceNameEdits(current => {
          const next = { ...current };
          for (const sent of namesForSave) {
            const latest = next[sent.assetId];
            if (latest) next[sent.assetId] = { value: latest.value === sent.name ? sent.name.trim() : latest.value, savedValue: sent.name.trim() };
          }
          return next;
        });
        setSaveState({ status: "saved", savedAt: Date.now() });
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
    validateUpload: (media, assets) => {
      if (!media.studioRole || media.studioRole === "freestyle") return null;
      const retained = collectStudioSources(selectedFiles, assets);
      const references = media.studioRole === "character" ? retained.characters : retained.products;
      return studioReferenceImages(references).length > 1 && !(media.studioRole === "character" && proCharacters) ? ugcV1LimitMessages[media.studioRole] : null;
    },
    ensureProject: () =>
      persistedId.current ? Promise.resolve(persistedId.current) : saveDraft(),
    onPersisted: () => {
      // Media has its own existing busy/error signals. Only acknowledge confirmed
      // writes, and never clear an outstanding brief save or its failure.
      if (saveInFlight.current) return;
      setSaveState(current => current.status === "error" ? current : { status: "saved", savedAt: Date.now() });
    },
    onUploaded: (localId, assetId, role) => {
      setSelection(current => ({ ...current, files: current.files.filter(media => media.id !== localId) }));
      if (role === "freestyle") setSelectedFileId(assetId);
    },
  });
  const failedUpload = selectedFiles.map(file => mediaUpload.uploadStates[file.id]).find(state => state?.status === "failed");
  // Upload UGC images sequentially using the same private project-first service.
  // Failed files wait for explicit retry; changing type never cancels/clears them.
  useEffect(() => {
    if (creativeLocked || !signedIn || mediaUpload.busy) return;
    const retained = collectStudioSources(selectedFiles, mediaUpload.assets);
    const next = selectedFiles.find(file => file.studioRole && file.studioRole !== "freestyle" && !mediaUpload.uploadStates[file.id]
      && (file.studioRole === "character" && proCharacters || studioReferenceImages(file.studioRole === "character" ? retained.characters : retained.products).length <= 1));
    if (next) void mediaUpload.upload(next);
  }, [creativeLocked, signedIn, selectedFiles, mediaUpload, proCharacters]);
  const pendingReferenceNames = mediaUpload.assets.flatMap(asset => {
    const edit = referenceNameEdits[asset.id];
    return !asset.removedFromDraft && asset.status === "uploaded" && (asset.studioRole === "character" || asset.studioRole === "product") && edit && edit.value !== edit.savedValue
      ? [{ assetId: asset.id, name: edit.value }] : [];
  });
  const dirty = briefDirty || pendingReferenceNames.length > 0;
  const referenceNameValues = Object.fromEntries(Object.entries(referenceNameEdits).map(([id, edit]) => [id, edit.value]));
  const sourceAssets = creativeLock?.originalIds.length ? mediaUpload.assets.map(asset =>
    asset.studioRole === "character" || asset.studioRole === "product" ? { ...asset, removedFromDraft: !creativeLock.originalIds.includes(asset.id),
      referenceName: creativeLock.originalNames?.[asset.id] ?? asset.referenceName } : asset) : mediaUpload.assets;
  const sources = collectStudioSources(selectedFiles, sourceAssets, referenceNameValues);
  const studioInputs = prepareStudioInputs(brief, sources);
  const freestyle = sources.projectMedia;
  const activeMedia = creationType === "freestyle"
    ? freestyle.files.find(media => media.id === selectedFileId) ?? (selectedFileId ? undefined : freestyle.files[0])
    : undefined;
  const activeAsset =
    creationType === "freestyle" ? freestyle.assets.find(
      (asset) => asset.id === selectedFileId && asset.status === "uploaded",
    ) ??
    (!selectedFileId && !activeMedia
      ? freestyle.assets.find((asset) => asset.status === "uploaded")
      : undefined) : undefined;

  function addFiles(files: File[], studioRole: StudioMediaRole = "freestyle") {
    if (creativeLocked || !files.length) return;
    const accepted: LocalMedia[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const kind = getMediaKind(file);
      if (!kind || file.size === 0 || (studioRole !== "freestyle" && (kind !== "image" || mediaKindForMime(file.type) !== "image"))) {
        rejected.push(file.name);
        continue;
      }
      const id = crypto.randomUUID();
      accepted.push({ id, file, kind, studioRole, ...(studioRole !== "freestyle" ? { referenceId: id } : {}) });
    }
    setSelection((current) => {
      if (studioRole !== "freestyle") {
        const retained = collectStudioSources(current.files, mediaUpload.assets);
        const references = studioRole === "character" ? retained.characters : retained.products;
        const limitError = studioRole === "character" && proCharacters ? null : ugcV1SelectionError(studioRole, studioReferenceImages(references).length, files.length);
        if (limitError) {
          return { ...current, error: limitError };
        }
      }
      const updated = [...current.files];
      for (const media of accepted) {
        if (
          !updated.some(
            ({ file, studioRole: existingRole }) =>
              (existingRole ?? "freestyle") === studioRole &&
              file.name === media.file.name &&
              file.size === media.file.size &&
              file.lastModified === media.file.lastModified &&
              file.type === media.file.type,
          )
        )
          updated.push(media);
      }
      const error = rejected.length
        ? `Couldn’t add ${rejected.join(", ")}. ${studioRole === "freestyle" ? "Choose a non-empty image, video, or audio file." : "Choose a supported, non-empty image (PNG, JPEG, WebP, GIF, AVIF, BMP, HEIC or HEIF)."}`
        : "";
      return { files: updated, error };
    });
  }

  async function removeFile(id: string) {
    if (creativeLocked || mediaUpload.busy) return;
    const media = selectedFiles.find(file => file.id === id);
    if (media?.studioRole && media.studioRole !== "freestyle" && !(await mediaUpload.removeLocalReference(media))) return;
    setSelection(current => ({ files: current.files.filter(media => media.id !== id), error: "" }));
    if (selectedFileId === id) setSelectedFileId(null);
  }

  function changeReferenceName(asset: ProjectAsset, value: string) {
    if (creativeLocked) return;
    setReferenceNameEdits(current => ({ ...current, [asset.id]: { value, savedValue: current[asset.id]?.savedValue ?? asset.referenceName ?? "" } }));
  }

  async function removeReference(asset: ProjectAsset) {
    if (creativeLocked) return;
    if (await mediaUpload.removeReference(asset)) {
      setReferenceNameEdits(current => {
        const next = { ...current };
        delete next[asset.id];
        return next;
      });
    }
  }

  const characterCount = studioReferenceImages(collectStudioSources(selectedFiles, mediaUpload.assets).characters).length;
  const receiveCreativeLock = useCallback((next: CreativeLockSummary | null) => {
    setCreativeLock(next);
    const saved = lockedProjectDraft(next); if (!saved) return;
    setTitle(saved.title); setPrompt(saved.prompt); setCreationType(saved.creationType ?? "ugc"); setUgcType(saved.ugcType ?? "advertisement");
    setSelectedCategory(saved.category); setSettings(saved.settings); setSavedBrief(saved);
    setReferenceNameEdits({}); setSelection({ files: [], error: "" });
  }, [setCreativeLock, setTitle, setPrompt, setCreationType, setUgcType, setSelectedCategory, setSettings, setSavedBrief, setReferenceNameEdits, setSelection]);
  useStudioModeIncompatibilities(projectId, [...(characterCount > 1 ? ["Multiple characters"] : []), ...(requiresProDuration(settings.duration) ? ["Pro video duration"] : [])]);
  return (
    <BeforeAccountAuth.Provider value={() => {
      if (!signedIn && !initialProject) rememberGuestDraft(brief, selectedFiles);
    }}>
      <ProjectSaveControls
          readOnly={creativeLocked}
          title={title}
          onTitleChange={setTitle}
          onSave={saveDraft}
          state={saveState}
          dirty={dirty || selectedFiles.length > 0 || mediaUpload.assets.some(asset => !asset.removedFromDraft && asset.status !== "uploaded")}
          mediaBusy={mediaUpload.busy}
          mediaError={mediaUpload.assetError || failedUpload?.message}
          signedIn={signedIn}
          authReady={authReady}
          hasLocalMedia={selectedFiles.length > 0}
        >
        {({ project, save }) => (
          <ProjectGeneration
          projectId={v3 ? null : projectId}
          initialJob={initialGeneration}
          initialError={initialGenerationError}
          inputs={{
            prompt,
            category: selectedCategory,
            settings,
            assetIds: mediaUpload.assets
              .filter((asset) => asset.status === "uploaded" && !asset.removedFromDraft && (asset.studioRole ?? "freestyle") === "freestyle")
              .map((asset) => asset.id),
          }}
          hasLocalFiles={freestyle.files.length > 0}
          creationType={v3 ? "ugc" : creationType}
          ugcControls={studioInputs.creationType === "ugc" ? v3 ? undefined : <UgcGenerationControls
            progress={ugcProgress}
            projectId={projectId} revision={JSON.stringify([brief, studioInputs.generationValidation, mediaUpload.assets, referenceNameValues])}
            localIssues={studioInputs.generationValidation.issues} dirty={dirty || saveState.status === "saving"}
            hasLocalReferences={selectedFiles.some(file => file.studioRole === "character" || file.studioRole === "product")}
            mediaBusy={mediaUpload.busy} mediaError={!!mediaUpload.assetError} signedIn={signedIn} authReady={authReady}
          /> : undefined}
          mediaBusy={mediaUpload.busy}
          mediaError={!!mediaUpload.assetError}
          signedIn={signedIn}
          authReady={authReady}
        >
            {({ controls, output, status, label }) => (
              <StudioLayout
                approvedVideo={initialProject && initialApprovedVideo ? { projectId: initialProject.id, version: initialApprovedVideo } : undefined}
                media={studioInputs.creationType === "ugc" ? [...studioReferenceImages(studioInputs.characters), ...studioReferenceImages(studioInputs.products)].flatMap(({ local, asset }): StudioPreviewMedia[] =>
                  local ? [{ id: local.id, label: local.file.name, kind: "local", media: local }]
                    : asset?.status === "uploaded" ? [{ id: asset.id, label: asset.filename, kind: "asset", asset }] : []) : undefined}
                workflow={creationType === "ugc" ? v3 && projectId ? <V3WorkflowPreview key={projectId} projectId={projectId} initial={initialV3} assets={sourceAssets} onCreativeLock={receiveCreativeLock}
                  dirty={dirty || saveState.status === "saving" || mediaUpload.busy || selectedFiles.some(file => file.studioRole === "character" || file.studioRole === "product")}
                  revision={JSON.stringify([savedBrief, mediaUpload.assets])} /> : <><StudioPanelPortal panel="workflow">{controls}</StudioPanelPortal><UgcWorkflowPreview key={projectId ?? "new"} projectId={projectId ?? ""} progress={ugcProgress} /></> : undefined}
                sources={
                  <>
                    {preferencesUnavailable && <AppNotification role="status" className="text-caption text-muted-foreground">Creation defaults unavailable.</AppNotification>}
                    {restoredDraft?.missingFiles && (
                      <AppNotification role="status" className="text-caption text-warning-foreground">
                        Brief restored. Reselect local files.
                      </AppNotification>
                    )}
                    {initialOrigin && (
                      <section className={`
      studio-property space-y-2 [&&]:min-w-[0] [&&]:text-[length:var(--ui-text-control)]
      [&&_h2]:text-[length:var(--ui-text-panel)] [&&_h2]:font-[600] [&&_legend]:text-[length:var(--ui-text-panel)]
      [&&_legend]:font-[600] [&&_.text-body-sm]:text-[length:12px] [&&_.text-body-sm]:leading-[18px]
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
    `} aria-label="Adopted template">
                        <p className="font-semibold">Adopted from {initialOrigin.title}</p>
                        <p className="text-caption text-muted-foreground">Independent project</p>
                        <Link className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] nav-link text-link
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
    `} href={initialOrigin.acquisitionId ? `/purchases/${initialOrigin.acquisitionId}` : `/marketplace/${initialOrigin.listingId}`}>View template</Link>
                      </section>
                    )}
                    {project}
                    {creativeLock && creativeLock.state !== "locked" && <AppNotification role="status" data-creative-lock={creativeLock.state}>Saved creative inputs are read-only and need review. Your clips and videos are preserved; see Workflow for details.</AppNotification>}
                    <fieldset disabled={creativeLocked} className="min-w-0"><CategorySelector selected={creationType} onChange={value => { if (!creativeLocked) setCreationType(value); }} /></fieldset>
                    {studioInputs.creationType === "ugc" ? <>
                      <StudioReferenceSources label="Characters" addLabel="Add Character" role="character" references={studioInputs.characters}
                        readOnly={creativeLocked}
                        multiple={proCharacters} perCharacterSheets={v3 && (proCharacters || characterCount > 1)}
                        onAdd={files => addFiles(files, "character")} onRemoveLocal={removeFile} onRemoveAsset={removeReference} onNameChange={changeReferenceName}
                        onUpload={mediaUpload.upload} onRecover={mediaUpload.recover} uploadStates={mediaUpload.uploadStates}
                        busy={mediaUpload.busy || saveState.status === "saving"} signedIn={signedIn} authReady={authReady} />
                      <StudioReferenceSources label="Product / Props" addLabel="Add Product / Prop" role="product" references={studioInputs.products}
                        readOnly={creativeLocked}
                        onAdd={files => addFiles(files, "product")} onRemoveLocal={removeFile} onRemoveAsset={removeReference} onNameChange={changeReferenceName}
                        onUpload={mediaUpload.upload} onRecover={mediaUpload.recover} uploadStates={mediaUpload.uploadStates}
                        busy={mediaUpload.busy || saveState.status === "saving"} signedIn={signedIn} authReady={authReady} />
                      <StudioPanelTarget panel="location" />
                      {(mediaError || mediaUpload.assetError) && <AppNotification role="status" className="break-words text-xs text-destructive">{mediaError || mediaUpload.assetError}</AppNotification>}
                    </> : <MediaDropzone
          files={freestyle.files}
          selectedId={activeMedia?.id ?? activeAsset?.id}
          error={mediaError}
          onAdd={files => addFiles(files)}
          onSelect={setSelectedFileId}
          onRemove={removeFile}
          onUpload={mediaUpload.upload}
          uploadStates={mediaUpload.uploadStates}
          busy={mediaUpload.busy}
          signedIn={signedIn}
          authReady={authReady}
          assets={freestyle.assets}
          assetError={mediaUpload.assetError}
          onRecover={mediaUpload.recover}
        />}
                  </>
                }
                toolbar={
                  <>
                    <StudioAspectControl value={settings.aspectRatio}
                      disabled={creativeLocked}
                      onChange={aspectRatio => setSettings({ ...settings, aspectRatio })} />
                    <span className={`
      studio-toolbar-status [&&]:block [&&]:max-w-[calc(50%_-_70px)] [&&]:min-w-[0] [&&]:overflow-hidden [&&]:text-ellipsis
      [&&]:whitespace-nowrap [&&]:text-[length:12px] [&&]:text-[color:var(--muted-foreground)] max-599:[&&]:hidden
      container-max-530:[&&]:hidden
    `} role="status">{creationType === "ugc" ? "Preview" : label}</span>
                    {save}
                  </>
                }
                stage={
                  <>
                    {creationType === "ugc" ? <CreationPreview settings={settings} creationType={creationType} ugcType={ugcType} /> : output}
                    {creationType !== "ugc" && !showUgcProgress && (!output || activeMedia || activeAsset) && (
                      <CreationPreview settings={settings} creationType={creationType} ugcType={ugcType}
                        media={activeMedia} asset={activeAsset} />
                    )}
                    {creationType !== "ugc" && <div className="hidden md:block">{status}</div>}
                  </>
                }
                properties={
                  <>
                    <StudioInspectorSection title="Describe your scene"><PromptComposer
          readOnly={creativeLocked}
          prompt={prompt}
          category={category}
          onChange={setPrompt}
        /></StudioInspectorSection>
                    <StudioGenerationProperties settings={settings} onChange={setSettings} studioMode={studioMode}
                      readOnly={creativeLocked}
                      durationReadOnly={preserveSettings}
                      ugcType={creationType === "ugc" ? ugcType : undefined} onUgcTypeChange={setUgcType} />
                    <StudioInspectorSection title="Resolution"><StudioResolution
                      readOnly={preserveSettings}
                      imageCards={studioMode === "pro"}
                      value={projectVideoResolution(settings.resolution)}
                      onChange={resolution => setSettings({ ...settings, resolution })} />
                    </StudioInspectorSection>
                    <div className="md:hidden">{status}</div>
                    {creationType !== "ugc" && <><p className="text-xs text-muted-foreground">Free AI projects support the 5-second, 480p UGC V3 workflow. Existing Freestyle results remain available.</p><fieldset disabled className="min-w-0">{controls}</fieldset></>}
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
