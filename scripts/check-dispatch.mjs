// Real migration/RPC/SDK integration in isolated PostgreSQL. Only external
// event transport and interactive Clerk identity are fixtures. No hosted writes.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { randomUUID, createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import { Inngest, NonRetriableError } from "inngest";
import { InngestTestEngine } from "@inngest/test";
import { serve } from "inngest/next";
import { NextRequest } from "next/server.js";

const require = createRequire(import.meta.url),
  pg = new PGlite();
let count = 0,
  sendFails = false,
  ackLost = false,
  claimLost = false,
  dbFails = false;
const logs = [],
  sent = [],
  modules = new Map();
const env = {
  NODE_ENV: "production",
  INNGEST_DEV: "1",
  INNGEST_EVENT_KEY: "fixture",
};
const check = (name, value) => {
  assert.ok(value, name);
  count++;
};
const snapshot = {
  version: 1,
  prompt: "Private fixture prompt",
  category: "cinematic",
  settings: {
    aspectRatio: "16:9",
    duration: "10",
    visualStyle: "Original",
    tone: "Storytelling",
  },
  assetIds: [],
};
async function rpc(name, args = {}) {
  if (dbFails) return { data: null, error: { code: "NETWORK_ERROR" } };
  try {
    await pg.exec("set role service_role");
    const names = Object.keys(args);
    const rows = (
      await pg.query(
        `select public.${name}(${names.map((key, i) => `${key} => $${i + 1}`).join(",")}) as value`,
        Object.values(args),
      )
    ).rows;
    const data =
      name === "generation_dispatch_candidates"
        ? rows.map(({ value }) => ({ job_id: value }))
        : rows[0].value;
    if (ackLost && name === "acknowledge_generation_dispatch") {
      ackLost = false;
      return { data: null, error: { code: "LOST_RESPONSE" } };
    }
    if (claimLost && name === "claim_generation_job") {
      claimLost = false;
      return { data: null, error: { code: "LOST_RESPONSE" } };
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error: { code: error.code } };
  } finally {
    await pg.exec("reset role");
  }
}
// Actual SDK event serialization/send contract, local transport only.
const sender = new Inngest({
  id: "sceenyk",
  isDev: false,
  eventKey: "fixture",
  fetch: async (_url, init) => {
    sent.push(...JSON.parse(init.body));
    if (sendFails)
      return new Response(
        JSON.stringify({ status: 503, error: "private transport failure" }),
        { status: 503 },
      );
    return Response.json({ status: 200, ids: [randomUUID()] });
  },
});
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file).exports;
  const loadedModule = { exports: {} };
  modules.set(file, loadedModule);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(code, {
    module: loadedModule,
    exports: loadedModule.exports,
    process: { env },
    AbortSignal,
    fetch,
    console: {
      info: (...args) => logs.push(args),
      warn: (...args) => logs.push(args),
      error: (...args) => logs.push(args),
    },
    require: (name) => {
      if (name === "server-only") return {};
      if (name === "@/lib/db/server")
        return { createDatabaseClient: () => ({ rpc }) };
      if (name === "@/lib/workflows/client")
        return { inngest: sender, workflowDevelopmentMode: () => false };
      if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
      if (name.startsWith("."))
        return load(path.resolve(path.dirname(file), name + ".ts"));
      return require(name);
    },
  });
  return loadedModule.exports;
}
async function value(sql, params = []) {
  return (await pg.query(sql, params)).rows[0]?.value;
}
async function denied(sql, params = [], role = "anon") {
  await pg.exec("set role " + role);
  let rejected = false;
  try {
    await pg.query(sql, params);
  } catch {
    rejected = true;
  } finally {
    await pg.exec("reset role");
  }
  check("restricted operation denied", rejected);
}
let owner, project;
async function job() {
  // Distinct accounts keep transport fixtures independent of the lifetime cap.
  const user = await value("insert into app_users(clerk_user_id) values($1) returning id as value", [randomUUID()]);
  const ownedProject = await value("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Fixture','cinematic','16:9','10','Original','Storytelling') returning id as value", [user]);
  const quoted = await value("select public.issue_generation_quote($1,$2,$3,$4,null,'fixture','unconfigured') as value", [user, ownedProject, randomUUID(), snapshot]);
  const admitted = await value("select public.confirm_generation_quote($1,$2,'fixture') as value", [user, quoted.quote.id]);
  assert.equal(admitted.code, "ACCEPTED");
  return admitted.job_id;
}
async function ageDispatch(id) {
  await pg.query(
    "update generation_jobs set last_dispatch_at=now()-interval '3 minutes' where id=$1",
    [id],
  );
}
const row = async (id) =>
  (await pg.query("select * from generation_jobs where id=$1", [id])).rows[0];
try {
  await pg.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  for (const file of fs
    .readdirSync("supabase/migrations")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await pg.exec(fs.readFileSync("supabase/migrations/" + file, "utf8"));
  check("seven actual migrations apply", true);
  owner = await value(
    "insert into app_users(clerk_user_id) values('fixture') returning id as value",
  );
  project = await value(
    "insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Fixture','cinematic','16:9','10','Original','Storytelling') returning id as value",
    [owner],
  );
  const dispatch = load("lib/generation/dispatch.ts");
  const id = await job();
  check("new row is pending", (await row(id)).dispatch_status === "pending");
  await dispatch.dispatchGeneration(id);
  check(
    "SDK send accepted separately from claim",
    (await row(id)).dispatch_status === "dispatched" &&
      (await row(id)).status === "queued",
  );
  check(
    "event contains only job ID",
    JSON.stringify(sent[0].data) === JSON.stringify({ generationJobId: id }) &&
      sent[0].name === "sceenyk/generation.requested" &&
      sent[0].id === id + ":1",
  );
  await dispatch.dispatchGeneration(id);
  check("cooldown prevents repeat send", sent.length === 1);
  await ageDispatch(id);
  await dispatch.dispatchGeneration(id);
  check(
    "accepted but unclaimed delivery recovers",
    sent.length === 2 && sent[1].id === id + ":2",
  );
  const failed = await job();
  sendFails = true;
  await dispatch.attemptGenerationDispatch(failed);
  check(
    "failed dispatch preserves queued request",
    (await row(failed)).dispatch_status === "dispatch_failed" &&
      (await row(failed)).status === "queued",
  );
  sendFails = false;
  await ageDispatch(failed);
  await dispatch.dispatchGeneration(failed);
  check(
    "same row recovers dispatch failure",
    (await row(failed)).dispatch_status === "dispatched" &&
      (await row(failed)).dispatch_attempts === 2,
  );
  const uncertain = await job();
  ackLost = true;
  await dispatch.attemptGenerationDispatch(uncertain);
  await ageDispatch(uncertain);
  await dispatch.dispatchGeneration(uncertain);
  check(
    "lost send acknowledgement recovers",
    (await row(uncertain)).dispatch_attempts === 2,
  );
  const race = await job();
  const a = await rpc("reserve_generation_dispatch", { p_job_id: race });
  await rpc("claim_generation_job", { p_job_id: race, p_run_id: "run-race" });
  await rpc("acknowledge_generation_dispatch", {
    p_job_id: race,
    p_attempt: a.data,
    p_success: true,
  });
  check(
    "late acknowledgement cannot undo claim",
    (await row(race)).dispatch_status === "claimed",
  );
  const claimed = await rpc("claim_generation_job", {
    p_job_id: id,
    p_run_id: "run-a",
  });
  check(
    "authoritative SQL claim starts preparing",
    claimed.data === "claimed" && (await row(id)).current_stage === "preparing",
  );
  check(
    "duplicate delivery exits",
    (await rpc("claim_generation_job", { p_job_id: id, p_run_id: "run-b" }))
      .data === "duplicate",
  );
  check(
    "same run resumes after uncertain response",
    (await rpc("claim_generation_job", { p_job_id: id, p_run_id: "run-a" }))
      .data === "resumed",
  );
  check(
    "wrong run cannot close another claim",
    (await rpc("fail_generation_claim", { p_job_id: id, p_run_id: "run-b" }))
      .data === false,
  );
  await rpc("fail_generation_claim", { p_job_id: id, p_run_id: "run-a" });
  check(
    "unsupported handoff fails without output",
    (await row(id)).status === "failed" && !(await row(id)).completed_at,
  );
  check(
    "terminal delivery exits",
    (await rpc("claim_generation_job", { p_job_id: id, p_run_id: "run-c" }))
      .data === "terminal",
  );
  check(
    "missing job is explicit",
    (
      await rpc("claim_generation_job", {
        p_job_id: randomUUID(),
        p_run_id: "run-a",
      })
    ).data === "missing",
  );
  check(
    "invalid run cannot claim",
    (await rpc("claim_generation_job", { p_job_id: failed, p_run_id: "" }))
      .data === "invalid",
  );
  for (const role of ["anon", "authenticated"])
    for (const [name, args] of [
      ["reserve_generation_dispatch(uuid)", "$1"],
      ["claim_generation_job(uuid,text)", "$1,'run'"],
      ["acknowledge_generation_dispatch(uuid,integer,boolean)", "$1,1,true"],
      ["fail_generation_claim(uuid,text)", "$1,'run'"],
      ["generation_dispatch_candidates()", ""],
      ["expire_generation_claims()", ""],
    ])
      await denied(
        `select public.${name.split("(")[0]}(${args})`,
        args ? [failed] : [],
        role,
      );
  await denied(
    "update generation_jobs set dispatch_status='dispatched' where id=$1",
    [failed],
    "service_role",
  );
  await denied(
    "insert into generation_jobs(owner_user_id,project_id,request_id,input_snapshot,dispatch_attempts) values($1,$2,$3,$4,1)",
    [owner, project, randomUUID(), snapshot],
    "service_role",
  );
  await denied(
    "update generation_jobs set worker_run_id='other' where id=$1",
    [race],
    "postgres",
  );
  await denied(
    "update generation_jobs set dispatch_attempts=100 where id=$1",
    [id],
    "postgres",
  );
  // Simulate an old claim using owner-only fixture setup, never production code.
  await pg.exec(
    "alter table generation_jobs disable trigger generation_jobs_dispatch_guard;",
  );
  await pg.query(
    "update generation_jobs set worker_started_at=now()-interval '16 minutes' where id=$1",
    [race],
  );
  await pg.exec(
    "alter table generation_jobs enable trigger generation_jobs_dispatch_guard;",
  );
  check(
    "stale crash claims expire",
    (await rpc("expire_generation_claims")).data === 1 &&
      (await row(race)).status === "failed",
  );
  const pending = await job();
  check(
    "independent reconciliation finds missed dispatch",
    (await rpc("generation_dispatch_candidates")).data.some(
      (x) => x.job_id === pending,
    ),
  );
  const { generationWorkflow, generationRecovery } = load(
    "lib/workflows/generation.ts",
  );
  check("worker retries are bounded", generationWorkflow.opts.retries === 4);
  const engineJob = await job();
  const makeEngine = (id, data = { generationJobId: engineJob }) =>
    new InngestTestEngine({
      function: generationWorkflow,
      // Sleep registration is real; the isolated test engine supplies wake-up.
      // Browser acceptance separately waits for the actual durable sleep.
      steps: [{ id: "preparing-handoff", handler: () => null }],
      events: [{ name: "sceenyk/generation.requested", data }],
      transformCtx: (ctx) => ({ ...ctx, runId: id }),
    });
  const first = await makeEngine("engine-run").executeStep(
    "claim-authoritative-job",
  );
  check(
    "actual worker step claims authoritative job",
    first.result === "claimed" &&
      (await row(engineJob)).worker_run_id === "engine-run",
  );
  const duplicate = await makeEngine("different-run").execute();
  check(
    "actual duplicate worker exits before handoff",
    duplicate.result.claim === "duplicate" &&
      (await row(engineJob)).status === "processing",
  );
  const resumed = await makeEngine("engine-run").execute();
  check(
    "actual same-run retry finishes honest handoff",
    resumed.result.handoff === "pipeline_not_connected" &&
      (await row(engineJob)).status === "failed",
  );
  const lostJob = await job();
  claimLost = true;
  const lost = await makeEngine("lost-run", {
    generationJobId: lostJob,
  }).executeStep("claim-authoritative-job");
  check(
    "lost claim response reports retryable failure",
    lost.error &&
      !(lost.error instanceof NonRetriableError) &&
      (await row(lostJob)).status === "processing",
  );
  const retry = await makeEngine("lost-run", {
    generationJobId: lostJob,
  }).executeStep("claim-authoritative-job");
  check("worker retry resumes committed claim", retry.result === "resumed");
  const beforeInvalid = (await row(pending)).status;
  const invalid = await makeEngine("invalid-run", {
    generationJobId: pending,
    owner_user_id: owner,
  }).execute();
  check(
    "extra identity fields are nonretryable without mutation",
    invalid.error?.name === "NonRetriableError" &&
      (await row(pending)).status === beforeInvalid,
  );
  const missing = await makeEngine("missing-run", {
    generationJobId: randomUUID(),
  }).execute();
  check(
    "missing job is nonretryable",
    missing.error?.name === "NonRetriableError",
  );
  dbFails = true;
  const temporary = await makeEngine("temporary-run", {
    generationJobId: pending,
  }).executeStep("claim-authoritative-job");
  dbFails = false;
  check(
    "database outage remains retryable",
    temporary.error &&
      temporary.error.name !== "NonRetriableError" &&
      (await row(pending)).status === "queued",
  );
  const recovery = await new InngestTestEngine({
    function: generationRecovery,
  }).execute();
  check(
    "real reconciliation workflow dispatches pending rows",
    !recovery.error && (await row(pending)).dispatch_attempts === 1,
  );
  check(
    "workflow never creates completed jobs",
    !(await pg.query("select id from generation_jobs where status='completed'"))
      .rows.length,
  );
  const local = load("lib/workflows/client.ts");
  check(
    "production overrides unsigned dev flag",
    local.workflowDevelopmentMode() === false,
  );
  env.NODE_ENV = "development";
  check(
    "local development requires explicit opt-in",
    local.workflowDevelopmentMode() === true,
  );
  env.INNGEST_DEV = "0";
  check(
    "default remains authenticated",
    local.workflowDevelopmentMode() === false,
  );
  // Exercise the official SDK's signature gate, not a custom verifier.
  let executions = 0;
  const signingKey = "signkey-test-" + "a".repeat(64);
  const trusted = new Inngest({
    id: "signature-test",
    isDev: false,
    signingKey,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  });
  const fn = trusted.createFunction(
    { id: "verify", triggers: { event: "fixture" } },
    async () => {
      executions++;
      return { ok: true };
    },
  );
  const handler = serve({ client: trusted, functions: [fn] });
  const body = {
    event: { name: "fixture", data: {} },
    events: [{ name: "fixture", data: {} }],
    steps: {},
    ctx: { run_id: "signature-run", attempt: 0 },
  };
  const url =
    "http://localhost/api/inngest?fnId=signature-test-verify&stepId=step";
  for (const signature of [null, "t=0&s=invalid"]) {
    const response = await handler.POST(
      new NextRequest(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(signature ? { "x-inngest-signature": signature } : {}),
        },
        body: JSON.stringify(body),
      }),
      {},
    );
    check("unsigned/invalid execution rejected", response.status === 401);
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  // SDK signatures canonicalize JSON object keys. This creates a signed test
  // request; application verification remains entirely in the official SDK.
  const canonical = (input) =>
    Array.isArray(input)
      ? input.map(canonical)
      : input && typeof input === "object"
        ? Object.fromEntries(
            Object.keys(input)
              .sort()
              .map((key) => [key, canonical(input[key])]),
          )
        : input;
  const digest = createHmac("sha256", signingKey.replace(/^signkey-\w+-/, ""))
    .update(JSON.stringify(canonical(body)) + timestamp)
    .digest("hex");
  const signed = await handler.POST(
    new NextRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-inngest-signature": `t=${timestamp}&s=${digest}`,
      },
      body: JSON.stringify(body),
    }),
    {},
  );
  check(
    "official SDK accepts valid signature",
    signed.status === 200 && executions === 1,
  );
  check("invalid requests executed no worker", executions === 1);
  check(
    "logs exclude prompt/upstream error/key",
    ![snapshot.prompt, "private transport failure", "sb_secret_"].some((x) =>
      JSON.stringify(logs).includes(x),
    ),
  );
  console.log(
    JSON.stringify({
      passed: count,
      scope:
        "isolated PostgreSQL and real Inngest SDK; hosted acceptance separate",
    }),
  );
} finally {
  await pg.close();
}
