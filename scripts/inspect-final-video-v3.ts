import fs from "node:fs/promises";
import { inspectV3Package } from "../lib/final-video-generation-v3/preflight";

// File envelopes stay offline; --project opts into local owner-scoped DB reads.
// Neither inspection path calls a provider or creates an execution.
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === "--project") {
    try {
      const { loadEnvConfig } = await import("@next/env"); loadEnvConfig(process.cwd(), true);
      const { v3LocalEnabled } = await import("../lib/final-video-generation-v3/runtime-config");
      const { V3Store } = await import("../lib/final-video-generation-v3/runtime-store");
      const { inspectRuntime } = await import("../lib/final-video-generation-v3/runtime-server");
      if (!v3LocalEnabled() || !process.env.UGC_V3_OPERATOR_USER_ID) throw new Error();
      const report = await inspectRuntime(await new V3Store().read(process.env.UGC_V3_OPERATOR_USER_ID, args[1]));
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } catch { process.stderr.write("V3_INSPECTION_FAILED: local project/setup unavailable.\n"); process.exitCode = 1; }
    return;
  }
  if (args.length !== 1) {
    process.stderr.write("Usage: npm run inspect:ugc-final-v3 -- <local-inspection-envelope.json>\n");
    process.exitCode = 1;
  } else {
    try {
      if ((await fs.stat(args[0])).size > 8 * 1024 * 1024) throw new Error("INSPECTION_INPUT_TOO_LARGE");
      const file = await fs.readFile(args[0], "utf8");
      if (Buffer.byteLength(file) > 8 * 1024 * 1024) throw new Error("INSPECTION_INPUT_TOO_LARGE");
      const envelope = JSON.parse(file);
      const report = envelope.runtimeQuote ? (await import("../lib/final-video-generation-v3/execution-inspector")).inspectExecutionEnvelope(envelope, new Date().toISOString())
        : inspectV3Package(envelope.package, { currentInput: envelope.currentInput, sourceRevision: envelope.sourceRevision,
        sourceCurrent: envelope.sourceCurrent, deliveryMedia: envelope.deliveryMedia, now: new Date().toISOString(),
        authorization: envelope.authorization, execution: envelope.execution });
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } catch {
      // Raw JSON/schema/errors may contain signed secrets and must never be printed.
      process.stderr.write("V3_INSPECTION_FAILED: invalid or unavailable local package evidence.\n");
      process.exitCode = 1;
    }
  }
}
void main();
