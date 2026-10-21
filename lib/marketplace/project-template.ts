import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { getOwnedProject } from "@/lib/projects/server";
import { readOwnedAsset } from "@/lib/media/server";
import { createListingSchema, type MarketplaceResult } from "./contract";
import { getOwnedMarketplaceListing, MarketplaceAccessError } from "./server";

export async function initializeProjectTemplate(input: unknown): Promise<MarketplaceResult> {
  const user = await ensureAppUser();
  const id = z.uuid().safeParse(input);
  if (!id.success) return { ok: false, code: "INVALID_INPUT", message: "Choose a saved project." };
  const project = await getOwnedProject(id.data);
  if (!project) return { ok: false, code: "NOT_FOUND", message: "Choose a project you own." };
  const existing = await getOwnedMarketplaceListing(project.id, true);
  if (existing) return { ok: true, listingId: existing.id, existing: true };
  // Prefill only text accepted by the existing public-content guard. Drafts stay
  // private and require the same explicit content/rights review before publishing.
  const title = createListingSchema.shape.title.safeParse(project.title);
  const description = createListingSchema.shape.description.safeParse(project.prompt.slice(0, 2000));
  const instructions = createListingSchema.shape.instructions.safeParse(project.prompt);
  const { data, error } = await createDatabaseClient().rpc("marketplace_initialize_template", {
    p_owner_user_id: user.id, p_project_id: project.id, p_listing_id: randomUUID(),
    p_title: title.success ? title.data : "Untitled template",
    p_description: description.success ? description.data : "A reusable starting point for your next project.",
    p_instructions: instructions.success ? instructions.data : "Add your own scene and media, then review the creative settings before generating.",
  });
  const result = z.object({ code: z.string(), listingId: z.uuid().optional() }).safeParse(data);
  if (error || !result.success) throw new MarketplaceAccessError();
  if ((result.data.code === "SAVED" || result.data.code === "EXISTS") && result.data.listingId)
    return { ok: true, listingId: result.data.listingId, existing: result.data.code === "EXISTS" };
  return { ok: false, code: "NOT_FOUND", message: "This project is unavailable." };
}

export async function getOwnedTemplateSource(input: unknown) {
  const user = await ensureAppUser();
  const listingId = z.uuid().parse(input);
  const { data, error } = await createDatabaseClient().rpc("marketplace_template_source", { p_listing_id: listingId, p_owner_user_id: user.id });
  if (error) throw new MarketplaceAccessError();
  if (!data) return null;
  const source = z.object({ projectId: z.uuid(), assetId: z.uuid(), kind: z.enum(["image", "video"]) }).parse(data);
  const read = await readOwnedAsset({ projectId: source.projectId, assetId: source.assetId });
  return { url: read.url, kind: source.kind };
}

export async function getOwnedProjectTemplates(input: unknown): Promise<Record<string, string>> {
  const user = await ensureAppUser();
  const ids = z.array(z.uuid()).max(120).parse(input);
  if (!ids.length) return {};
  const { data, error } = await createDatabaseClient().rpc("marketplace_project_templates", { p_owner_user_id: user.id, p_project_ids: ids });
  if (error) throw new MarketplaceAccessError();
  return z.record(z.uuid(), z.uuid()).parse(data);
}
