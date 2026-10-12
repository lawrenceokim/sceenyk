// Real HTTP server and Node client. Processor is an explicit fixture: no hosted
// writes, private media downloads or paid provider submissions in this suite.
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { once } from "node:events";
import { createPreparationServer } from "../lib/media-preparation/http";
import { signWorkerRequest, verifyWorkerRequest, workerAuthWindowMs, workerSharedSecret } from "../lib/media-preparation/auth";
import { workerConnection } from "../lib/media-preparation/config";
import { PreparationError } from "../lib/media-preparation/contract";

async function main() {
  const checks: string[] = [];
  const check = (name: string, value: unknown) => { assert.ok(value, name); checks.push(name); };
  const secret = randomBytes(32).toString("hex");
  const body = JSON.stringify({ generationJobId: randomUUID(), sceneExecutionId: randomUUID() });
  let calls = 0, failure: Error | undefined;
  let inspections = 0;
  let hold: Promise<void> | undefined;
  // Explicit HTTP-test fixture. Durable SQL/restart checks live in check-worker-replay.mjs.
  const accepted = new Set<string>();
  let registrationFailure = false;
  let registrations = 0;
  const { server, drain } = createPreparationServer(secret, async input => {
    calls++;
    assert.deepEqual(input, JSON.parse(body));
    if (failure) throw failure;
    await hold;
    return { ready: true };
  }, async nonce => {
    registrations++;
    if (registrationFailure) throw new Error("fixture-private-database-diagnostic");
    if (accepted.has(nonce)) return "replay";
    accepted.add(nonce);
    return "accepted";
  }, undefined, async input => {
    inspections++;
    assert.deepEqual(input, JSON.parse(body));
    return { ready: true };
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const send = (options: { body?: string; timestamp?: string; nonce?: string; signature?: string; method?: string; path?: string; headers?: Record<string, string>; unsigned?: boolean } = {}) => new Promise<{ status: number; body: string; cors: string | string[] | undefined }>((resolve, reject) => {
    const bytes = options.body ?? body;
    const timestamp = options.timestamp ?? String(Date.now());
    const nonce = options.nonce ?? randomUUID();
    const method = options.method ?? "POST", path = options.path ?? "/prepare";
    const request = httpRequest(origin + path, { method, headers: {
      "Content-Type": "application/json",
      ...(options.unsigned ? {} : { "x-worker-timestamp": timestamp, "x-worker-nonce": nonce, "x-worker-signature": options.signature ?? signWorkerRequest(secret, method, path, timestamp, nonce, bytes) }),
      ...options.headers,
    } }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString(), cors: response.headers["access-control-allow-origin"] }));
    });
    request.on("error", reject);
    request.end(bytes);
  });
  const saved = { secret: process.env.WORKER_SHARED_SECRET, publicSecret: process.env.NEXT_PUBLIC_WORKER_SHARED_SECRET, url: process.env.MEDIA_WORKER_URL, nodeEnv: process.env.NODE_ENV };
  try {
    const health = await fetch(origin + "/health");
    check("public health contains only process liveness", health.status === 200 && JSON.stringify(await health.json()) === '{"ok":true}' && health.headers.get("cache-control") === "no-store");
    check("unsigned request rejected", (await send({ unsigned: true })).status === 401);
    check("legacy bearer token rejected", (await send({ unsigned: true, headers: { Authorization: `Bearer ${secret}` } })).status === 401);
    check("incorrect signature rejected", (await send({ signature: "0".repeat(64) })).status === 401);
    for (const signature of ["x", "a".repeat(63), "a".repeat(65), "G".repeat(64)]) assert.equal((await send({ signature })).status, 401);
    check("malformed signatures safely rejected", true);
    check("expired timestamp rejected", (await send({ timestamp: String(Date.now() - workerAuthWindowMs - 1000) })).status === 401);
    check("future timestamp outside window rejected", (await send({ timestamp: String(Date.now() + workerAuthWindowMs + 1000) })).status === 401);
    check("malformed timestamp rejected", (await send({ timestamp: "not-a-time" })).status === 401);
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const signature = signWorkerRequest(secret, "POST", "/prepare", timestamp, nonce, body);
    check("HMAC matches independent protocol implementation including nonce", signature === createHmac("sha256", secret).update(Buffer.concat([Buffer.from(`POST\n/prepare\n${timestamp}\n${nonce}\n`), Buffer.from(body)])).digest("hex"));
    check("modified exact body bytes rejected", (await send({ body: body + " ", timestamp, nonce, signature })).status === 401);
    check("modified nonce invalidates signature", (await send({ timestamp, nonce: randomUUID(), signature })).status === 401);
    for (const value of ["", "bad", randomUUID().toUpperCase(), randomUUID() + "," + randomUUID()]) assert.equal((await send({ nonce: value })).status, 401);
    check("missing malformed and duplicate nonce values rejected", true);
    check("modified method rejected", !verifyWorkerRequest(secret, "PUT", "/prepare", timestamp, nonce, signature, Buffer.from(body)) && (await send({ method: "PUT", timestamp, nonce, signature })).status === 401);
    check("modified path and query rejected", !verifyWorkerRequest(secret, "POST", "/other", timestamp, nonce, signature, Buffer.from(body)) && (await send({ path: "/prepare?x=1", timestamp, nonce, signature })).status === 401);
    check("browser origin rejected even with valid signature", (await send({ headers: { Origin: "https://browser.invalid" } })).status === 401);
    check("browser fetch metadata rejected", (await send({ headers: { "Sec-Fetch-Site": "cross-site" } })).status === 401);
    const preflight = await send({ method: "OPTIONS", unsigned: true, headers: { Origin: "https://browser.invalid", "Access-Control-Request-Method": "POST" } });
    check("CORS preflight rejected without allow-origin", preflight.status === 401 && !preflight.cors);
    for (const extra of [{ ownerUserId: randomUUID() }, { startMs: 0 }, { runId: "claimed" }, { storageKey: "private" }, { url: "https://r2.invalid" }, { instructions: "encode" }, { credentials: "private" }]) assert.equal((await send({ body: JSON.stringify({ ...JSON.parse(body), ...extra }) })).status, 400);
    check("signed ownership/time/key/URL/run/instruction/credential claims rejected", true);
    check("signed malformed JSON rejected", (await send({ body: "{" })).status === 400);
    check("signed oversized request rejected", (await send({ body: " ".repeat(4097) })).status === 413);
    check("invalid requests never register nonces or enter processor", calls === 0 && registrations === 0);
    const valid = await send();
    check("valid identifier-only signed request accepted", valid.status === 200 && valid.body === '{"ready":true}' && calls === 1);
    // Node's real fetch transport is also the Inngest client's transport.
    const nodeResponse = await fetch(origin + "/prepare", { method: "POST", headers: { "Content-Type": "application/json", "x-worker-timestamp": timestamp, "x-worker-nonce": nonce, "x-worker-signature": signature }, body });
    check("server-to-server fetch accepted", nodeResponse.status === 200);
    await nodeResponse.body?.cancel();
    const beforeReplay = calls;
    const replay = await send({ timestamp, nonce, signature });
    check("exact immediate replay rejected with safe code", replay.status === 409 && replay.body === '{"code":"REPLAY_DETECTED"}' && calls === beforeReplay);
    await new Promise(resolve => setTimeout(resolve, 50));
    check("later replay rejected without processing", (await send({ timestamp, nonce, signature })).status === 409 && calls === beforeReplay);
    const concurrentNonce = randomUUID();
    const duplicates = await Promise.all([send({ nonce: concurrentNonce, timestamp }), send({ nonce: concurrentNonce, timestamp })]);
    check("concurrent duplicates have exactly one accepted request", duplicates.map(r => r.status).sort().join() === "200,409" && calls === beforeReplay + 1);
    registrationFailure = true;
    const dbFailure = await send();
    check("replay registry outage fails closed without private diagnostics", dbFailure.status === 503 && dbFailure.body === '{"code":"PREPARATION_UNAVAILABLE"}' && calls === beforeReplay + 1);
    registrationFailure = false;
    failure = new Error("fixture-private-diagnostic");
    const failedNonce = randomUUID();
    const error = await send({ nonce: failedNonce });
    check("unexpected errors do not expose private diagnostics", error.status === 503 && error.body === '{"code":"PREPARATION_UNAVAILABLE"}');
    check("failed processor does not release accepted nonce", (await send({ nonce: failedNonce })).status === 409);
    failure = new PreparationError("SOURCE_UNAVAILABLE");
    check("persisted ownership/state failure is denied", (await send()).status === 403);
    check("composition inspection rejects unsigned requests", (await send({ path: "/inspect", unsigned: true })).status === 401);
    check("composition inspection rejects browser-origin signed requests", (await send({ path: "/inspect", headers: { Origin: "https://browser.invalid" } })).status === 401);
    check("composition inspection rejects arbitrary timeline fields", (await send({ path: "/inspect", body: JSON.stringify({ ...JSON.parse(body), durationMs: 5000, ready: true }) })).status === 400);
    check("prepare signature cannot authorize inspection", (await send({ path: "/inspect", timestamp, nonce, signature })).status === 401);
    const inspectNonce = randomUUID(), inspection = await send({ path: "/inspect", nonce: inspectNonce });
    check("composition inspection accepts only signed persisted identifiers", inspection.status === 200 && inspection.body === '{"ready":true}' && inspections === 1);
    check("composition exact replay cannot inspect twice", (await send({ path: "/inspect", nonce: inspectNonce })).status === 409 && inspections === 1);
    process.env.WORKER_SHARED_SECRET = secret;
    delete process.env.NEXT_PUBLIC_WORKER_SHARED_SECRET;
    process.env.MEDIA_WORKER_URL = "https://worker.invalid";
    check("configured HTTPS origin resolves fixed processing path", workerConnection().url === "https://worker.invalid/prepare");
    process.env.NEXT_PUBLIC_WORKER_SHARED_SECRET = "forbidden";
    assert.throws(workerSharedSecret, /WORKER_SECRET_REQUIRED/);
    delete process.env.NEXT_PUBLIC_WORKER_SHARED_SECRET;
    for (const value of [undefined, "short", " " + secret]) {
      if (value === undefined) delete process.env.WORKER_SHARED_SECRET; else process.env.WORKER_SHARED_SECRET = value;
      assert.throws(workerSharedSecret, /WORKER_SECRET_REQUIRED/);
    }
    check("missing/short/public/whitespace secrets fail closed", true);
    process.env.WORKER_SHARED_SECRET = secret;
    Object.assign(process.env, { NODE_ENV: "production" });
    for (const url of ["http://worker.invalid", "http://127.0.0.1:3012", "https://user:pass@worker.invalid", "https://worker.invalid/prepare", "https://worker.invalid?x=1"]) {
      process.env.MEDIA_WORKER_URL = url;
      assert.throws(workerConnection);
    }
    check("production rejects HTTP and ambiguous worker URLs", true);
    failure = undefined;
    let release: () => void = () => {};
    hold = new Promise<void>(resolve => { release = resolve; });
    const before = calls;
    const first = send(), second = send();
    try {
      for (let count = 0; calls < before + 2 && count < 100; count++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(calls, before + 2);
      check("two active preparations bound concurrency", (await send()).status === 503);
      const live = await fetch(origin + "/health");
      check("health remains available while processing", live.status === 200);
      await live.body?.cancel();
      drain();
      release();
      check("graceful shutdown finishes active requests", (await first).status === 200 && (await second).status === 200);
    } finally { release(); await Promise.allSettled([first, second]); }
    console.log(JSON.stringify({ passed: checks.length, checks, scope: "actual local HTTP/HMAC; processor fixture; no hosted writes" }, null, 2));
  } finally {
    for (const [name, value] of Object.entries({ WORKER_SHARED_SECRET: saved.secret, NEXT_PUBLIC_WORKER_SHARED_SECRET: saved.publicSecret, MEDIA_WORKER_URL: saved.url, NODE_ENV: saved.nodeEnv })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    drain();
    server.closeAllConnections();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "WORKER_AUTH_TEST_FAILED"); process.exitCode = 1; });
