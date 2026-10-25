import { loadEnvConfig } from "@next/env";
import { randomUUID, createHash } from "node:crypto";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--dry-run", "--execute"].includes(args[0])) throw new Error("USE_DRY_RUN_OR_EXECUTE");
  if (process.env.NODE_ENV === "production") throw new Error("DEVELOPMENT_ONLY");
  const names = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"] as const;
  const inherited = Object.fromEntries(names.map(name => [name, !!process.env[name]]));
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  console.info("CHARACTER_R2_PROBE_CONFIG", JSON.stringify(Object.fromEntries(names.map(name => [name,
    { present: !!process.env[name]?.trim(), inherited: inherited[name] }]))));
  // A dry run inspects presence only: no client, credentials validation, image,
  // database, network, AI provider, worker or storage mutation.
  if (args[0] === "--dry-run") return;
  const { default: sharp } = await import("sharp");
  const { putR2CharacterImage, headR2CharacterObject, readR2AnalysisMedia, deleteR2CharacterProbe } = await import("../lib/storage/r2");
  const { v5StorageDiagnostic } = await import("../lib/character-v5/storage-diagnostics");
  const key = `development-probes/character-v5/${randomUUID()}.png`;
  const bytes = await sharp({ create: { width: 128, height: 128, channels: 3, background: "#808080" } }).png().toBuffer();
  const hash = createHash("sha256").update(bytes).digest("hex");
  let verified = false; let cleaned = false;
  try {
    // Exact same server-side writer and stable Buffer used by V5 and Product.
    await putR2CharacterImage(key, bytes, AbortSignal.timeout(75_000));
    const object = await headR2CharacterObject(key, AbortSignal.timeout(30_000));
    if (!object || object.sizeBytes !== bytes.length || object.mimeType !== "image/png") throw new Error("PROBE_METADATA_MISMATCH");
    const stream = await readR2AnalysisMedia(key, object.etag, bytes.length, AbortSignal.timeout(30_000));
    const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break;
      size += part.value.length; if (size > bytes.length) throw new Error("PROBE_BODY_MISMATCH"); chunks.push(part.value); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (size !== bytes.length || createHash("sha256").update(Buffer.concat(chunks)).digest("hex") !== hash) throw new Error("PROBE_HASH_MISMATCH");
    verified = true;
  } catch (error) {
    console.error("CHARACTER_R2_PROBE_FAILED", JSON.stringify(v5StorageDiagnostic(error,
      { objectKeyPresent: true, providerOutputRecoverable: false })));
    process.exitCode = 1;
  } finally {
    // HEAD even after an uncertain PUT. Cleanup has its own bounded signal.
    try {
      const object = await headR2CharacterObject(key, AbortSignal.timeout(30_000));
      if (object) await deleteR2CharacterProbe(key, object.etag, AbortSignal.timeout(40_000));
      cleaned = true;
    } catch {
      console.error("CHARACTER_R2_PROBE_CLEANUP_UNCONFIRMED", JSON.stringify({ probeKey: key }));
      process.exitCode = 1;
    }
    console.info("CHARACTER_R2_PROBE_RESULT", JSON.stringify({ verified, cleaned, success: verified && cleaned }));
  }
}
main().catch(() => { console.error("CHARACTER_R2_PROBE_UNAVAILABLE: use --dry-run or --execute in development with private R2 configuration."); process.exitCode = 1; });
