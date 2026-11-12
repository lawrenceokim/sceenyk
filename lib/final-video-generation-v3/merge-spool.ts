import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spoolFile } from "./runtime-media";

// Rejection also removes task-owned copies left by an interrupted local merge.
// This never accepts a source run ID or visits another task's recovery directory.
export async function purgeMergeSpool(taskId: string) {
  const root = path.dirname(await spoolFile(taskId, "video.mp4"));
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (["merge-result.json", "merge-processing.json"].includes(entry.name)) {
      if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("V3_DELETE_SCOPE");
      await fs.unlink(target); continue;
    }
    if (!/^merge-[a-zA-Z0-9]{6}$/.test(entry.name)) continue;
    if (!entry.isDirectory() || entry.isSymbolicLink() || path.dirname(path.resolve(target)) !== path.resolve(root)) throw new Error("V3_DELETE_SCOPE");
    const files = await fs.readdir(target, { withFileTypes: true });
    if (files.some(f => !f.isFile() || f.isSymbolicLink() || !/^(clip-[0-9]+\.mp4|merged\.mp4|validate\.mp4|list\.txt)$/.test(f.name))) throw new Error("V3_DELETE_SCOPE");
    for (const file of files) await fs.unlink(path.join(target, file.name));
    await fs.rmdir(target);
  }
}
