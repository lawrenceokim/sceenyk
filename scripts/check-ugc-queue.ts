// Offline contract/schema checks. No live environment, workflow RPCs, worker
// execution, private storage or provider requests. SDK fetch is entirely mocked.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { compositeRecord, parseWorkerClaim } from "../lib/ugc-jobs/claim-contract";
import { LocalQueuePolicy } from "../lib/ugc-jobs/queue-policy";
import { locationFailure } from "../lib/location-reference/errors";
import { storyboardExecution, storyboardQueueMessage, storyboardStatusLabel, type StoryboardReview } from "../lib/storyboard/contract";
import { shouldPollUgcProgress } from "../lib/ugc-jobs/contract";

async function main() {
  let checks = 0;
  const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
  const ok = (value: unknown) => { assert.ok(value); checks++; };
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const now = Date.parse("2026-10-26T21:00:00Z");
  const identity = { id: id(1), job_id: id(2), project_id: id(3), owner_user_id: id(4), worker_id: id(5),
    version: 1, claim_token: id(6), heartbeat_at: new Date(now).toISOString(), lease_expires_at: new Date(now + 90_000).toISOString() };
  const location = { ...identity, state: "running_image", phase: "generating", candidate_id: id(7), accepted_candidate_id: null, approved_at: null };
  const storyboard = { ...identity, state: "running", phase: "preparing", input: {}, requests: [], attempts: 1 };
  const character = { ...identity, state: "running", slot: "face", candidate_id: id(7) };
  for (const queue of ["character", "location", "storyboard"] as const) {
    for (const value of [null, undefined, [], [null], { id: null, job_id: null, phase: null }, [{ id: null, phase: null }]]) equal(parseWorkerClaim(queue, value, now), null);
    for (const value of [{}, false, "null", [{ id: id(1) }, { id: id(2) }], { ...identity, state: "approved", phase: "approved" }]) {
      assert.throws(() => parseWorkerClaim(queue, value, now)); checks++;
    }
  }
  equal(parseWorkerClaim("location", location, now), location);
  equal(parseWorkerClaim("location", [location], now), location);
  equal(parseWorkerClaim("storyboard", storyboard, now), storyboard);
  equal(parseWorkerClaim("character", character, now), character);
  assert.throws(() => parseWorkerClaim("location", { ...location, lease_expires_at: new Date(now - 1).toISOString() }, now)); checks++;
  assert.throws(() => parseWorkerClaim("location", { ...location, accepted_candidate_id: id(7) }, now)); checks++;
  assert.throws(() => parseWorkerClaim("location", { ...location, phase: null }, now)); checks++;
  assert.throws(() => parseWorkerClaim("location", { ...location, claim_token: null }, now)); checks++;
  equal(compositeRecord({ id: null }), null);

  const policy = new LocalQueuePolicy();
  equal(policy.failed("location", now, true), { failures: 1, paused: false, retryAt: now + 5000 });
  ok(!policy.order(now + 4999).includes("location") && policy.order(now).includes("storyboard"));
  equal(policy.failed("location", now + 5000, true), { failures: 2, paused: false, retryAt: now + 15_000 });
  policy.worked("storyboard");
  ok(policy.order(now + 6000).includes("generation") && !policy.order(now + 6000).includes("location"));
  equal(policy.failed("location", now + 15_000, true), { failures: 3, paused: true, retryAt: null });
  ok(!policy.order(now + 100_000_000).includes("location") && policy.order(now + 100_000_000).includes("storyboard"));
  equal(policy.failed("regeneration", now, false).paused, true);
  const fair = new LocalQueuePolicy(); fair.worked("character"); equal(fair.order(now)[0], "location");
  fair.worked("location"); equal(fair.order(now)[0], "storyboard");

  const review = { state: "queued", error: null, current: true, createdAt: new Date(now - 120_000).toISOString(),
    updatedAt: new Date(now - 120_000).toISOString(), heartbeatAt: null, leaseExpiresAt: null } as StoryboardReview;
  equal(storyboardExecution(review, now, true), "queued_delayed");
  equal(storyboardExecution({ ...review, updatedAt: new Date(now).toISOString() }, now, true), "queued");
  equal(storyboardExecution(review, now, false), "paused");
  equal(storyboardExecution({ ...review, state: "failed" }, now, true), "failed");
  equal(storyboardExecution({ ...review, state: "review" }, now, true), "paused");
  equal(storyboardExecution({ ...review, state: "running", heartbeatAt: identity.heartbeat_at, leaseExpiresAt: identity.lease_expires_at }, now, true), "processing");
  equal(storyboardExecution({ ...review, state: "running", heartbeatAt: identity.heartbeat_at, leaseExpiresAt: new Date(now - 1).toISOString() }, now, true), "stalled");
  equal(storyboardExecution({ ...review, state: "approved" }, now, true), "approved");
  ok(storyboardQueueMessage({ ...review, execution: "queued_delayed" })?.includes("do not generate a replacement"));
  ok(storyboardStatusLabel({ ...review, execution: "queued" }).includes("queued"));
  equal(shouldPollUgcProgress({ status: "queued", paused: true, storyboard: { ...review, execution: "paused" } }), false);
  equal(shouldPollUgcProgress({ status: "queued", paused: false, storyboard: { ...review, execution: "paused" },
    location: { requested: true, state: "running_image" } as never }), true);
  equal(shouldPollUgcProgress({ status: "queued", paused: false, storyboard: { ...review, execution: "queued_delayed" } }), true);

  const safe = locationFailure({ code: "22P02", message: "DO_NOT_PRINT_private_url_secret", details: "DO_NOT_PRINT" }, "candidate_read", "LOCATION_DATABASE_FAILED");
  equal(safe.diagnostic.databaseCode, "22P02"); equal(safe.diagnostic.phase, "candidate_read"); equal(safe.diagnostic.category, "database");
  ok(!JSON.stringify(safe.diagnostic).includes("DO_NOT_PRINT"));

  const pg = new PGlite();
  try {
    await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    const migrations = fs.readdirSync("supabase/migrations").filter(file => file.endsWith(".sql")).sort();
    for (const file of migrations) await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
    // Exact PostgreSQL composite projection used by row-returning RPC transport.
    const wire = (await pg.query<Record<string, unknown>>("select (null::public.ugc_locations).*")).rows[0];
    ok(Object.values(wire).length > 10 && Object.values(wire).every(value => value === null));
    equal(wire.phase, null); equal(Boolean(wire), true); equal(parseWorkerClaim("location", wire, now), null);
    const storyWire = (await pg.query("select (null::public.ugc_storyboards).*")).rows[0];
    equal(parseWorkerClaim("storyboard", storyWire, now), null);
    let requestCount = 0;
    const client = createClient("https://offline.invalid", "synthetic-key", { auth: { persistSession: false, autoRefreshToken: false }, global: {
      fetch: async () => { requestCount++; return new Response(JSON.stringify(wire), { status: 200, headers: { "Content-Type": "application/json" } }); },
    } });
    const result = await client.rpc("ugc_location_claim", { p_worker: id(5) });
    equal(result.error, null); equal(result.data, wire); equal(parseWorkerClaim("location", result.data, now), null); equal(requestCount, 1);
    let uuidError: string | undefined;
    try { await pg.query("select 'null'::uuid"); } catch (error) { uuidError = (error as { code?: string }).code; }
    equal(uuidError, "22P02");
    const funcs = (await pg.query<{ proname: string; prosrc: string; return_type: string }>("select proname,prosrc,prorettype::regtype::text return_type from pg_proc where proname in ('ugc_location_claim','ugc_storyboard_claim')")).rows;
    equal(funcs.find(row => row.proname === "ugc_location_claim")?.return_type, "ugc_locations");
    ok(funcs.find(row => row.proname === "ugc_location_claim")?.prosrc.includes("return null"));
    ok(!funcs.find(row => row.proname === "ugc_location_claim")?.prosrc.includes("state='approved'"));
    for (const name of ["ugc_storyboard_claim(uuid)", "ugc_storyboard_checkpoint(uuid,uuid,text,jsonb)", "ugc_storyboard_action(uuid,uuid,uuid,integer,text,jsonb)"]) {
      equal((await pg.query("select has_function_privilege('service_role',$1,'EXECUTE') service,has_function_privilege('authenticated',$1,'EXECUTE') browser", [`public.${name}`])).rows[0], { service: true, browser: false });
    }
    equal((await pg.query("select (select count(*)::int from ugc_generation_jobs) jobs,(select count(*)::int from ugc_storyboards) storyboards")).rows[0], { jobs: 0, storyboards: 0 });
    const locationSource = fs.readFileSync("lib/location-reference/worker.ts", "utf8");
    ok(locationSource.indexOf('parseWorkerClaim("location"') < locationSource.indexOf("const db = createDatabaseClient"));
    const storySource = fs.readFileSync("lib/storyboard/worker.ts", "utf8");
    ok(storySource.indexOf('parseWorkerClaim("storyboard"') < storySource.indexOf("const db = createDatabaseClient"));
    ok(storySource.indexOf('checkpoint("intent"') < storySource.indexOf("await requestStoryboard("));
    ok(storySource.includes('committed?.id !== row.id') && locationSource.includes('committed.id !== row.id'));
    const runner = fs.readFileSync("lib/ugc-jobs/local-runner.ts", "utf8");
    ok(runner.includes("policy.order") && !runner.includes("if (location.data)"));
    ok(!/requests\s*=|\.requests\s*=|\.delete\(|\.update\(|\.insert\(/.test(runner));
    console.info(JSON.stringify({ checks, migrations: migrations.length, emptyCompositeReproduced: true, underlyingUuidError: uuidError,
      SDKFetchMocked: true, workflowRPCs: 0, jobFixtures: 0, liveWrites: 0, workerExecution: 0, providerCalls: 0 }));
  } finally { await pg.close(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Offline queue check failed"); process.exitCode = 1; });
