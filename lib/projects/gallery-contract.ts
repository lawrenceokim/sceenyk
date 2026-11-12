import type { ProjectAsset } from "@/lib/media/types";
import type { ProjectCardStatus } from "./card-status";
import type { ProjectPage } from "./types";

export type GalleryCard = { revision: string; mediaRevision: string; status: ProjectCardStatus; preview: ProjectAsset | null; listingId?: string; active?: boolean };
export type GallerySnapshot = { data: ProjectPage; cards: Record<string, GalleryCard> };
export type GalleryReply = { ok: true; clerkUserId: string; data: ProjectPage; changed: Record<string, GalleryCard> } | { ok: false; retryable?: boolean };
