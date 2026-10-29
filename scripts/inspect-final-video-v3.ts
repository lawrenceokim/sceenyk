import fs from "node:fs/promises";
import { inspectV3Package } from "../lib/final-video-generation-v3/preflight";

// Local files only. The CLI never loads .env or imports the database/transport.
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    process.stderr.write("Usage: npm run inspect:ugc-final-v3 -- <local-inspection-envelope.json>\n");
    process.exitCode = 1;
  } else {
    try {
      if ((await fs.stat(args[0])).size > 8 * 1024 * 1024) throw new Error("INSPECTION_INPUT_TOO_LARGE");
      const file = await fs.readFile(args[0], "utf8");
      if (Buffer.byteLength(file) > 8 * 1024 * 1024) throw new Error("INSPECTION_INPUT_TOO_LARGE");
      const envelope = JSON.parse(file);
      const report = inspectV3Package(envelope.package, { currentInput: envelope.currentInput, sourceRevision: envelope.sourceRevision,
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
