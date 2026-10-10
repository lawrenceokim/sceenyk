"use client";

import { useEffect, useRef, useState } from "react";
import {
  authorizeMediaAction,
  finalizeMediaAction,
  listMediaAction,
} from "@/app/actions/media";
import {
  uploadFileDirectly,
  type UploadState,
} from "@/lib/media/upload-client";
import { mediaKindForMime, normalizeMediaMime } from "@/lib/media/validation";
import type { ProjectAsset } from "@/lib/media/types";
import type { LocalMedia } from "./creation-options";

export function useProjectMedia({
  initialAssets,
  initialError,
  projectId,
  ensureProject,
  onUploaded,
}: {
  initialAssets: ProjectAsset[];
  initialError: string;
  projectId: string | null;
  ensureProject: () => Promise<string | null>;
  onUploaded: (localId: string, assetId: string) => void;
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [assetError, setAssetError] = useState(initialError);
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const pendingAssets = useRef(new Map<string, ProjectAsset>());
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const reload = () => {
      if (document.visibilityState === "hidden") return;
      listMediaAction(projectId)
        .then((result) => {
          if (!active) return;
          if (!result.ok) {
            setAssetError(result.message);
            return;
          }
          setAssets((current) => {
            const merged = new Map(current.map((asset) => [asset.id, asset]));
            for (const asset of result.value) {
              // A response begun before finalization cannot roll ready media back.
              if (
                merged.get(asset.id)?.status === "uploaded" &&
                asset.status === "pending"
              )
                continue;
              merged.set(asset.id, asset);
            }
            return Array.from(merged.values());
          });
          setAssetError("");
        })
        .catch(() => {
          if (active)
            setAssetError(
              "Your project media couldn’t be refreshed. Please try again.",
            );
        });
    };
    reload();
    window.addEventListener("pageshow", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      active = false;
      window.removeEventListener("pageshow", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [projectId]);

  function remember(asset: ProjectAsset) {
    setAssets((current) => [
      ...current.filter((item) => item.id !== asset.id),
      asset,
    ]);
    setAssetError("");
  }
  async function upload(media: LocalMedia) {
    if (controller.current) return;
    const mimeType = normalizeMediaMime(media.file.type);
    if (mediaKindForMime(mimeType) !== media.kind || !media.file.size) {
      setUploadStates((current) => ({
        ...current,
        [media.id]: {
          status: "failed",
          message:
            "This format or MIME type isn’t supported for upload. Choose a supported image, video or audio file.",
        },
      }));
      return;
    }
    const attempt = new AbortController();
    controller.current = attempt;
    setBusy(true);
    attempt.signal.addEventListener(
      "abort",
      () => {
        if (controller.current === attempt) {
          controller.current = null;
          setBusy(false);
        }
        setUploadStates((current) => ({
          ...current,
          [media.id]: {
            status: "failed",
            message:
              "Upload interrupted. Retry when you return to this project.",
          },
        }));
      },
      { once: true },
    );
    const state = (next: UploadState) => {
      if (!attempt.signal.aborted)
        setUploadStates((current) => ({ ...current, [media.id]: next }));
    };
    state({ status: "preparing" });
    try {
      const projectId = await ensureProject();
      if (attempt.signal.aborted) return;
      if (!projectId)
        throw new Error(
          "Save your project successfully before uploading media.",
        );
      // Native history updates preserve local Files while making refresh reopen the project.
      if (location.pathname === "/create")
        window.history.replaceState(null, "", `/projects/${projectId}`);
      let asset = pendingAssets.current.get(media.id);
      if (asset) {
        state({ status: "verifying" });
        const recovered = await finalizeMediaAction({
          projectId,
          assetId: asset.id,
        });
        if (attempt.signal.aborted) return;
        if (recovered.ok) {
          remember(recovered.value);
          onUploaded(media.id, recovered.value.id);
          return;
        }
        if (recovered.code !== "NOT_READY") throw new Error(recovered.message);
      }
      state({ status: "preparing" });
      const authorized = await authorizeMediaAction({
        projectId,
        requestId: media.id,
        filename: media.file.name,
        sizeBytes: media.file.size,
        mimeType,
        kind: media.kind,
      });
      if (attempt.signal.aborted) return;
      if (!authorized.ok) throw new Error(authorized.message);
      asset = authorized.value.asset;
      pendingAssets.current.set(media.id, asset);
      if (authorized.value.upload) {
        state({ status: "uploading" });
        await uploadFileDirectly(
          media.file,
          authorized.value.upload,
          (progress) => state({ status: "uploading", progress }),
          attempt.signal,
        );
        if (attempt.signal.aborted) return;
        state({ status: "verifying" });
        const finalized = await finalizeMediaAction({
          projectId,
          assetId: asset.id,
        });
        if (attempt.signal.aborted) return;
        if (!finalized.ok) throw new Error(finalized.message);
        asset = finalized.value;
      }
      remember(asset);
      onUploaded(media.id, asset.id);
    } catch (error: unknown) {
      state({
        status: "failed",
        message:
          error instanceof Error
            ? error.message
            : "Upload failed. Please try again.",
      });
    } finally {
      if (!attempt.signal.aborted) setBusy(false);
      if (controller.current === attempt) controller.current = null;
    }
  }
  async function recover(asset: ProjectAsset) {
    if (controller.current) return;
    const attempt = new AbortController();
    controller.current = attempt;
    setBusy(true);
    attempt.signal.addEventListener(
      "abort",
      () => {
        if (controller.current === attempt) {
          controller.current = null;
          setBusy(false);
          setAssetError("Upload check interrupted. Please try again.");
        }
      },
      { once: true },
    );
    setAssetError("Checking stored media…");
    try {
      const result = await finalizeMediaAction({
        projectId: asset.projectId,
        assetId: asset.id,
      });
      if (attempt.signal.aborted) return;
      if (result.ok) remember(result.value);
      else setAssetError(result.message);
    } catch {
      if (!attempt.signal.aborted)
        setAssetError("Stored media couldn’t be checked. Please try again.");
    } finally {
      if (!attempt.signal.aborted) setBusy(false);
      if (controller.current === attempt) controller.current = null;
    }
  }
  return { assets, assetError, uploadStates, busy, upload, recover };
}
