// Real authored migrations/RPCs in isolated PostgreSQL; no hosted writes,
// prices, purchases, provider outputs or real storage objects. PGlite serializes
// its one connection; hosted multi-session contention is separate acceptance.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

const pg = new PGlite(), checks = [], require = createRequire(import.meta.url);
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const q = async (sql, args = []) => (await pg.query(sql, args)).rows;
const one = async (sql, args = []) => (await q(sql, args))[0];
const scalar = async (sql, args = []) => (await one(sql, args)).value;
const snapshot = {
  version: 1, prompt: "Isolated accounting fixture", category: "cinematic",
  settings: { aspectRatio: "16:9", duration: "10", visualStyle: "Original", tone: "Storytelling" }, assetIds: [],
};
async function fixture() {
  const owner = await scalar("insert into app_users(clerk_user_id) values($1) returning id as value", [randomUUID()]);
  const project = await scalar("insert into projects(owner_user_id,title,category,aspect_ratio,duration,visual_style,tone) values($1,'Fixture','cinematic','16:9','10','Original','Storytelling') returning id as value", [owner]);
  return { owner, project };
}
const account = (f) => one("select * from generation_accounts where owner_user_id=$1", [f.owner]);
const job = (id) => one("select * from generation_jobs where id=$1", [id]);
const reservation = (id) => one("select * from generation_reservations where job_id=$1", [id]);
const admit = (f, input = snapshot, request = randomUUID(), cost = null) => scalar("select public.admit_generation($1,$2,$3,$4,$5) as value", [f.owner, f.project, request, input, cost]);
const claim = (id, run = "fixture-run") => scalar("select public.claim_generation_job($1,$2) as value", [id, run]);
const fail = (id, run = "fixture-run") => scalar("select public.fail_generation_claim($1,$2) as value", [id, run]);
async function rendering(id, run = "fixture-run") {
  assert.equal(await claim(id, run), "claimed");
  await q("update generation_jobs set current_stage='rendering' where id=$1", [id]);
}
function resultArgs(row, run = "fixture-run") {
  return [row.id, run, `users/${row.owner_user_id}/generations/${row.id}/result.mp4`, "video/mp4", 100, '"fixture-etag"'];
}
const complete = (args) => scalar("select public.complete_generation_with_result($1,$2,$3,$4,$5,$6) as value", args);
async function denied(name, sql, args = [], role = "postgres") {
  await pg.exec("set role " + role);
  let error;
  try { await q(sql, args); } catch (caught) { error = caught; }
  finally { await pg.exec("reset role"); }
  check(name, !!error);
}
try {
  await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  const migrations = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  for (const file of migrations.slice(0, 5)) await pg.exec(fs.readFileSync("supabase/migrations/" + file, "utf8"));
  const historical = await fixture();
  const old = await scalar("insert into generation_jobs(owner_user_id,project_id,request_id,input_snapshot) values($1,$2,$3,$4) returning id as value", [historical.owner, historical.project, randomUUID(), snapshot]);
  const oldClaim = await scalar("insert into generation_jobs(owner_user_id,project_id,request_id,input_snapshot) values($1,$2,$3,$4) returning id as value", [historical.owner, historical.project, randomUUID(), snapshot]);
  await claim(oldClaim);
  let busyMigration;
  try { await pg.exec(fs.readFileSync("supabase/migrations/" + migrations[5], "utf8")); } catch (error) { busyMigration = error; }
  await pg.exec("rollback");
  check("migration refuses to strand previously active jobs", !!busyMigration && busyMigration.message.includes("Wait for existing generation jobs"));
  await fail(oldClaim);
  await q("update generation_jobs set status='failed',error_code='PROCESSING_FAILED',error_message='This generation couldn’t be completed. Your saved project is still available.' where id=$1", [old]);
  await pg.exec(fs.readFileSync("supabase/migrations/" + migrations[5], "utf8"));
  check("migration backfills existing user exactly two, no retrocharge", (await account(historical)).free_total === 2 && (await account(historical)).free_reserved === 0);
  check("historical terminal jobs retain identity/state", (await job(old)).accounting_version === 0 && (await job(oldClaim)).status === "failed");
  check("historical unreserved dispatch cannot continue", await scalar("select public.reserve_generation_dispatch($1) as value", [old]) === 0);
  check("historical duplicate claim remains terminal without retrocharge", await claim(old) === "terminal" && (await job(old)).status === "failed");
  check("historical failure retry does not change allowance", !(await fail(oldClaim)) && (await account(historical)).free_reserved === 0);

  const f = await fixture(), b = await fixture();
  check("new app user initializes exactly two lifetime entitlements and zero credits", (await account(f)).free_total === 2 && (await account(f)).credit_available === 0);
  const request = randomUUID(), first = await admit(f, snapshot, request, 999);
  const firstRow = await job(first.job_id);
  check("eligible request chooses free even when trusted cost supplied", (await reservation(first.job_id)).kind === "free");
  check("first reservation: one available plus one held", (await account(f)).free_reserved === 1 && (await account(f)).free_consumed === 0);
  check("reservation and job commit together", first.code === "ACCEPTED" && firstRow.accounting_version === 1 && firstRow.status === "queued");
  await q("insert into app_users(clerk_user_id,first_name) select clerk_user_id,'Profile sync' from app_users where id=$1 on conflict(clerk_user_id) do update set first_name=excluded.first_name", [f.owner]);
  check("profile upsert/login does not reset initialized allowance", (await account(f)).free_reserved === 1 && (await account(f)).free_total === 2);
  const duplicate = await admit(f, snapshot, request);
  check("duplicate request returns exact job and one reservation", duplicate.job_id === first.job_id && (await account(f)).free_reserved === 1);
  check("same UUID changed snapshot conflicts without balance change", (await admit(f, { ...snapshot, prompt: "Changed" }, request)).code === "CONFLICT" && (await account(f)).free_reserved === 1);
  check("B cannot admit against A project", (await admit({ owner: b.owner, project: f.project })).code === "NOT_FOUND" && (await account(f)).free_reserved === 1);
  check("queued job cannot settle", !(await complete(resultArgs(firstRow))));
  await rendering(first.job_id);
  await denied("direct completion without result cannot consume", "update generation_jobs set status='completed',current_stage=null where id=$1", [first.job_id], "service_role");
  check("wrong run cannot settle or release another claim", !(await complete(resultArgs(firstRow, "foreign-run"))) && !(await fail(first.job_id, "foreign-run")));
  await denied("foreign/noncanonical output key rejected atomically", "select public.complete_generation_with_result($1,'fixture-run','foreign','video/mp4',100,'etag')", [first.job_id], "service_role");
  check("failed output proof leaves job active and allowance held", (await job(first.job_id)).status === "processing" && (await reservation(first.job_id)).state === "reserved");
  const receipt = resultArgs(firstRow);
  check("verified fixture receipt completes and consumes atomically", await complete(receipt) && (await job(first.job_id)).status === "completed" && (await reservation(first.job_id)).state === "consumed" && (await account(f)).free_consumed === 1 && (await account(f)).free_reserved === 0);
  check("duplicate success returns same outcome without second consumption", await complete(receipt) && (await account(f)).free_consumed === 1);
  check("mismatched duplicate receipt not accepted", !(await complete([...receipt.slice(0, 5), "different-etag"])));
  check("failure after successful result cannot restore", !(await fail(first.job_id)) && (await account(f)).free_consumed === 1);
  check("same settled request never charges again", (await admit(f, snapshot, request)).job_id === first.job_id && (await account(f)).free_consumed === 1);
  const lastRequest = randomUUID();
  const competing = await Promise.all([admit(f, snapshot, lastRequest), admit(f), admit(f, snapshot, lastRequest)]);
  check("competing last-allowance submissions admit one logical job", competing.filter((r) => r.code === "ACCEPTED").length === 2 && competing[0].job_id === competing[2].job_id && competing[1].code === "PAID_ACCESS_UNAVAILABLE" && (await account(f)).free_reserved === 1);
  const second = competing[0];
  await rendering(second.job_id);
  await complete(resultArgs(await job(second.job_id)));
  check("second valid result consumes final entitlement", (await account(f)).free_consumed === 2 && (await account(f)).free_reserved === 0);
  await q("insert into app_users(clerk_user_id,first_name) select clerk_user_id,'Another login' from app_users where id=$1 on conflict(clerk_user_id) do update set first_name=excluded.first_name", [f.owner]);
  check("subsequent login/profile sync cannot reset consumed lifetime allowance", (await account(f)).free_consumed === 2 && (await account(f)).free_reserved === 0);
  const beforeThird = await scalar("select count(*)::int as value from generation_jobs where owner_user_id=$1", [f.owner]);
  check("third free request rejected without job", (await admit(f)).code === "PAID_ACCESS_UNAVAILABLE" && await scalar("select count(*)::int as value from generation_jobs where owner_user_id=$1", [f.owner]) === beforeThird);
  check("free allowance never enters credit ledger", await scalar("select count(*)::int as value from credit_ledger where owner_user_id=$1", [f.owner]) === 0);

  const failure = await fixture(), failed = await admit(failure);
  await claim(failed.job_id);
  check("worker failure restores exact free hold atomically", await fail(failed.job_id) && (await account(failure)).free_reserved === 0 && (await account(failure)).free_consumed === 0 && (await reservation(failed.job_id)).state === "released");
  check("duplicate failure cannot restore twice", !(await fail(failed.job_id)) && (await account(failure)).free_reserved === 0);
  check("duplicate event cannot execute released job", await claim(failed.job_id, "duplicate") === "terminal");
  check("failed request retry returns original released outcome", (await admit(failure, snapshot, (await job(failed.job_id)).request_id)).job_id === failed.job_id && (await account(failure)).free_reserved === 0);
  const queued = await admit(failure);
  await q("update generation_jobs set status='failed',error_code='PROCESSING_FAILED',error_message='This generation couldn’t be completed. Your saved project is still available.' where id=$1", [queued.job_id]);
  check("terminal pre-production dispatch failure releases queued hold", (await reservation(queued.job_id)).state === "released" && (await account(failure)).free_reserved === 0);
  const pending = await admit(failure);
  await scalar("select public.reserve_generation_dispatch($1) as value", [pending.job_id]);
  await scalar("select public.acknowledge_generation_dispatch($1,1,false) as value", [pending.job_id]);
  check("temporary send outage preserves recoverable job and reservation", (await job(pending.job_id)).status === "queued" && (await reservation(pending.job_id)).state === "reserved" && (await account(failure)).free_reserved === 1);
  await claim(pending.job_id);
  await pg.exec("alter table generation_jobs disable trigger generation_jobs_dispatch_guard");
  await q("update generation_jobs set worker_started_at=now()-interval '16 minutes' where id=$1", [pending.job_id]);
  await pg.exec("alter table generation_jobs enable trigger generation_jobs_dispatch_guard");
  check("stale claim recovery restores reservation", await scalar("select public.expire_generation_claims() as value") === 1 && (await account(failure)).free_reserved === 0);
  check("repeated stale recovery restores nothing", await scalar("select public.expire_generation_claims() as value") === 0);

  // Isolated administrator funding fixture only. No application operation can
  // mint credits; these arbitrary units are not prices or purchased balances.
  const paid = await fixture();
  await q("update generation_accounts set credit_available=1000 where owner_user_id=$1", [paid.owner]);
  const longer = { ...snapshot, settings: { ...snapshot.settings, duration: "15" } };
  check("longer generation without approved cost does not reserve", (await admit(paid, longer)).code === "PAID_ACCESS_UNAVAILABLE" && (await account(paid)).free_reserved === 0);
  for (const amount of [0, -1, 9007199254740992]) check("invalid trusted cost rejected: " + amount, (await admit(paid, longer, randomUUID(), amount)).code === "INVALID_COST");
  check("insufficient available credits rejects without hold", (await admit(paid, longer, randomUUID(), 1001)).code === "INSUFFICIENT_CREDITS" && (await account(paid)).credit_available === 1000);
  const paidRequest = randomUUID(), creditJob = await admit(paid, longer, paidRequest, 300);
  check("paid reservation moves exact units available to reserved", (await account(paid)).credit_available === 700 && (await account(paid)).credit_reserved === 300 && (await reservation(creditJob.job_id)).amount === 300);
  check("paid retry does not recalculate or reserve twice", (await admit(paid, longer, paidRequest, 900)).job_id === creditJob.job_id && (await account(paid)).credit_reserved === 300);
  await rendering(creditJob.job_id);
  const paidReceipt = resultArgs(await job(creditJob.job_id));
  await Promise.all([complete(paidReceipt), complete(paidReceipt)]);
  check("paid completion consumes reserved units once", (await account(paid)).credit_available === 700 && (await account(paid)).credit_reserved === 0);
  const ledger = await q("select * from credit_ledger where job_id=$1 order by created_at,id", [creditJob.job_id]);
  check("paid hold and consumption have immutable traceable movement history", ledger.length === 2 && ledger.some((r) => r.type === "reservation" && r.available_delta === -300 && r.reserved_delta === 300) && ledger.some((r) => r.type === "consumption" && r.available_delta === 0 && r.reserved_delta === -300) && ledger.every((r) => r.owner_user_id === paid.owner && r.amount === 300 && r.reason && r.reference_key && r.created_at));
  const creditFail = await admit(paid, longer, randomUUID(), 200);
  await claim(creditFail.job_id);
  await fail(creditFail.job_id);
  await fail(creditFail.job_id);
  check("paid failure restores exact hold once with one release record", (await account(paid)).credit_available === 700 && (await account(paid)).credit_reserved === 0 && await scalar("select count(*)::int as value from credit_ledger where job_id=$1 and type='release'", [creditFail.job_id]) === 1);
  check("credit ledger deltas reconcile to fixture starting balance", Number(await scalar("select 1000+sum(available_delta) as value from credit_ledger where owner_user_id=$1", [paid.owner])) === (await account(paid)).credit_available);
  const paidRace = await Promise.all([admit(paid, longer, randomUUID(), 500), admit(paid, longer, randomUUID(), 500)]);
  check("competing paid reservations cannot overspend", paidRace.filter((r) => r.code === "ACCEPTED").length === 1 && (await account(paid)).credit_available === 200 && (await account(paid)).credit_reserved === 500);
  await claim(paidRace.find((r) => r.code === "ACCEPTED").job_id);
  await fail(paidRace.find((r) => r.code === "ACCEPTED").job_id);

  // Force a downstream SQL fault to prove admission and terminal settlement
  // roll back their job, account, reservation and receipt/ledger together.
  await pg.exec("create function public.fixture_reject_ledger() returns trigger language plpgsql as $$ begin raise exception 'isolated fixture fault'; end $$; create trigger fixture_reject_ledger before insert on credit_ledger for each row execute function public.fixture_reject_ledger();");
  const rollbackRequest = randomUUID();
  await denied("admission ledger failure rolls back", "select public.admit_generation($1,$2,$3,$4,100)", [paid.owner, paid.project, rollbackRequest, longer], "service_role");
  check("failed admission leaves no job or lost credits", await scalar("select count(*)::int as value from generation_jobs where request_id=$1", [rollbackRequest]) === 0 && (await account(paid)).credit_available === 700 && (await account(paid)).credit_reserved === 0);
  await pg.exec("drop trigger fixture_reject_ledger on credit_ledger");
  const rollbackJob = await admit(paid, longer, rollbackRequest, 100);
  await rendering(rollbackJob.job_id);
  await pg.exec("create trigger fixture_reject_ledger before insert on credit_ledger for each row execute function public.fixture_reject_ledger()");
  await denied("settlement ledger failure rolls back success and receipt", "select public.complete_generation_with_result($1,$2,$3,$4,$5,$6)", resultArgs(await job(rollbackJob.job_id)), "service_role");
  check("settlement fault preserves active hold and no receipt", (await job(rollbackJob.job_id)).status === "processing" && (await reservation(rollbackJob.job_id)).state === "reserved" && await scalar("select count(*)::int as value from generation_result_receipts where job_id=$1", [rollbackJob.job_id]) === 0);
  await denied("failed restoration transaction remains recoverable", "update generation_jobs set status='failed',error_code='PROCESSING_FAILED',error_message='This generation couldn’t be completed. Your saved project is still available.' where id=$1", [rollbackJob.job_id], "service_role");
  check("restoration fault does not lose hold or mark failed", (await job(rollbackJob.job_id)).status === "processing" && (await account(paid)).credit_reserved === 100);
  await pg.exec("drop trigger fixture_reject_ledger on credit_ledger; drop function public.fixture_reject_ledger();");
  await q("update generation_jobs set status='failed',error_code='PROCESSING_FAILED',error_message='This generation couldn’t be completed. Your saved project is still available.' where id=$1", [rollbackJob.job_id]);
  check("restoration safely retries after transient database failure", (await account(paid)).credit_available === 700 && (await account(paid)).credit_reserved === 0);

  const noReservationRequest = randomUUID();
  await denied("deferred constraint rejects job without reservation even for table owner", "insert into generation_jobs(owner_user_id,project_id,request_id,input_snapshot) values($1,$2,$3,$4)", [b.owner, b.project, noReservationRequest, snapshot]);
  check("orphan job insertion rolled back", await scalar("select count(*)::int as value from generation_jobs where request_id=$1", [noReservationRequest]) === 0);
  await denied("accounting version cannot change", "update generation_jobs set accounting_version=0 where id=$1", [first.job_id]);
  await denied("entitlement cannot exceed lifetime cap", "update generation_accounts set free_consumed=3 where owner_user_id=$1", [b.owner]);
  await denied("negative paid balance refused", "update generation_accounts set credit_available=-1 where owner_user_id=$1", [b.owner]);
  await denied("ledger immutable even to table owner", "update credit_ledger set amount=1 where job_id=$1", [creditJob.job_id]);
  await denied("ledger cannot be deleted even by table owner", "delete from credit_ledger where job_id=$1", [creditJob.job_id]);
  await denied("receipt cannot be changed", "update generation_result_receipts set verified_etag='changed' where job_id=$1", [first.job_id]);
  await denied("settled reservation cannot change outcome", "update generation_reservations set state='released',reason='generation_failed' where job_id=$1", [first.job_id]);
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const table of ["generation_accounts", "generation_reservations", "credit_ledger", "generation_result_receipts"]) {
      if (role !== "service_role") await denied(role + " cannot read " + table, "select * from " + table, [], role);
      const assignments = { generation_accounts: "free_reserved=0", generation_reservations: "state='released'", credit_ledger: "amount=1", generation_result_receipts: "verified_etag='fake'" };
      await denied(role + " cannot mutate " + table, `update ${table} set ${assignments[table]}`, [], role);
      await denied(role + " cannot delete " + table, "delete from " + table, [], role);
    }
    await denied(role + " cannot insert unreserved job", "insert into generation_jobs(owner_user_id,project_id,request_id,input_snapshot) values($1,$2,$3,$4)", [b.owner, b.project, randomUUID(), snapshot], role);
    if (role !== "service_role") {
      await denied(role + " cannot invoke admission for foreign user", "select public.admit_generation($1,$2,$3,$4,1)", [f.owner, f.project, randomUUID(), snapshot], role);
      await denied(role + " cannot consume or restore foreign job", "select public.complete_generation_with_result($1,$2,$3,$4,$5,$6)", receipt, role);
      await denied(role + " cannot fail/restore another claim", "select public.fail_generation_claim($1,'fixture-run')", [first.job_id], role);
    }
  }
  await denied("service role cannot bypass claim accounting wrapper", "select public.claim_generation_job_before_accounting($1,'bypass')", [first.job_id], "service_role");
  check("all accounting tables enforce RLS", (await q("select relrowsecurity from pg_class where oid in ('generation_accounts'::regclass,'generation_reservations'::regclass,'credit_ledger'::regclass,'generation_result_receipts'::regclass)")).every((r) => r.relrowsecurity));
  check("all free counters reconcile to immutable per-job outcomes", await scalar("select count(*)::int as value from generation_accounts a where a.free_reserved <> (select count(*) from generation_reservations r where r.owner_user_id=a.owner_user_id and r.kind='free' and r.state='reserved') or a.free_consumed <> (select count(*) from generation_reservations r where r.owner_user_id=a.owner_user_id and r.kind='free' and r.state='consumed')") === 0);

  // Exercise actual TypeScript completion adapter, mocking only storage and
  // transport. Fixture receipt above is not real generated/stored content.
  const adapterFixture = await fixture(), adapterJob = await admit(adapterFixture);
  await rendering(adapterJob.job_id, "adapter-run");
  let storage = { status: "missing" }, inspections = 0;
  const adapterDatabase = {
    from() {
      const filters = {};
      return { select() { return this; }, eq(key, value) { filters[key] = value; return this; }, async maybeSingle() {
        const row = await job(filters.id);
        return { data: row?.worker_run_id === filters.worker_run_id ? row : null, error: null };
      } };
    },
    async rpc(name, args) {
      assert.equal(name, "complete_generation_with_result");
      return { data: await complete([args.p_job_id,args.p_run_id,args.p_storage_key,args.p_mime_type,args.p_size_bytes,args.p_etag]), error: null };
    },
  };
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/accounting/settlement.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: loaded, exports: loaded.exports, require(name) {
      if (name === "server-only") return {};
      if (name === "@/lib/db/server") return { createDatabaseClient: () => adapterDatabase };
      if (name === "@/lib/storage/server") return { verifyStoredMedia: async (key, mime, size) => { inspections++; assert.equal(key, `users/${adapterFixture.owner}/generations/${adapterJob.job_id}/result.mp4`); assert.equal(mime,"video/mp4"); assert.equal(size,100); return storage; } };
      return require(name);
    },
  });
  const settle = loaded.exports.completeStoredGeneration;
  const adapterInput = { jobId: adapterJob.job_id, runId: "adapter-run", mimeType: "video/mp4", sizeBytes: 100 };
  check("adapter refuses foreign run before storage lookup", !(await settle({ ...adapterInput, runId: "foreign" })) && inspections === 0);
  check("missing object cannot settle", !(await settle(adapterInput)) && (await account(adapterFixture)).free_reserved === 1);
  storage = { status: "rejected" };
  check("mismatched storage/signature cannot settle", !(await settle(adapterInput)) && (await job(adapterJob.job_id)).status === "processing");
  await assert.rejects(() => settle({ ...adapterInput, owner: b.owner }));
  check("adapter rejects injected owner/output keys", true);
  storage = { status: "verified", etag: '"fixture-etag"' };
  check("verified storage adapter reaches atomic success boundary", await settle(adapterInput) && (await account(adapterFixture)).free_consumed === 1);
  check("adapter retry consumes once", await settle(adapterInput) && (await account(adapterFixture)).free_consumed === 1);
  console.log(JSON.stringify({ passed: checks.length, scope: "isolated SQL and actual server adapter; storage/auth fixtures; multi-session hosted contention separate", checks }, null, 2));
} finally { await pg.close(); }
