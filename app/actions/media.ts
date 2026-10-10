"use server";

import { unstable_rethrow } from "next/navigation";
import {
  authorizeOwnedUpload,
  finalizeOwnedUpload,
  listOwnedAssets,
  MediaAccessError,
  readOwnedAsset,
} from "@/lib/media/server";
import { StorageConfigurationError } from "@/lib/storage/config";
import type { MediaResult } from "@/lib/media/types";

async function run<T>(operation: () => Promise<T>): Promise<MediaResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error: unknown) {
    unstable_rethrow(error);
    if (error instanceof MediaAccessError)
      return { ok: false, code: error.code, message: error.message };
    if (error instanceof StorageConfigurationError)
      return { ok: false, code: "UNAVAILABLE", message: error.message };
    console.error("Project media operation failed.", { code: "UNAVAILABLE" });
    return {
      ok: false,
      code: "UNAVAILABLE",
      message:
        "Media storage couldn’t be reached. Check your connection and try again.",
    };
  }
}
export async function authorizeMediaAction(input: unknown) {
  return run(() => authorizeOwnedUpload(input));
}
export async function finalizeMediaAction(input: unknown) {
  // Owner queries are uncached. The client merges this result and refreshes
  // metadata on activation; a route refresh here would discard other Files.
  return run(() => finalizeOwnedUpload(input));
}
export async function listMediaAction(projectId: unknown) {
  return run(() => listOwnedAssets(projectId));
}
export async function readMediaAction(input: unknown) {
  return run(() => readOwnedAsset(input));
}
