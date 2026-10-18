import { z } from "zod";
import { saveProjectSchema } from "@/lib/projects/validation";
import { projectTitleLimit } from "@/lib/projects/options";
import type { ProjectDraft } from "@/lib/projects/types";
import type { LocalMedia } from "./creation-options";

const key = "sceenyk-studio-auth-draft-v1";
const schema = z.strictObject({
  expiresAt: z.number().finite(),
  brief: saveProjectSchema.omit({ id: true, mode: true }).extend({ title: z.string().max(projectTitleLimit) }),
  localFileCount: z.number().int().min(0),
});
let localFiles: LocalMedia[] = [];
let memory: string | null = null;

export function rememberGuestDraft(brief: ProjectDraft, files: LocalMedia[]) {
  localFiles = files;
  memory = JSON.stringify({ brief, localFileCount: files.length, expiresAt: Date.now() + 30 * 60 * 1000 });
  try { sessionStorage.setItem(key, memory); } catch { /* Same-document auth can still restore from memory. */ }
}

export function readGuestDraft() {
  let raw = memory;
  try { raw = sessionStorage.getItem(key) ?? raw; } catch { /* Storage may be unavailable. */ }
  if (!raw || raw.length > 32_000) return null;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    if (!result.success || result.data.expiresAt < Date.now() || result.data.expiresAt > Date.now() + 30 * 60 * 1000) return null;
    return { ...result.data, files: localFiles, missingFiles: result.data.localFileCount > localFiles.length };
  } catch { return null; }
}

export function clearGuestDraft() {
  memory = null; localFiles = [];
  try { sessionStorage.removeItem(key); } catch { /* No persisted draft to remove. */ }
}
