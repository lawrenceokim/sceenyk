import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { purgeVideoSpool, readSpool } from "../lib/final-video-generation-v3/runtime-media";

async function main() {
  const previous = process.env.UGC_V3_RECOVERY_DIR, root = await fs.mkdtemp(path.join(os.tmpdir(), "v3-video-cleanup-"));
  const id = randomUUID(), dir = path.join(root, id), names = ["result.bytes", "video.mp4", "joined.mp4", `result.bytes.${randomUUID()}.tmp`, `video.mp4.${randomUUID()}.tmp`];
  process.env.UGC_V3_RECOVERY_DIR = root;
  try {
    await fs.mkdir(dir);
    for (const name of [...names, "acceptance.json", "completed.json"]) await fs.writeFile(path.join(dir, name), "fixture");
    await purgeVideoSpool(id); await purgeVideoSpool(id);
    assert.deepEqual((await fs.readdir(dir)).sort(), ["acceptance.json", "completed.json"]);
    assert.equal(await readSpool(id, "result.bytes"), null);
    await assert.rejects(purgeVideoSpool("../outside"), /V3_SPOOL_SCOPE/);
    console.info("3 scoped video cleanup checks passed; media and interrupted temporary copies removed; request audit preserved; zero network calls.");
  } finally {
    // Only known files in the verified freshly created directory; no recursive deletion.
    for (const name of [...names, "acceptance.json", "completed.json"]) await fs.unlink(path.join(dir, name)).catch(e => { if (e.code !== "ENOENT") throw e; });
    await fs.rmdir(dir); await fs.rmdir(root);
    if (previous === undefined) delete process.env.UGC_V3_RECOVERY_DIR; else process.env.UGC_V3_RECOVERY_DIR = previous;
  }

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
