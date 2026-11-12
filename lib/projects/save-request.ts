import type { SaveProjectResult } from "./types";

export async function saveProjectRequest(input: unknown): Promise<SaveProjectResult> {
  // Never replay a save after an interrupted response; Studio retains its ID
  // for explicit same-project recovery. An auth redirect cannot become success.
  const response = await fetch("/api/projects/save", { method: "POST", redirect: "error", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const result: SaveProjectResult = await response.json();
  if (!response.ok || typeof result?.ok !== "boolean" || result.ok && !result.project?.id) throw new Error("PROJECT_SAVE_UNAVAILABLE");
  return result;
}
