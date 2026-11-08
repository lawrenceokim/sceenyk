import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { mergeManifest } from "./merge-runtime";
import { v3Digest } from "./identity";
import { mergeLocalFiles, validateMergedFile } from "./merge-media";
import type { FrozenPackage } from "./package";
import { privateAssetSchema, type Task } from "./runtime-contract";
import { readPrivate, publishPrivate, readSpool, saveSpool, spoolFile, bytesHash } from "./runtime-media";
import type { RuntimeWorkspace, V3Store } from "./runtime-store";
import { mergeStorageOperation } from "./merge-storage";

export async function mergeApprovedClips(store: V3Store, task: Task, doc: FrozenPackage, w: RuntimeWorkspace, signal: AbortSignal) {
  const manifest = mergeManifest(doc, w.runs);
  if (!w.source?.current || w.source.revision !== doc.sourceRevision || task.input.manifestHash !== manifest.hash ||
    task.input.packageHash !== doc.hash || v3Digest("merge-input", task.input.manifest) !== v3Digest("merge-input", manifest)) throw new Error("V3_MERGE_INPUTS_CHANGED");
  const stage = async (value: string) => {
    signal.throwIfAborted();
    await store.rpc("ugc_v3_merge_stage", { p_task: task.id, p_token: task.lease_token, p_stage: value });
  };
  await stage("validating");
  const receipt = await readSpool(task.id, "merge-result.json");
  if (receipt) {
    const saved = z.object({ asset: privateAssetSchema, manifestHash: z.string() }).parse(JSON.parse(receipt.toString("utf8")));
    if (saved.manifestHash !== manifest.hash || saved.asset.id !== task.id) throw new Error("V3_MERGE_INPUTS_CHANGED");
    await mergeStorageOperation("merge_readback", () => readPrivate(saved.asset.storageKey, saved.asset.etag, saved.asset.sizeBytes, signal, saved.asset.sha256));
    return JSON.parse(receipt.toString("utf8")) as Record<string, unknown>;
  }
  const expected = { resolution: manifest.resolution, aspectRatio: manifest.aspectRatio, durationMs: doc.source.storyboardContent.durationMs };
  const root = path.dirname(await spoolFile(task.id, "video.mp4")), temporary = await fs.mkdtemp(path.join(root, "merge-"));
  try {
    const savedProcessing = await readSpool(task.id, "merge-processing.json");
    const processing = savedProcessing ? z.object({ mode: z.string(), inputDurationMs: z.number().int().positive() }).parse(JSON.parse(savedProcessing.toString("utf8"))) : null;
    let bytes = await readSpool(task.id, "video.mp4"), mode = "recovered", inputDurationMs = processing?.inputDurationMs ?? manifest.clips.reduce((n, c) => n + c.asset.durationMs, 0);
    if (!bytes) {
      const inputs = [];
      for (const clip of manifest.clips) {
        const file = path.join(temporary, `clip-${clip.number}.mp4`);
        const source = await mergeStorageOperation("merge_read_source", () => readPrivate(clip.asset.storageKey, clip.asset.etag, clip.asset.sizeBytes, signal, clip.asset.sha256));
        if (bytesHash(source) !== clip.asset.sha256) throw new Error("V3_MEDIA_INTEGRITY_INVALID");
        await fs.writeFile(file, source, { mode: 0o600 });
        inputs.push({ file, durationMs: clip.durationMs });
      }
      await stage("merging");
      const output = path.join(temporary, "merged.mp4");
      const merged = await mergeLocalFiles(inputs, output, path.join(temporary, "list.txt"), expected, signal);
      mode = merged.mode; inputDurationMs = merged.inputDurationMs;
      bytes = await fs.readFile(output);
      await stage("saving");
      if (processing && processing.inputDurationMs !== inputDurationMs) throw new Error("V3_MERGE_INPUTS_CHANGED");
      if (!processing) await saveSpool(task.id, "merge-processing.json", Buffer.from(JSON.stringify({ mode, inputDurationMs })));
      // A lost lease may have published identical-input output. Keep the first valid bytes.
      try { await saveSpool(task.id, "video.mp4", bytes); }
      catch (error) { const existing = await readSpool(task.id, "video.mp4"); if (!existing) throw error; bytes = existing; mode = "recovered"; }
    }
    await stage("saving");
    const file = path.join(temporary, "validate.mp4"); await fs.writeFile(file, bytes, { mode: 0o600 });
    const metadata = await validateMergedFile(file, expected, inputDurationMs);
    const asset = await mergeStorageOperation("merge_publish", () => publishPrivate(w.project.owner_user_id, task.project_id, task.id, bytes!, metadata, signal));
    const document = { asset, packageId: doc.id, packageHash: doc.hash, manifestHash: manifest.hash,
      segments: manifest.clips.map(c => ({ runId: c.runId, assetHash: c.asset.sha256, segmentId: c.segmentId })),
      processing: { mode, inputDurationMs, plannedDurationMs: expected.durationMs } };
    await saveSpool(task.id, "merge-result.json", Buffer.from(JSON.stringify(document)));
    return document;
  } finally {
    // Only the directory created by this attempt; approved clip spools are never touched.
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
