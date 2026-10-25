// Pure synthetic diagnostic and source-boundary checks; no environment loading,
// network, image generation, probe invocation or live recovery.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { v5StorageDiagnostic } from "../lib/character-v5/storage-diagnostics";
let checks = 0;
const check = (value: boolean, reason: string) => { assert(value, reason); checks++; };
const context = { slot: "face", objectKeyPresent: true, providerOutputRecoverable: true };
const secret = "UNSAFE_CREDENTIAL_TEST";
for (const [name, category] of [["AccessDenied", "authorization"], ["InvalidAccessKeyId", "authentication"],
  ["SignatureDoesNotMatch", "authentication"], ["NoSuchBucket", "bucket"], ["RequestTimeout", "timeout"],
  ["ECONNRESET", "network"], ["IncompleteBody", "body"], ["PermanentRedirect", "endpoint"]]) {
  const error = new Error("CHARACTER_STORAGE_FAILED", { cause: { name, message: `https://private.invalid/${secret}`,
    $metadata: { httpStatusCode: 403, requestId: secret }, $response: { body: secret } } });
  const safe = v5StorageDiagnostic(error, context);
  check(safe.category === category && safe.storageCode === name && safe.httpStatus === 403, `${name} survives wrapped cause`);
  check(!JSON.stringify(safe).includes(secret), `${name} redacts all raw fields`);
}
for (const message of ["Body is unusable: Body has already been consumed", "unsupported body type", "content-length mismatch"]) {
  check(v5StorageDiagnostic(new Error(message), context).category === "body", "classifies safe body reason");
}
const unknown = v5StorageDiagnostic({ name: secret, code: secret, message: secret, cause: { message: secret } }, context);
check(unknown.category === "unclassified" && !JSON.stringify(unknown).includes(secret), "unknown is explicit and redacted");
const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
check(v5StorageDiagnostic(cycle, context).category === "unclassified", "bounded cause traversal");
const source = (name: string) => readFileSync(name, "utf8");
const retrieval = source("lib/character-v5/output-retrieval.ts");
check(!/submitManualView|submitView|createIdentity|fetch\(/.test(retrieval), "retrieval cannot submit or bypass provider URL checks");
check(retrieval.includes("provider.viewStatus(") && retrieval.includes("provider.downloadImage("), "retrieval uses saved receipt and existing downloader");
check(retrieval.includes("proof.sha256 !== candidate.output_proof.sha256"), "retrieved bytes bind existing fingerprint");
const recovery = source("lib/character-v5/recovery.ts");
check(recovery.indexOf("await recoverV5Artifact") < recovery.indexOf("await retrieveV5CompletedBytes"), "existing private object is preferred");
check(!/submitManualView|submitView|createIdentity|randomUUID|\.insert\(|deleteR2/.test(recovery), "recovery cannot generate, allocate or delete");
check(recovery.includes('checkpoint("heartbeat")') && recovery.includes("!published"), "lease upkeep and committed publication retained");
const storage = source("lib/character-v5/storage.ts");
check(storage.includes("await putR2CharacterImage(key, bytes, signal)") && storage.includes("const proof = await v5OutputProof(id, bytes)"), "writer uses same stable Buffer and shared helper");
check(storage.indexOf("const existing = await recoverV5Artifact") < storage.indexOf("await putR2CharacterImage"), "verify before conditional PUT");
const r2 = source("lib/storage/r2.ts");
check(r2.includes('IfNoneMatch: "*"') && r2.includes("ContentLength: bytes.byteLength"), "shared immutable write and explicit size");
const probe = source("scripts/probe-character-r2.ts");
check(probe.indexOf('if (args[0] === "--dry-run") return') < probe.indexOf('await import("../lib/storage/r2")'), "dry run cannot access storage");
check(probe.includes("development-probes/character-v5/") && probe.includes("await putR2CharacterImage(key, bytes"), "isolated probe uses production helper");
check(probe.includes("finally {") && probe.includes("await deleteR2CharacterProbe("), "probe attempts cleanup even on uncertain PUT");
check(!/higgsfield|openai|ugc-worker|recoverCharacterV5Candidate/.test(probe), "probe has no provider, worker or candidate dependency");
console.info(JSON.stringify({ checks, network: 0, probeExecutions: 0, providerCalls: 0 }));
