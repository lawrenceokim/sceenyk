import "server-only";
import { mkdir, open, lstat, unlink, link, readdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { StoryboardRow } from "./contract";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";
import { providerMetaSchema, storyboardDiagnosticSchema, type StoryboardProviderMeta, type StoryboardDiagnostic } from "./recovery-contract";

export const receiptSchema = z.strictObject({ output: z.string().max(250_000), receipt: z.record(z.string(), z.unknown()) });
export type StoryboardSavedResponse = z.infer<typeof receiptSchema>;
const rawSchema = z.strictObject({ id: z.unknown(), status: z.unknown(), model: z.unknown(), output: z.unknown(), usage: z.unknown() });
export type StoryboardRawResponse = z.infer<typeof rawSchema>;
function path(row: StoryboardRow, index: number) {
  const ids = [row.owner_user_id, row.project_id, row.job_id, row.id];
  if (ids.some(id => !z.uuid().safeParse(id).success) || ![0, 1].includes(index)) throw new Error("STORYBOARD_STORAGE_FAILED");
  return join(process.env.UGC_STORYBOARD_RECOVERY_DIR?.trim() || join(tmpdir(), "sceenyk-storyboard-recovery-v1"), `${ids.join("_")}_${index}.json`);
}
async function readJsonExact(target: string) {
  let stat;
  try { stat = await lstat(target); } catch (error) { if ((error as { code?: string }).code === "ENOENT") return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 1_600_000) throw new Error("STORYBOARD_STORAGE_FAILED");
  const file = await open(target, "r");
  try {
    const buffer = Buffer.alloc(stat.size + 1); let total = 0;
    while (total < buffer.length) { const read = await file.read(buffer, total, buffer.length - total, total); if (!read.bytesRead) break; total += read.bytesRead; }
    if (total !== stat.size) throw new Error("STORYBOARD_STORAGE_FAILED");
    return JSON.parse(buffer.subarray(0, total).toString("utf8")) as unknown;
  } finally { await file.close(); }
}
async function readJson(target: string): Promise<unknown> {
  const existing = await readJsonExact(target);
  if (existing !== null) return existing;
  let entries: string[];
  try { entries = await readdir(dirname(target)); } catch (error) { if ((error as { code?: string }).code === "ENOENT") return null; throw error; }
  const prefix = `${basename(target)}.`;
  const scratch = entries.filter(entry => entry.startsWith(prefix) && /^[a-f0-9-]{36}\.tmp$/i.test(entry.slice(prefix.length)));
  if (scratch.length > 8) throw new Error("STORYBOARD_STORAGE_FAILED");
  let recovered: unknown = null;
  for (const entry of scratch) {
    let value: unknown;
    try { value = await readJsonExact(join(dirname(target), entry)); }
    catch (error) { if (error instanceof SyntaxError) continue; throw error; }
    if (value === null) continue;
    if (recovered !== null && JSON.stringify(recovered) !== JSON.stringify(value)) throw new Error("STORYBOARD_RECOVERY_CHANGED");
    recovered = value;
  }
  return recovered;
}
export async function readStoryboardResponse(row: StoryboardRow, index: number) {
  const data = await readJson(path(row, index));
  return data === null ? null : receiptSchema.parse(data);
}
// Publish only a fully fsynced file. A crash cannot leave a partial canonical
// response; exclusive hard-link publication never replaces prior saved output.
async function writeJson(target: string, value: unknown) {
  const data = JSON.stringify(value);
  if (Buffer.byteLength(data) > 1_600_000) throw new Error("STORYBOARD_STORAGE_FAILED");
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.${randomUUID()}.tmp`;
  const file = await open(temp, "wx", 0o600);
  let written = false; let published = false;
  try {
    await file.writeFile(data); written = true; await file.sync(); await file.close();
    try { await link(temp, target); }
    catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
      if (JSON.stringify(await readJson(target)) !== data) throw new Error("STORYBOARD_RECOVERY_CHANGED");
    }
    published = true;
  } finally {
    await file.close().catch(() => {});
    // Preserve full returned bytes if fsync/publication fails. Read-only recovery
    // can reconcile a complete scoped temp file; partial JSON is never promoted.
    if (published || !written) await unlink(temp).catch(() => {});
  }
}
export async function stageStoryboardResponse(row: StoryboardRow, index: number, result: z.infer<typeof receiptSchema>) {
  await writeJson(path(row, index), receiptSchema.parse(result));
}
function sidecar(row: StoryboardRow, index: number, kind: string) { return path(row, index).replace(/\.json$/, `_${kind}.json`); }
export async function stageStoryboardMetadata(row: StoryboardRow, index: number, kind: "intent" | "headers" | "created", value: StoryboardProviderMeta) {
  await writeJson(sidecar(row, index, kind), providerMetaSchema.parse(value));
}
export async function stageStoryboardRawResponse(row: StoryboardRow, index: number, value: OpenAIResponse) {
  // Private raw output snapshot; exclude echoed input, instructions and error
  // messages. No extraction, JSON-storyboard parsing or DB call precedes this.
  await writeJson(sidecar(row, index, "raw"), { id: value.id ?? null, status: value.status ?? null,
    model: value.model ?? null, output: value.output ?? null, usage: value.usage ?? null });
}
export async function stageStoryboardDiagnostic(row: StoryboardRow, index: number, value: StoryboardDiagnostic) {
  if (!Number.isInteger(row.attempts) || row.attempts < 1 || row.attempts > 3) throw new Error("STORYBOARD_STORAGE_FAILED");
  await writeJson(sidecar(row, index, `failure_a${row.attempts}`), storyboardDiagnosticSchema.parse(value));
}
export async function readStoryboardRecovery(row: StoryboardRow, index: number) {
  let metadata: StoryboardProviderMeta | null = null; let diagnostic: StoryboardDiagnostic | null = null;
  for (const kind of ["intent", "headers", "created"]) {
    const value = await readJson(sidecar(row, index, kind));
    if (value !== null) metadata = providerMetaSchema.parse(value);
  }
  for (const attempt of [1, 2, 3]) {
    const value = await readJson(sidecar(row, index, `failure_a${attempt}`));
    if (value !== null) diagnostic = storyboardDiagnosticSchema.parse(value);
  }
  const raw = await readJson(sidecar(row, index, "raw"));
  return { response: await readStoryboardResponse(row, index), rawResponse: raw === null ? null : rawSchema.parse(raw), metadata, diagnostic };
}
export async function removeStoryboardResponses(row: StoryboardRow) {
  for (const index of [0, 1]) {
    for (const target of [path(row, index), ...["intent", "headers", "created", "raw", "failure_a1", "failure_a2", "failure_a3"].map(kind => sidecar(row, index, kind))]) {
      try { await unlink(target); } catch (error) { if ((error as { code?: string }).code !== "ENOENT") throw error; }
      let entries: string[];
      try { entries = await readdir(dirname(target)); } catch (error) { if ((error as { code?: string }).code === "ENOENT") continue; throw error; }
      const prefix = `${basename(target)}.`;
      const scratch = entries.filter(entry => entry.startsWith(prefix) && /^[a-f0-9-]{36}\.tmp$/i.test(entry.slice(prefix.length)));
      if (scratch.length > 100) throw new Error("STORYBOARD_STORAGE_FAILED");
      for (const entry of scratch) await unlink(join(dirname(target), entry)).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
  }
}
