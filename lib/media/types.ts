export type MediaKind = "image" | "video" | "audio";
export type ProjectAsset = {
  id: string;
  projectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: MediaKind;
  status: "pending" | "uploaded" | "rejected";
  createdAt: string;
};
export type MediaResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code:
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "UNAVAILABLE"
        | "NOT_READY"
        | "REJECTED"
        | "CONFLICT";
      message: string;
    };
export type UploadAuthorization = {
  asset: ProjectAsset;
  upload: {
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  } | null;
};
