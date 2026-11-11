"use server";

import { unstable_rethrow } from "next/navigation";
import { readOwnedProjectsGallery } from "@/lib/projects/gallery-server";
import type { GalleryReply } from "@/lib/projects/gallery-contract";

export async function projectsGalleryAction(input: unknown): Promise<GalleryReply> {
  try { return await readOwnedProjectsGallery(input); }
  catch (error) { unstable_rethrow(error); return { ok: false }; }
}
