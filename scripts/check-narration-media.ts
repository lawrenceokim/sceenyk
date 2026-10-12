import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMediaCommand } from "../lib/media-preparation/ffmpeg";
import { probeNarration } from "../lib/voice-ai/storage";
import { createPreparationServer } from "../lib/media-preparation/http";
import { signWorkerRequest } from "../lib/media-preparation/auth";

async function main() {
const checks: string[] = [];
function check(name: string, value: unknown) { assert.ok(value, name); checks.push(name); }
const directory = await mkdtemp(join(tmpdir(), "sceenyk-audio-test-"));
const before = (await readdir(tmpdir())).filter(p => p.startsWith("sceenyk-narration-"));
try {
  const file = join(directory, "fixture.mp3");
  await runMediaCommand("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-f", "lavfi", "-i", "sine=frequency=440:duration=1.25", "-ar", "44100", "-ac", "1", "-b:a", "128k", file]);
  const timing = await probeNarration(await readFile(file));
  check("real FFprobe measures canonical integer milliseconds", Number.isInteger(timing.durationMs) && Math.abs(timing.durationMs - 1250) < 60);
  check("real MP3 sample rate and channel metadata", timing.sampleRate === 44100 && timing.channels === 1);
  await assert.rejects(() => probeNarration(Buffer.from("invalid audio")));
  check("malformed audio probe refuses completion", true);
  check("probe scratch directories removed on success and failure", JSON.stringify((await readdir(tmpdir())).filter(p => p.startsWith("sceenyk-narration-")).sort()) === JSON.stringify(before.sort()));
} finally { await rm(directory, { recursive: true, force: true }); }

const secret = "fixture-worker-secret-32-characters-long", nonces = new Set<string>();
let narrationCalls = 0, preparationCalls = 0;
const { server, drain } = createPreparationServer(secret, async () => { preparationCalls++; return { ready: true }; }, async nonce => {
  if (nonces.has(nonce)) return "replay";
  nonces.add(nonce); return "accepted";
}, async () => { narrationCalls++; return { ready: true }; });
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const origin = `http://127.0.0.1:${address.port}`;
const body = JSON.stringify({ generationJobId: randomUUID(), sceneExecutionId: randomUUID() });
function headers(path: string, value: string) {
  const timestamp = String(Date.now()), nonce = randomUUID();
  return { "Content-Type": "application/json", "x-worker-timestamp": timestamp, "x-worker-nonce": nonce, "x-worker-signature": signWorkerRequest(secret, "POST", path, timestamp, nonce, value) };
}
try {
  const auth = headers("/narrate", body);
  const first = await fetch(origin + "/narrate", { method: "POST", headers: auth, body });
  check("signed narration reaches only voice handler", first.status === 200 && narrationCalls === 1 && preparationCalls === 0);
  const replay = await fetch(origin + "/narrate", { method: "POST", headers: auth, body });
  check("narration exact replay denied before execution", replay.status === 409 && narrationCalls === 1);
  const wrongPath = await fetch(origin + "/prepare", { method: "POST", headers: headers("/narrate", body), body });
  check("cross-endpoint signature replay rejected", wrongPath.status === 401 && preparationCalls === 0);
  const browser = await fetch(origin + "/narrate", { method: "POST", headers: { ...headers("/narrate", body), Origin: "https://browser.invalid" }, body });
  check("browser origin cannot invoke narration", browser.status === 401 && narrationCalls === 1);
  const arbitrary = JSON.stringify({ ...JSON.parse(body), voiceId: "arbitrary" });
  const extra = await fetch(origin + "/narrate", { method: "POST", headers: headers("/narrate", arbitrary), body: arbitrary });
  check("signed narration rejects extra voice/task/output claims", extra.status === 400 && narrationCalls === 1);
  const unsigned = await fetch(origin + "/narrate", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  check("unsigned voice work is denied", unsigned.status === 401);
  const preparation = await fetch(origin + "/prepare", { method: "POST", headers: headers("/prepare", body), body });
  check("existing preparation endpoint remains functional", preparation.status === 200 && preparationCalls === 1);
  console.log(JSON.stringify({ checks: checks.length, passed: checks, realAudioDurationMs: "measured synthetic 1.25-second tone; no provider speech", realProviderCalls: 0 }));
} finally { drain(); server.closeAllConnections(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
