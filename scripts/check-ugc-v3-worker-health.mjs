import fs from "node:fs";
import path from "node:path";
try {
  const heartbeat = path.join(process.env.UGC_V3_RECOVERY_DIR || ".ugc-v3-recovery", "worker-heartbeat.json");
  if (Date.now() - fs.statSync(heartbeat).mtimeMs > 60_000) process.exitCode = 1;
} catch { process.exitCode = 1; }
