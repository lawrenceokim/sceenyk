// Isolated integration checks: real migrations + SDK + application services.
// No network, secrets, Clerk accounts, hosted data or worker/provider calls.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

const root = process.cwd(),
  require = createRequire(import.meta.url);
const checks = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};
const pg = new PGlite();
let active = "A",
  signedIn = true,
  unavailable = false,
  loseInsert = false;
const users = {},
  projects = {},
  assets = {};
const logs = [],
  reads = [];
class AuthRedirect extends Error {}
const env = {
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_fixture",
};
const cache = new Map();
let tail = Promise.resolve();
async function rawBridge(input, init) {
  const url = new URL(
    typeof input === "string" ? input : input.url || input.href,
  );
  const table = url.pathname.split("/").pop();
  assert.ok(["projects", "project_assets", "generation_jobs", "generation_accounts", "admit_generation"].includes(table));
  assert.equal(init.cache, "no-store");
  assert.ok(init.signal);
  if (unavailable)
    return new Response(
      JSON.stringify({ code: "PGRST205", message: "private database detail" }),
      { status: 404 },
    );
  try {
    await pg.exec("set role service_role");
    if (table === "admit_generation") {
      const args = JSON.parse(init.body);
      assert.equal(args.p_owner_user_id, users[active].id);
      assert.equal(args.p_credit_cost, null, "no invented tariff");
      const names = Object.keys(args);
      const result = (await pg.query(`select public.admit_generation(${names.map((key, i) => `${key} => $${i + 1}`).join(",")}) as value`, Object.values(args))).rows[0].value;
      if (loseInsert) {
        loseInsert = false;
        return Response.json({ code: "UNAVAILABLE" }, { status: 503 });
      }
      return Response.json(result);
    }
    let rows;
    if (init.method === "POST") {
      const fields = JSON.parse(init.body),
        names = Object.keys(fields);
      assert.equal(fields.owner_user_id, users[active].id);
      rows = (
        await pg.query(
          `insert into ${table} (${names.join(",")}) values (${names.map((_, i) => "$" + (i + 1)).join(",")}) returning *`,
          Object.values(fields),
        )
      ).rows;
      if (loseInsert) {
        loseInsert = false;
        return new Response(JSON.stringify({ code: "UNAVAILABLE" }), {
          status: 503,
        });
      }
    } else {
      const filters = [...url.searchParams.entries()].filter(
        ([key]) => !["select", "order", "limit", "offset"].includes(key),
      );
      assert.ok(
        filters.some(
          ([key, value]) =>
            key === "owner_user_id" && value === "eq." + users[active].id,
        ),
        "every query filters verified owner",
      );
      const params = [],
        clauses = [];
      for (const [key, value] of filters) {
        assert.match(key, /^[a-z_]+$/);
        if (value === "is.null") clauses.push(key + " is null");
        else if (value === "not.is.null") clauses.push(key + " is not null");
        else if (value.startsWith("eq.")) {
          params.push(value.slice(3));
          clauses.push(key + "=$" + params.length);
        } else if (value.startsWith("in.(")) {
          const ids = value.slice(4, -1).split(",");
          clauses.push(
            key +
              " in (" +
              ids
                .map((id) => {
                  params.push(id.replaceAll('"', ""));
                  return "$" + params.length;
                })
                .join(",") +
              ")",
          );
        } else throw Error("Unsupported test filter");
      }
      if (init.method === "PATCH") {
        const fields = JSON.parse(init.body),
          sets = Object.entries(fields).map(([key, value]) => {
            params.push(value);
            return key + "=$" + params.length;
          });
        rows = (
          await pg.query(
            `update ${table} set ${sets.join(",")} where ${clauses.join(" and ")} returning *`,
            params,
          )
        ).rows;
      } else {
        let sql = `select * from ${table} where ${clauses.join(" and ")}`;
        if (url.searchParams.has("order"))
          sql +=
            " order by " +
            url.searchParams
              .get("order")
              .split(",")
              .map((part) => part.replace(".", " "))
              .join(",");
        if (url.searchParams.has("limit"))
          sql += " limit " + Number(url.searchParams.get("limit"));
        rows = (await pg.query(sql, params)).rows;
        reads.push({ table, limit: url.searchParams.get("limit"), filters });
      }
    }
    const select = url.searchParams.get("select");
    if (select !== "*")
      rows = rows.map((row) =>
        Object.fromEntries(select.split(",").map((key) => [key, row[key]])),
      );
    const singular = new Headers(init.headers)
      .get("accept")
      ?.includes("vnd.pgrst.object");
    return new Response(JSON.stringify(singular ? (rows[0] ?? null) : rows), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ code: error.code, message: "private database detail" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  } finally {
    await pg.exec("reset role");
  }
}
function bridge(input, init) {
  const result = tail.then(() => rawBridge(input, init));
  tail = result.catch(() => {});
  return result;
}
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const loadedModule = { exports: {} };
  cache.set(file, loadedModule);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const localRequire = (name) => {
    if (name === "server-only") return {};
    // Dispatch has its own SQL/SDK integration suite; isolate the original
    // authenticated persistence checks from external workflow transport.
    if (name === "./dispatch")
      return { attemptGenerationDispatch: async () => {} };
    if (name === "@/lib/auth/ensure-app-user")
      return {
        ensureAppUser: async () => {
          if (!signedIn) throw new AuthRedirect();
          return users[active];
        },
      };
    if (name === "next/navigation")
      return {
        unstable_rethrow: (error) => {
          if (error instanceof AuthRedirect) throw error;
        },
      };
    if (name === "next/cache")
      throw Error("Job actions must not discard active route Files");
    if (name.startsWith("@/"))
      return load(path.join(root, name.slice(2) + ".ts"));
    if (name.startsWith("."))
      return load(path.resolve(path.dirname(file), name + ".ts"));
    return require(name);
  };
  vm.runInNewContext(code, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: localRequire,
    process: { env },
    URL,
    Buffer,
    Set,
    AbortSignal,
    fetch: bridge,
    console: { error: (...args) => logs.push(args) },
  });
  return loadedModule.exports;
}
async function denied(name, sql, params = [], role = null) {
  if (role) await pg.exec("set role " + role);
  let rejected = false;
  try {
    await pg.query(sql, params);
  } catch {
    rejected = true;
  } finally {
    await pg.exec("reset role");
  }
  check(name, rejected);
}
try {
  await pg.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  const migrations = fs
    .readdirSync(path.join(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of migrations)
    await pg.exec(
      fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8"),
    );
  check("all six migrations apply in sequence", migrations.length === 6);
  for (const name of ["A", "B"]) {
    users[name] = (
      await pg.query(
        "insert into app_users(clerk_user_id) values($1) returning *",
        ["fixture_" + name],
      )
    ).rows[0];
    projects[name] = (
      await pg.query(
        "insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,$2,'cinematic','16:9','10','Original','Storytelling') returning *",
        [users[name].id, "Project " + name],
      )
    ).rows[0];
    assets[name] = randomUUID();
    await pg.query(
      "insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,upload_status,verified_etag) values($1,$2,$3,$4,$5,'image.png','image/png',100,'image','uploaded','verified')",
      [
        assets[name],
        users[name].id,
        projects[name].id,
        randomUUID(),
        `users/${users[name].id}/projects/${projects[name].id}/${assets[name]}/fixture`,
      ],
    );
  }
  const service = load(path.join(root, "lib/generation/server.ts"));
  const actions = load(path.join(root, "app/actions/generation.ts"));
  const contract = load(path.join(root, "lib/generation/contract.ts"));
  const accounting = load(path.join(root, "app/actions/accounting.ts"));
  check("new identity has exactly two actual allowances", (await accounting.freeAllowanceAction()).value.available === 2);
  const inputs = {
    prompt: "  A new scene  ",
    category: "cinematic",
    settings: {
      aspectRatio: "16:9",
      duration: "10",
      visualStyle: "Original",
      tone: "Storytelling",
    },
    assetIds: [assets.A],
  };
  const base = { projectId: projects.A.id, requestId: randomUUID(), inputs };
  let r = await actions.createGenerationAction(base);
  check(
    "owned creation returns persisted queued job",
    r.ok && r.value.status === "queued" && r.value.stage === null,
  );
  const job = r.value,
    ref = { projectId: projects.A.id, jobId: job.id };
  check(
    "snapshot normalized and versioned",
    job.input.version === 1 &&
      job.input.prompt === "A new scene" &&
      job.input.assetIds[0] === assets.A,
  );
  check(
    "DTO excludes owner and exposes owned retry identity",
    !("owner_user_id" in job) && job.requestId === base.requestId,
  );
  r = await actions.createGenerationAction(base);
  check("retry returns same job", r.ok && r.value.id === job.id);
  r = await actions.createGenerationAction({
    ...base,
    inputs: { ...inputs, prompt: "Changed" },
  });
  check("request UUID cannot change snapshot", !r.ok && r.code === "CONFLICT");
  const concurrent = { ...base, requestId: randomUUID() };
  const both = await Promise.all([
    actions.createGenerationAction(concurrent),
    actions.createGenerationAction(concurrent),
  ]);
  check(
    "concurrent duplicate requests persist one job",
    both.every((item) => item.ok) && both[0].value.id === both[1].value.id,
  );
  // Release this independent fixture so later persistence checks can exercise
  // lost-response creation within the real two-generation entitlement.
  await service.failGenerationJob({ projectId: projects.A.id, jobId: both[0].value.id }, { status: "queued", stage: null });
  loseInsert = true;
  const lost = { ...base, requestId: randomUUID() };
  r = await actions.createGenerationAction(lost);
  check(
    "lost insert response never returns false success",
    !r.ok && r.code === "UNAVAILABLE",
  );
  r = await actions.createGenerationAction(lost);
  check(
    "lost response retry recovers committed job",
    r.ok &&
      (
        await pg.query(
          "select count(*)::int n from generation_jobs where request_id=$1",
          [lost.requestId],
        )
      ).rows[0].n === 1,
  );
  check(
    "multiple jobs per project supported",
    (
      await pg.query(
        "select count(*)::int n from generation_jobs where project_id=$1",
        [projects.A.id],
      )
    ).rows[0].n === 3,
  );
  check("allowance read reflects two held reservations", (await accounting.freeAllowanceAction()).value.available === 0);
  r = await actions.createGenerationAction({ ...base, requestId: randomUUID() });
  check("exhausted allowance does not dispatch or create", !r.ok && r.code === "PAID_ACCESS_UNAVAILABLE");
  r = await actions.createGenerationAction({ ...base, requestId: randomUUID(), inputs: { ...inputs, settings: { ...inputs.settings, duration: "15" } } });
  check("longer generation requires unavailable approved paid cost", !r.ok && r.code === "PAID_ACCESS_UNAVAILABLE");
  await pg.query(
    "update projects set prompt='Edited later',duration='30' where id=$1",
    [projects.A.id],
  );
  r = await actions.readGenerationAction(ref);
  check(
    "later draft edits do not change snapshot",
    r.ok &&
      r.value.input.prompt === "A new scene" &&
      r.value.input.settings.duration === "10",
  );
  r = await actions.latestGenerationAction(projects.A.id);
  check(
    "latest recovery persists same database state",
    r.ok && !!r.value.id && r.value.status === "queued",
  );
  check(
    "latest lookup bounded to one",
    reads
      .filter(
        (read) =>
          read.table === "generation_jobs" &&
          read.filters.every(([key]) => key !== "request_id" && key !== "id"),
      )
      .every((read) => read.limit === "1"),
  );
  check(
    "dashboard statuses bounded and owned",
    Object.keys(
      await service.getLatestProjectGenerations([projects.A.id, projects.B.id]),
    ).join() === projects.A.id,
  );
  await assert.rejects(() =>
    service.getLatestProjectGenerations(Array(9).fill(projects.A.id)),
  );
  check("dashboard rejects unbounded lookup", true);
  for (const extra of [
    { owner_user_id: users.B.id },
    { status: "completed" },
    { progress: 100 },
    { creditEligible: true },
    { creditCost: 1 },
    { free: true },
    { restore: true },
  ]) {
    r = await actions.createGenerationAction({ ...base, ...extra });
    check(
      "browser claim rejected " + Object.keys(extra)[0],
      !r.ok && r.code === "INVALID_INPUT",
    );
  }
  for (const change of [
    { prompt: " \n " },
    { category: "unknown" },
    { settings: { ...inputs.settings, duration: "999" } },
    { assetIds: ["blob:local"] },
    { settings: {} },
  ]) {
    r = await actions.createGenerationAction({
      ...base,
      requestId: randomUUID(),
      inputs: { ...inputs, ...change },
    });
    check(
      "invalid input rejected " + Object.keys(change)[0],
      !r.ok && r.code === "INVALID_INPUT",
    );
  }
  r = await actions.createGenerationAction({
    ...base,
    requestId: randomUUID(),
    inputs: { ...inputs, assetIds: [assets.B] },
  });
  check(
    "foreign uploaded asset rejected",
    !r.ok && r.code === "INVALID_ASSETS",
  );
  await pg.query(
    "update project_assets set upload_status='pending',verified_etag=null where id=$1",
    [assets.A],
  );
  r = await actions.createGenerationAction({
    ...base,
    requestId: randomUUID(),
  });
  check("pending asset rejected", !r.ok && r.code === "INVALID_ASSETS");
  r = await actions.createGenerationAction(base);
  check(
    "accepted request remains immutable after asset state changes",
    r.ok && r.value.id === job.id,
  );
  await pg.query(
    "update project_assets set upload_status='rejected' where id=$1",
    [assets.A],
  );
  r = await actions.createGenerationAction({
    ...base,
    requestId: randomUUID(),
  });
  check("rejected asset rejected", !r.ok && r.code === "INVALID_ASSETS");
  active = "B";
  check("B allowance read never returns A accounting", (await accounting.freeAllowanceAction()).value.available === 2);
  r = await actions.readGenerationAction(ref);
  check("B cannot read A job by ID", r.ok && r.value === null);
  r = await actions.readGenerationAction({
    projectId: projects.B.id,
    jobId: job.id,
  });
  check(
    "B cannot smuggle foreign job ID through owned project",
    r.ok && r.value === null,
  );
  r = await actions.generationStatusesAction([projects.A.id, projects.B.id]);
  check(
    "dashboard action omits foreign project status",
    r.ok && !(projects.A.id in r.value) && projects.B.id in r.value,
  );
  r = await actions.generationStatusesAction({ owner_user_id: users.A.id });
  check("dashboard action rejects malformed identity claims", !r.ok);
  r = await actions.latestGenerationAction(projects.A.id);
  check("B cannot read latest foreign job", r.ok && r.value === null);
  r = await actions.createGenerationAction({
    ...base,
    requestId: randomUUID(),
  });
  check("B cannot create on A project", !r.ok && r.code === "NOT_FOUND");
  r = await service.startGenerationJob(ref);
  check("B cannot transition A job", !r.ok);
  const b = {
    ...base,
    projectId: projects.B.id,
    requestId: randomUUID(),
    inputs: { ...inputs, assetIds: [assets.B] },
  };
  r = await actions.createGenerationAction({ ...b, inputs });
  check("B cannot reference A media", !r.ok && r.code === "INVALID_ASSETS");
  r = await actions.createGenerationAction(b);
  check("B can create own job", r.ok && r.value.projectId === projects.B.id);
  active = "A";
  signedIn = false;
  for (const call of [
    () => actions.createGenerationAction(base),
    () => actions.readGenerationAction(ref),
    () => actions.latestGenerationAction(base.projectId),
    () => service.startGenerationJob(ref),
    () => accounting.freeAllowanceAction(),
  ])
    await assert.rejects(call, AuthRedirect);
  check("signed-out reads/create/transitions preserve auth denial", true);
  signedIn = true;
  r = await service.completeGenerationJob(ref, "preparing");
  check("queued cannot complete directly", !r.ok);
  const starts = await Promise.all([
    service.startGenerationJob(ref),
    service.startGenerationJob(ref),
  ]);
  check(
    "compare-and-set permits one processing start",
    starts.filter((item) => item.ok).length === 1,
  );
  const started = starts.find((item) => item.ok).value;
  check(
    "processing start timestamp and preparing stage database-owned",
    !!started.startedAt && started.stage === "preparing",
  );
  r = await service.advanceGenerationStage(ref, "preparing", "analyzing");
  check("trusted server advances stage", r.ok && r.value.stage === "analyzing");
  r = await service.advanceGenerationStage(ref, "preparing", "planning");
  check("stale stage update rejected", !r.ok && r.code === "CONFLICT");
  r = await service.advanceGenerationStage(ref, "analyzing", "preparing");
  check("stage cannot regress", !r.ok);
  r = await service.failGenerationJob(ref, {
    status: "processing",
    stage: "analyzing",
  });
  check(
    "failure safely persisted with timestamp and stage",
    r.ok &&
      r.value.stage === "analyzing" &&
      !!r.value.failedAt &&
      r.value.errorMessage === contract.generationFailures.PROCESSING_FAILED,
  );
  r = await service.startGenerationJob(ref);
  check("failed job cannot requeue/restart", !r.ok);
  const lostRow = (await pg.query("select id from generation_jobs where request_id=$1", [lost.requestId])).rows[0];
  const completeRef = { projectId: projects.A.id, jobId: lostRow.id };
  await service.startGenerationJob(completeRef);
  r = await service.advanceGenerationStage(
    completeRef,
    "preparing",
    "rendering",
  );
  check("optional stages may be skipped", r.ok);
  r = await service.completeGenerationJob(completeRef, "rendering");
  check(
    "completion without verified stored result is blocked",
    !r.ok && !(await pg.query("select completed_at from generation_jobs where id=$1", [completeRef.jobId])).rows[0].completed_at,
  );
  await service.failGenerationJob(completeRef, { status: "processing", stage: "rendering" });
  r = await service.failGenerationJob(completeRef, {
    status: "completed",
    stage: null,
  });
  check("released terminal fixture is immutable", !r.ok);
  check("failure restores original free reservation", (await accounting.freeAllowanceAction()).value.available === 2);
  r = await actions.createGenerationAction({
    ...base,
    requestId: randomUUID(),
    inputs: { ...inputs, assetIds: [] },
  });
  const queuedRef = { projectId: projects.A.id, jobId: r.value.id };
  r = await service.failGenerationJob(queuedRef, {
    status: "queued",
    stage: null,
  });
  check(
    "queued may fail before processing starts",
    r.ok && r.value.startedAt === null && r.value.stage === null,
  );
  unavailable = true;
  r = await actions.createGenerationAction(base);
  check(
    "database failure returns safe error",
    !r.ok && !r.message.includes("private database detail"),
  );
  r = await actions.latestGenerationAction(base.projectId);
  check("read failure distinct from no job", !r.ok);
  unavailable = false;
  const clean = { ...job.input, assetIds: [] };
  await denied(
    "composite FK rejects mismatched project owner",
    "insert into generation_jobs(owner_user_id,project_id,request_id,input_snapshot) values($1,$2,$3,$4)",
    [users.B.id, projects.A.id, randomUUID(), clean],
  );
  for (const snapshot of [
    { ...clean, settings: {} },
    { ...clean, prompt: "" },
    { ...clean, version: 2 },
    { ...clean, blob: "blob:test" },
    { ...clean, assetIds: [assets.B] },
    { ...clean, assetIds: [assets.B, assets.B] },
    { ...clean, assetIds: [assets.A] },
  ]) {
    await denied(
      "database rejects malformed or unverified snapshot",
      "insert into generation_jobs(owner_user_id,project_id,request_id,input_snapshot) values($1,$2,$3,$4)",
      [users.A.id, projects.A.id, randomUUID(), snapshot],
    );
  }
  await denied(
    "database refuses initial completed state",
    "insert into generation_jobs(owner_user_id,project_id,request_id,input_snapshot,status) values($1,$2,$3,$4,'completed')",
    [users.A.id, projects.A.id, randomUUID(), clean],
  );
  await denied(
    "database keeps snapshot immutable even for privileged caller",
    "update generation_jobs set input_snapshot=$1 where id=$2",
    [clean, job.id],
  );
  await denied(
    "database terminal state cannot requeue",
    "update generation_jobs set status='queued' where id=$1",
    [completeRef.jobId],
  );
  for (const role of ["anon", "authenticated"]) {
    await denied(
      role + " cannot read jobs",
      "select * from generation_jobs",
      [],
      role,
    );
    await denied(
      role + " cannot insert jobs",
      "insert into generation_jobs(owner_user_id,project_id,request_id,input_snapshot) values($1,$2,$3,$4)",
      [users.A.id, projects.A.id, randomUUID(), clean],
      role,
    );
    await denied(
      role + " cannot mutate jobs",
      "update generation_jobs set status='completed'",
      [],
      role,
    );
  }
  await denied(
    "service role cannot change snapshot",
    "update generation_jobs set input_snapshot=$1 where id=$2",
    [clean, job.id],
    "service_role",
  );
  await denied(
    "service role cannot change owner",
    "update generation_jobs set owner_user_id=$1 where id=$2",
    [users.B.id, job.id],
    "service_role",
  );
  await denied(
    "service role cannot delete jobs",
    "delete from generation_jobs where id=$1",
    [job.id],
    "service_role",
  );
  check(
    "RLS enabled",
    (
      await pg.query(
        "select relrowsecurity from pg_class where oid='generation_jobs'::regclass",
      )
    ).rows[0].relrowsecurity,
  );
  check(
    "actions expose no status mutation",
    Object.keys(actions).sort().join() ===
      "createGenerationAction,generationStatusesAction,latestGenerationAction,readGenerationAction",
  );
  check(
    "logs contain only constrained operation/error codes",
    !JSON.stringify(logs).includes("private database detail"),
  );
  const sql = fs.readFileSync(
    path.join(root, "supabase/migrations/20261010000400_generation_jobs.sql"),
    "utf8",
  );
  for (const value of [
    ...contract.generationStatuses,
    ...contract.generationStages,
    ...Object.keys(contract.generationFailures),
    ...Object.values(contract.generationFailures),
  ])
    check(
      "SQL shares contract " + value,
      sql.includes("'" + value.replaceAll("'", "''") + "'"),
    );
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  await pg.close();
}
