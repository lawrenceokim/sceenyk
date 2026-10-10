import "server-only";
import { randomUUID } from "node:crypto";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import type { AssetRow } from "@/lib/db/types";
import {
  createReadUrl,
  createStorageKey,
  createUploadUrl,
  getStorageConfig,
  verifyStoredMedia,
} from "@/lib/storage/server";
import { assetReferenceSchema, authorizeUploadSchema } from "./validation";
import type { MediaResult, ProjectAsset, UploadAuthorization } from "./types";
import { z } from "zod";

export class MediaAccessError extends Error {
  constructor(
    readonly code: Extract<MediaResult<never>, { ok: false }>["code"],
    message: string,
  ) {
    super(message);
    this.name = "MediaAccessError";
  }
}
const unavailable = () =>
  new MediaAccessError(
    "UNAVAILABLE",
    "Your project media couldn’t be loaded. Please try again.",
  );
const notFound = () =>
  new MediaAccessError(
    "NOT_FOUND",
    "This project or media is unavailable. Open a project from your dashboard.",
  );
function toAsset(row: AssetRow): ProjectAsset {
  return {
    id: row.id,
    projectId: row.project_id,
    filename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    kind: row.media_type,
    status: row.upload_status,
    createdAt: row.created_at,
  };
}
async function ownedContext(projectId: string) {
  const user = await ensureAppUser();
  const database = createDatabaseClient();
  const { data, error } = await database
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (error) throw unavailable();
  if (!data) throw notFound();
  return { user, database };
}
async function ownedAsset(projectId: string, assetId: string) {
  const context = await ownedContext(projectId);
  const { data, error } = await context.database
    .from("project_assets")
    .select("*")
    .eq("id", assetId)
    .eq("project_id", projectId)
    .eq("owner_user_id", context.user.id)
    .maybeSingle();
  if (error) throw unavailable();
  if (!data) throw notFound();
  return { ...context, asset: data };
}
function parseReference(input: unknown) {
  const parsed = assetReferenceSchema.safeParse(input);
  if (!parsed.success)
    throw new MediaAccessError(
      "INVALID_INPUT",
      "Check your project and media selection.",
    );
  return parsed.data;
}
export async function listOwnedAssets(input: unknown): Promise<ProjectAsset[]> {
  const parsed = z.uuid().safeParse(input);
  if (!parsed.success) throw notFound();
  const { user, database } = await ownedContext(parsed.data);
  const { data, error } = await database
    .from("project_assets")
    .select("*")
    .eq("project_id", parsed.data)
    .eq("owner_user_id", user.id)
    .order("created_at")
    .order("id");
  if (error || !data) throw unavailable();
  return data.map(toAsset);
}
export async function authorizeOwnedUpload(
  input: unknown,
): Promise<UploadAuthorization> {
  const parsed = authorizeUploadSchema.safeParse(input);
  if (!parsed.success)
    throw new MediaAccessError(
      "INVALID_INPUT",
      "Choose a supported non-empty image, video or audio file with a valid MIME type and filename.",
    );
  const { projectId, requestId, filename, mimeType, sizeBytes, kind } =
    parsed.data;
  const { user, database } = await ownedContext(projectId);
  const config = getStorageConfig();
  if (sizeBytes > config.maxUploadBytes)
    throw new MediaAccessError(
      "INVALID_INPUT",
      `This upload exceeds the current technical safeguard of ${config.maxUploadBytes} bytes.`,
    );
  const findRequest = () =>
    database
      .from("project_assets")
      .select("*")
      .eq("project_id", projectId)
      .eq("owner_user_id", user.id)
      .eq("upload_request_id", requestId)
      .maybeSingle();
  let { data: asset, error } = await findRequest();
  if (error) throw unavailable();
  if (!asset) {
    const id = randomUUID();
    const inserted = await database
      .from("project_assets")
      .insert({
        id,
        owner_user_id: user.id,
        project_id: projectId,
        upload_request_id: requestId,
        storage_provider: "r2",
        storage_key: createStorageKey(user.id, projectId, id),
        original_filename: filename,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        media_type: kind,
      })
      .select("*")
      .single();
    if (inserted.error?.code === "23505")
      ({ data: asset, error } = await findRequest());
    else {
      asset = inserted.data;
      error = inserted.error;
    }
    if (error || !asset) throw unavailable();
  }
  if (
    asset.original_filename !== filename ||
    asset.mime_type !== mimeType ||
    asset.size_bytes !== sizeBytes ||
    asset.media_type !== kind
  )
    throw new MediaAccessError(
      "CONFLICT",
      "This upload request already belongs to a different file. Select the file again.",
    );
  if (asset.upload_status === "rejected")
    throw new MediaAccessError(
      "REJECTED",
      "This file failed storage validation. Remove it and choose a supported file.",
    );
  if (asset.upload_status === "uploaded")
    return { asset: toAsset(asset), upload: null };
  return {
    asset: toAsset(asset),
    upload: await createUploadUrl(asset.storage_key, mimeType, sizeBytes),
  };
}
export async function finalizeOwnedUpload(
  input: unknown,
): Promise<ProjectAsset> {
  const { projectId, assetId } = parseReference(input);
  const { user, database, asset } = await ownedAsset(projectId, assetId);
  if (asset.upload_status === "uploaded") return toAsset(asset);
  if (asset.upload_status === "rejected")
    throw new MediaAccessError(
      "REJECTED",
      "The stored file failed media validation. Choose a supported file.",
    );
  const verification = await verifyStoredMedia(
    asset.storage_key,
    asset.mime_type,
    asset.size_bytes,
  );
  if (verification.status === "missing")
    throw new MediaAccessError(
      "NOT_READY",
      "The file hasn’t reached storage. Retry the upload or select it again.",
    );
  const status = verification.status === "verified" ? "uploaded" : "rejected";
  const { data, error } = await database
    .from("project_assets")
    .update({
      upload_status: status,
      verified_etag:
        verification.status === "verified" ? verification.etag : null,
    })
    .eq("id", assetId)
    .eq("project_id", projectId)
    .eq("owner_user_id", user.id)
    .eq("upload_status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw unavailable();
  // Concurrent finalizers may already have committed the same verified result.
  const result = data ?? (await ownedAsset(projectId, assetId)).asset;
  if (result.upload_status !== "uploaded")
    throw new MediaAccessError(
      "REJECTED",
      "The stored file did not match its size or supported media format. Choose another file.",
    );
  return toAsset(result);
}
export async function readOwnedAsset(input: unknown) {
  const { projectId, assetId } = parseReference(input);
  const { asset } = await ownedAsset(projectId, assetId);
  if (asset.upload_status !== "uploaded" || !asset.verified_etag)
    throw new MediaAccessError(
      "NOT_READY",
      "This media isn’t ready to preview.",
    );
  return createReadUrl(asset.storage_key, asset.verified_etag, asset.mime_type);
}
